from __future__ import annotations

import math
import os
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from pydantic import BaseModel, field_validator
from sqlalchemy import case, desc, func, or_
from sqlalchemy.orm import Session

from .models import (
    SL_TZ_OFFSET,
    TIMEOUT_MINUTES,
    PRESET_DELAY_REASONS,
    DepartmentEnum,
    DepartmentLog,
    JobCard,
    DeliveryTypeEnum,
    PriorityEnum,
    StageStatusEnum,
    get_db,
    init_db,
    run_migration,
)

from .routers import history as history_router
from .schemas import JobCardOut, _out, _str


# ─────────────────────────────────────────────
# App setup
# ─────────────────────────────────────────────

app = FastAPI(
    title="i Lab Gampaha – Production Tracker API",
    version="4.1.0",
    docs_url="/api/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()
    run_migration()


app.include_router(history_router.router)


# ─────────────────────────────────────────────
# Static Frontend (FIXED)
# ─────────────────────────────────────────────

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")
ASSETS_DIR = os.path.join(DIST_DIR, "assets")

print(f"BASE_DIR: {BASE_DIR}")
print(f"DIST_DIR: {DIST_DIR}")
print(f"DIST exists: {os.path.isdir(DIST_DIR)}")


if os.path.isdir(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/")
def serve_index():
    index_path = os.path.join(DIST_DIR, "index.html")
    if not os.path.exists(index_path):
        raise HTTPException(status_code=404, detail="Frontend not built")
    return FileResponse(index_path)


# SPA fallback (IMPORTANT for React routing)
@app.get("/{full_path:path}")
def spa_fallback(full_path: str):
    file_path = os.path.join(DIST_DIR, full_path)

    if os.path.exists(file_path) and os.path.isfile(file_path):
        return FileResponse(file_path)

    index_path = os.path.join(DIST_DIR, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)

    raise HTTPException(status_code=404, detail="Not found")


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

COMPLETED_VISIBLE_HOURS = 24
EXPIRING_SOON_HOURS = 20


def _24h_cutoff():
    return datetime.utcnow() - timedelta(hours=COMPLETED_VISIBLE_HOURS)


def _expiring_cutoff():
    return datetime.utcnow() - timedelta(hours=EXPIRING_SOON_HOURS)


def _job_or_404(job_id: int, db: Session):
    job = db.query(JobCard).filter(JobCard.id == job_id).first()
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return job


def _urgent_first():
    return case((JobCard.priority == PriorityEnum.URGENT, 0), else_=1)


# ─────────────────────────────────────────────
# Schemas (minimal shown)
# ─────────────────────────────────────────────

class JobCardCreate(BaseModel):
    job_no: str
    customer: str
    dele_date: datetime
    priority: PriorityEnum = PriorityEnum.NORMAL
    delivery_type: DeliveryTypeEnum = DeliveryTypeEnum.PRONTO
    payment_by: Optional[str] = None

    @field_validator("job_no")
    @classmethod
    def no_empty(cls, v):
        if not v.strip():
            raise ValueError("job_no must not be blank")
        return v.strip()


class JobCardUpdate(BaseModel):
    couple_name: Optional[str] = None


class PaymentUpdate(BaseModel):
    payment_by: str


# ─────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────

@app.post("/api/jobs", response_model=JobCardOut)
def create_job(payload: JobCardCreate, db: Session = Depends(get_db)):
    if db.query(JobCard).filter(JobCard.job_no == payload.job_no).first():
        raise HTTPException(409, "Job number already exists")

    job = JobCard(
        job_no=payload.job_no,
        customer=payload.customer,
        dele_date=payload.dele_date,
        priority=payload.priority,
        delivery_type=payload.delivery_type,
        payment_by=(payload.payment_by or "").title() or None,
        status_printing=StageStatusEnum.PENDING,
        status_laminating=StageStatusEnum.PENDING,
        status_laser_cutting=StageStatusEnum.PENDING,
        status_binding=StageStatusEnum.PENDING,
    )

    db.add(job)
    db.commit()
    db.refresh(job)
    return _out(job, db)


@app.get("/api/jobs", response_model=List[JobCardOut])
def list_jobs(completed: bool = False, db: Session = Depends(get_db)):
    q = db.query(JobCard).filter(JobCard.is_fully_completed == completed)

    if completed:
        q = q.filter(JobCard.completed_at >= _24h_cutoff())

    return [_out(j, db) for j in q.order_by(_urgent_first()).all()]


@app.get("/api/jobs/{job_id}", response_model=JobCardOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    return _out(_job_or_404(job_id, db), db)


@app.patch("/api/jobs/{job_id}/payment", response_model=JobCardOut)
def update_payment(job_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)

    name = payload.payment_by.strip()
    if not name:
        raise HTTPException(400, "Payment name cannot be empty")

    job.payment_by = name.title()
    job.payment_updated_at = datetime.utcnow()

    db.commit()
    db.refresh(job)
    return _out(job, db)


@app.delete("/api/jobs/{job_id}")
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)

    db.delete(job)
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "time": datetime.utcnow().isoformat()}