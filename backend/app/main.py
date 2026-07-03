from __future__ import annotations

import math
import os
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import Depends, FastAPI, HTTPException,Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, field_validator
from sqlalchemy import case, desc, func, or_
from sqlalchemy.orm import Session
from .models import SL_TZ_OFFSET

from .models import (
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
# from .routers import analytics as analytics_router

from .schemas import (
    DepartmentLogOut,
    JobCardOut,
    _out,
    _str,
    _refresh_delays,
)

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

COMPLETED_VISIBLE_HOURS = 24
EXPIRING_SOON_HOURS     = 20

# ── Schemas ───────────────────────────────────────────────────────────
class JobCardCreate(BaseModel):
    job_no:           str
    customer:         str
    couple_name:      Optional[str] = None
    order_no:         Optional[str] = None
    dele_date:        datetime
    priority:         PriorityEnum     = PriorityEnum.NORMAL
    delivery_type:    DeliveryTypeEnum = DeliveryTypeEnum.PRONTO
    special_note:     Optional[str] = None
    print_size:       Optional[str] = None
    print_pages:      Optional[str] = None
    laser_cover_type: Optional[str] = None
    laminate_type:    Optional[str] = None
    bind_rexing_no:   Optional[str] = None
    box_type:         Optional[str] = None
    payment_by: Optional[str] = None
    @field_validator("job_no")
    @classmethod
    def no_empty(cls, v):
        if not v.strip():
            raise ValueError("job_no must not be blank")
        return v.strip()
    
app.include_router(history_router.router)
# app.include_router(analytics_router.router)


class StageAdvanceRequest(BaseModel):
    action:        str
    operator_name: Optional[str] = None
    under_whom:    Optional[str] = None
    machine:       Optional[str] = None   
    box_pouch_status:  Optional[str] = None
    is_story:      Optional[bool] = None 
    is_rebind:     Optional[bool] = None 

class DelayReasonRequest(BaseModel):
    reason: str


class StatsOut(BaseModel):
    total_jobs: int
    active_jobs: int
    completed_jobs: int
    delayed_jobs: int
    urgent_pending: int
    expiring_soon: int


class JobCardUpdate(BaseModel):
    couple_name:      Optional[str] = None
    order_no:         Optional[str] = None
    dele_date:        Optional[datetime] = None
    priority:         Optional[PriorityEnum] = None
    delivery_type:    Optional[DeliveryTypeEnum] = None
    special_note:     Optional[str] = None
    print_size:       Optional[str] = None
    print_pages:      Optional[str] = None
    laser_cover_type: Optional[str] = None
    laminate_type:    Optional[str] = None
    bind_rexing_no:   Optional[str] = None
    box_type:         Optional[str] = None
    payment_by:       Optional[str] = None

# ── Helpers ───────────────────────────────────────────────────────────
DEPT_FIELD = {
    "PRINTING":      "status_printing",
    "LAMINATING":    "status_laminating",
    "LASER_CUTTING": "status_laser_cutting",
    "BINDING":       "status_binding",
}


def _24h_cutoff() -> datetime:
    return datetime.utcnow() - timedelta(hours=COMPLETED_VISIBLE_HOURS)

def _expiring_cutoff() -> datetime:
    return datetime.utcnow() - timedelta(hours=EXPIRING_SOON_HOURS)

def _open_log(job: JobCard, dept_enum: DepartmentEnum, db: Session):
    db.add(DepartmentLog(
        job_id=job.id, department=dept_enum,
        entered_at=datetime.utcnow(), is_delayed=False,
    ))
    db.commit()

def _close_log(job: JobCard, dept_enum: DepartmentEnum, db: Session):
    now = datetime.utcnow()
    log = (
        db.query(DepartmentLog)
        .filter(
            DepartmentLog.job_id     == job.id,
            DepartmentLog.department == dept_enum,
            DepartmentLog.exited_at  == None,  # noqa
        )
        .order_by(desc(DepartmentLog.entered_at))
        .first()
    )
    if log:
        log.exited_at        = now #type:igoner
        minutes              = math.ceil((now - log.entered_at).total_seconds() / 60)
        log.duration_minutes = minutes
        log.is_delayed       = minutes > TIMEOUT_MINUTES.get(_str(dept_enum), 9999)
    db.commit()

def _check_full_completion(job: JobCard, db: Session):
    lam_ok   = _str(job.status_laminating)    == "COMPLETED"
    laser_ok = _str(job.status_laser_cutting) in ("COMPLETED", "SKIPPED")
    bind_ok  = _str(job.status_binding)       == "COMPLETED"
    if lam_ok and laser_ok and bind_ok:
        job.is_fully_completed = True #type:igoner
        job.completed_at = datetime.utcnow()#type:igoner
        db.commit()

def _job_or_404(job_id: int, db: Session) -> JobCard:
    job = db.query(JobCard).filter(JobCard.id == job_id).first()
    if not job:
        raise HTTPException(404, f"Job {job_id} not found")
    return job


def _urgent_first():
    return case((JobCard.priority == PriorityEnum.URGENT, 0), else_=1)


# ── Routes ────────────────────────────────────────────────────────────

@app.post("/api/jobs", response_model=JobCardOut, status_code=201)
def create_job(payload: JobCardCreate, db: Session = Depends(get_db)):
    if db.query(JobCard).filter(JobCard.job_no == payload.job_no).first():
        raise HTTPException(409, f"Job number '{payload.job_no}' already exists")

    has_laser    = bool(payload.laser_cover_type and payload.laser_cover_type.strip())
    laser_status = StageStatusEnum.PENDING if has_laser else StageStatusEnum.SKIPPED
    payment_name = (payload.payment_by or "").strip() #type:ignore

    job = JobCard(
        job_no           = payload.job_no,
        customer         = payload.customer,
        couple_name      = payload.couple_name,
        order_no         = payload.order_no,
        dele_date        = payload.dele_date,
        priority         = payload.priority,
        delivery_type    = payload.delivery_type,
        special_note     = payload.special_note,
        print_size       = payload.print_size,
        print_pages      = payload.print_pages,
        laser_cover_type = payload.laser_cover_type,
        laminate_type    = payload.laminate_type,
        bind_rexing_no   = payload.bind_rexing_no,
        box_type         = payload.box_type,
        payment_by         = payment_name.title() if payment_name else None,   # ← NEW
        payment_updated_at = datetime.utcnow() if payment_name else None,       # ← NEW
        status_printing      = StageStatusEnum.PENDING,
        status_laminating    = StageStatusEnum.PENDING,
        status_laser_cutting = laser_status,
        status_binding       = StageStatusEnum.PENDING,
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return _out(job, db)

@app.patch("/api/jobs/{job_id}", response_model=JobCardOut)
def update_job(job_id: int, payload: JobCardUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    in_production = any([
        _str(job.status_printing)      != "PENDING",
        _str(job.status_laminating)    != "PENDING",
        _str(job.status_binding)       != "PENDING",
        _str(job.status_laser_cutting) not in ("PENDING", "SKIPPED"),
    ])
    if in_production:
        raise HTTPException(403, "Job is already in production and cannot be edited.")

    if (datetime.utcnow() - job.created_at) > timedelta(minutes=4):
        raise HTTPException(403, "Edit window has expired. Job can no longer be edited.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return _out(job, db)

@app.get("/api/jobs", response_model=List[JobCardOut])
def list_jobs(completed: bool = False, db: Session = Depends(get_db)):
    q = db.query(JobCard).filter(JobCard.is_fully_completed == completed)
    if completed:
        q = q.filter(JobCard.completed_at >= _24h_cutoff())  
    return [_out(j, db) for j in q.order_by(_urgent_first(), JobCard.dele_date.asc()).all()]


@app.get("/api/jobs/{job_id}", response_model=JobCardOut)
def get_job(job_id: int, db: Session = Depends(get_db)):
    return _out(_job_or_404(job_id, db), db)


@app.delete("/api/jobs/{job_id}", status_code=204)
def delete_job(job_id: int, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)

    in_production = any([
        _str(job.status_printing)      != "PENDING",
        _str(job.status_laminating)    != "PENDING",
        _str(job.status_binding)       != "PENDING",
        _str(job.status_laser_cutting) not in ("PENDING", "SKIPPED"),
    ])
    if in_production:
        raise HTTPException(403, "Job is already in production and cannot be deleted.")

    if (datetime.utcnow() - job.created_at) > timedelta(minutes=4):#type: ignore
        raise HTTPException(403, "Edit window has expired. Job can no longer be deleted.")

    db.delete(job)
    db.commit()

class PaymentUpdate(BaseModel):
    payment_by: str


@app.patch("/api/jobs/{job_id}/payment", response_model=JobCardOut)
def update_payment(job_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    name = payload.payment_by.strip()
    if not name:
        raise HTTPException(400, "Payment taken by cannot be empty.")
    # No production/time-window checks — payment can be recorded any time,
    # even after the job is fully completed.
    job.payment_by = name.title()
    job.payment_updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return _out(job, db)

class BoxPouchUpdate(BaseModel):
    box_pouch_status: str

@app.patch("/api/jobs/{job_id}/box-pouch", response_model=JobCardOut)
def update_box_pouch(job_id: int, payload: BoxPouchUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    status = payload.box_pouch_status.strip().upper()
    if status not in ("COMPLETE", "PROCESSING", "NOT_NEEDED"):
        raise HTTPException(400, "box_pouch_status must be COMPLETE, PROCESSING, or NOT_NEEDED")
    job.box_pouch_status = status
    db.commit()
    db.refresh(job)
    return _out(job, db)


@app.get("/api/payment/known-names")
def get_known_payment_names(db: Session = Depends(get_db)):
    rows = (
        db.query(JobCard.payment_by)
        .filter(JobCard.payment_by.isnot(None), JobCard.payment_by != "")
        .distinct()
        .all()
    )
    names = sorted({r[0].strip().title() for r in rows if r[0]})
    return {"names": names}


@app.post("/api/jobs/{job_id}/advance/{department}", response_model=JobCardOut)
def advance(
    job_id: int, department: str,
    body: StageAdvanceRequest,
    db: Session = Depends(get_db),
):
    dept = department.upper()
    if dept not in DEPT_FIELD:
        raise HTTPException(400, f"Unknown department: {department}")

    job       = _job_or_404(job_id, db)
    field     = DEPT_FIELD[dept]
    current   = _str(getattr(job, field))
    action    = body.action.lower()
    dept_enum = DepartmentEnum[dept]

    if current == "SKIPPED":
        raise HTTPException(409, f"{dept} is SKIPPED for this job.")
    if dept == "BINDING" and not job.binding_unlocked:
        raise HTTPException(409, "Binding locked until Laminating AND Laser Cutting are complete.")
    if dept == "LAMINATING" and _str(job.status_printing) != "COMPLETED":
        raise HTTPException(409, "Laminating cannot start until Printing is complete.")

    if action == "start":
        if current != "PENDING":
            raise HTTPException(409, f"{dept} is {current}. Cannot start again.")
        
        if dept == "PRINTING" and not (body.machine or "").strip():
            raise HTTPException(400, "Machine (Green 2 / Green 3) is required to start Printing.")
        
        if dept == "LAMINATING" and not (body.operator_name or "").strip():
            raise HTTPException(400, "Accubind by is required to start Laminating.")

        setattr(job, field, StageStatusEnum.IN_PROGRESS)
        _open_log(job, dept_enum, db)

        # ── Store operator identity ──────────────────────      

        if dept in ("PRINTING", "LASER_CUTTING", "LAMINATING") and body.operator_name:
            log = (
                db.query(DepartmentLog)
                .filter(
                    DepartmentLog.job_id     == job.id,
                    DepartmentLog.department == dept_enum,
                    DepartmentLog.exited_at  == None,  # noqa
                )
                .order_by(desc(DepartmentLog.entered_at))
                .first()
            )
            if log:
                log.operator_name = body.operator_name.strip().title() #type:ignore
                if dept == "PRINTING" and body.under_whom:
                    log.under_whom = body.under_whom.strip().title() #type:ignore
                if dept == "PRINTING" and body.machine:
                    log.machine = body.machine.strip().upper() #type:ignore
                if dept == "PRINTING":                          
                    log.is_story  = bool(body.is_story) #type:ignore         
                    log.is_rebind = bool(body.is_rebind)#type:ignore
                
                db.commit()
    elif action == "complete":
        if current != "IN_PROGRESS":
            raise HTTPException(409, f"{dept} must be IN_PROGRESS to complete (currently {current}).")

        if dept == "BINDING":
            bp = (body.box_pouch_status or "").strip().upper()
            if bp not in ("COMPLETE", "PROCESSING", "NOT_NEEDED"):
                raise HTTPException(400, "Please specify whether Box/Pouch is complete, still processing, or not needed.")
            job.box_pouch_status = bp

        setattr(job, field, StageStatusEnum.COMPLETED)
        _close_log(job, dept_enum, db)
        _check_full_completion(job, db)
    else:
        raise HTTPException(400, "action must be 'start' or 'complete'")

    job.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return _out(job, db)


@app.post("/api/jobs/{job_id}/delay-reason/{department}", response_model=JobCardOut)
def set_delay_reason(
    job_id: int, department: str,
    body: DelayReasonRequest,
    db: Session = Depends(get_db),
):
    dept = department.upper()
    if dept not in DEPT_FIELD:
        raise HTTPException(400, f"Unknown department: {department}")
    if not body.reason.strip():
        raise HTTPException(400, "Reason cannot be empty.")

    job       = _job_or_404(job_id, db)
    dept_enum = DepartmentEnum[dept]

    log = (
        db.query(DepartmentLog)
        .filter(
            DepartmentLog.job_id     == job.id,
            DepartmentLog.department == dept_enum,
            DepartmentLog.exited_at  == None,  # noqa
        )
        .order_by(desc(DepartmentLog.entered_at))
        .first()
    )
    if not log:
        raise HTTPException(404, f"No active log found for {dept} on job {job_id}.")

    log.delay_reason    = body.reason.strip()
    log.delay_reason_at = datetime.utcnow()
    db.commit()
    db.refresh(job)
    return _out(job, db)


@app.get("/api/delay-reasons/{department}")
def get_preset_reasons(department: str):
    dept    = department.upper()
    reasons = PRESET_DELAY_REASONS.get(dept)
    if reasons is None:
        raise HTTPException(400, f"Unknown department: {department}")
    return {"department": dept, "reasons": reasons}


@app.get("/api/station/{department}/queue", response_model=List[JobCardOut])
def station_queue(department: str, db: Session = Depends(get_db)):
    dept = department.upper()
    if dept not in DEPT_FIELD:
        raise HTTPException(400, f"Unknown department: {department}")

    field  = DEPT_FIELD[dept]
    active = [StageStatusEnum.PENDING, StageStatusEnum.IN_PROGRESS]

    q = db.query(JobCard).filter(
        JobCard.is_fully_completed == False,  # noqa
        getattr(JobCard, field).in_(active),
    )
    if dept == "LAMINATING":
        q = q.filter(JobCard.status_printing == StageStatusEnum.COMPLETED)
    if dept == "BINDING":
        q = q.filter(
            JobCard.status_laminating    == StageStatusEnum.COMPLETED,
            JobCard.status_laser_cutting.in_([StageStatusEnum.COMPLETED, StageStatusEnum.SKIPPED]),
        )

    return [_out(j, db) for j in q.order_by(_urgent_first(), JobCard.dele_date.asc()).all()]

@app.get("/api/station/{department}/history", response_model=dict)
def station_history(
    department: str,
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="job_no / customer / couple_name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    dept = department.upper()

    if dept == "ENTRY":
        q = db.query(JobCard)
        order_col = JobCard.created_at
    else:
        if dept not in DEPT_FIELD:
            raise HTTPException(400, f"Unknown department: {department}")
        field = DEPT_FIELD[dept]
        q = db.query(JobCard).filter(getattr(JobCard, field) == StageStatusEnum.COMPLETED)
        order_col = JobCard.updated_at

    # ── Reset daily: only today's completions, Sri Lanka calendar day ──
    utc_now   = datetime.utcnow()
    sl_now    = utc_now + SL_TZ_OFFSET
    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)
    q = q.filter(order_col >= day_start, order_col < day_end)

    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            JobCard.job_no.ilike(term),
            JobCard.customer.ilike(term),
            JobCard.couple_name.ilike(term),
        ))

    total = q.count()
    jobs = (
        q.order_by(desc(order_col))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "jobs": [_out(j, db).model_dump() for j in jobs],
    }


@app.get("/api/stats", response_model=StatsOut)
def get_stats(db: Session = Depends(get_db)):
    total = db.query(func.count(JobCard.id)).scalar() or 0

    completed = (
        db.query(func.count(JobCard.id))
        .filter(JobCard.is_fully_completed == True, JobCard.completed_at >= _24h_cutoff())
        .scalar() or 0
    )
    expiring_soon = (
        db.query(func.count(JobCard.id))
        .filter(
            JobCard.is_fully_completed == True,
            JobCard.completed_at >= _24h_cutoff(),
            JobCard.completed_at <  _expiring_cutoff(),
        ).scalar() or 0
    )
    delayed_ids = (
        db.query(DepartmentLog.job_id)
        .filter(DepartmentLog.is_delayed == True, DepartmentLog.exited_at == None)  # noqa
        .distinct().all()
    )
    urgent_pending = (
        db.query(func.count(JobCard.id))
        .filter(JobCard.priority == PriorityEnum.URGENT, JobCard.is_fully_completed == False)  # noqa
        .scalar() or 0
    )
    active = (
        db.query(func.count(JobCard.id))
        .filter(JobCard.is_fully_completed == False).scalar() or 0  # noqa
    )

    return StatsOut(
        total_jobs=total, active_jobs=active, completed_jobs=completed,
        delayed_jobs=len(delayed_ids), urgent_pending=urgent_pending,
        expiring_soon=expiring_soon,
    )

@app.get("/api/stats/departments")
def get_dept_stats(db: Session = Depends(get_db)):
    # Always derive "now" from UTC, then shift into Sri Lanka time.
    # This makes the result identical whether the server is your local
    # machine or a Railway container — both store/compare in UTC.
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET

    # Sri Lanka day window, expressed back in UTC for the DB query
    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)

    # Sri Lanka month window, expressed back in UTC for the DB query
    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    # THIS MONTH's per-department completed count — now correctly resets
    rows = (
        db.query(DepartmentLog.department, func.count(DepartmentLog.id))
        .filter(
            DepartmentLog.exited_at != None,
            DepartmentLog.exited_at >= month_start,
            DepartmentLog.exited_at <  month_end,
        )
        .group_by(DepartmentLog.department)
        .all()
    )
    result = {str(r[0]).split(".")[-1]: r[1] for r in rows}

    # TODAY's per-department completed count (daily)
    daily_rows = (
        db.query(DepartmentLog.department, func.count(DepartmentLog.id))
        .filter(
            DepartmentLog.exited_at != None,
            DepartmentLog.exited_at >= day_start,
            DepartmentLog.exited_at <  day_end,
        )
        .group_by(DepartmentLog.department)
        .all()
    )
    daily = {str(r[0]).split(".")[-1]: r[1] for r in daily_rows}

    # Entry count today — Sri Lanka calendar day, not host machine's date
    entry_count = (
        db.query(func.count(JobCard.id))
        .filter(
            JobCard.created_at >= day_start,
            JobCard.created_at <  day_end,
        )
        .scalar() or 0
    )
    daily["ENTRY"] = entry_count

    # ── Per-machine breakdown for PRINTING ──────────────
    machine_monthly_rows = (
        db.query(DepartmentLog.machine, func.count(DepartmentLog.id))
        .filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.machine.isnot(None),
            DepartmentLog.exited_at != None,
            DepartmentLog.exited_at >= month_start,
            DepartmentLog.exited_at <  month_end,
        )
        .group_by(DepartmentLog.machine)
        .all()
    )
    machine_daily_rows = (
        db.query(DepartmentLog.machine, func.count(DepartmentLog.id))
        .filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.machine.isnot(None),
            DepartmentLog.exited_at != None,
            DepartmentLog.exited_at >= day_start,
            DepartmentLog.exited_at <  day_end,
        )
        .group_by(DepartmentLog.machine)
        .all()
    )
    machines = {
        "monthly": {r[0]: r[1] for r in machine_monthly_rows},
        "daily":   {r[0]: r[1] for r in machine_daily_rows},
    }

    return {"monthly": result, "daily": daily, "machines": machines}


@app.get("/api/stats/printing-section")
def printing_section_stats(db: Session = Depends(get_db)):
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET

    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)

    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    def counts_for(start, end):
        base_q = db.query(DepartmentLog).filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.exited_at != None,
            DepartmentLog.exited_at >= start,
            DepartmentLog.exited_at <  end,
        )
        raw_total = base_q.count()
        story  = base_q.filter(
            DepartmentLog.is_story  == True,    # noqa
            DepartmentLog.is_rebind == False,   # noqa
        ).count()
        rebind = base_q.filter(DepartmentLog.is_rebind == True).count()   # noqa
        normal = base_q.filter(
            DepartmentLog.is_story  == False,   # noqa
            DepartmentLog.is_rebind == False,   # noqa
        ).count()
        return {
            "raw_total": raw_total,
            "normal":    normal,
            "story":     story,
            "rebind":    rebind,
        }

    return {
        "monthly": counts_for(month_start, month_end),
        "daily":   counts_for(day_start, day_end),
    }

@app.get("/api/stats/operators")
def operator_stats(
    db:    Session = Depends(get_db),
    year:  int = Query(...),
    month: int = Query(...),
):
    # Sri Lanka is UTC+5:30 — shift the window back by 5h30m
    # so "June 2026" in LK time maps correctly to UTC stored timestamps
    from datetime import timezone
    TZ_OFFSET = timedelta(hours=5, minutes=30)

    start = datetime(year, month, 1) - TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - TZ_OFFSET

    rows = (
        db.query(
            DepartmentLog.department,
            DepartmentLog.operator_name,
            DepartmentLog.under_whom,
            func.count(DepartmentLog.id).label("count"),
        )
        .filter(
            DepartmentLog.department.in_([
                DepartmentEnum.PRINTING,
                DepartmentEnum.LASER_CUTTING,
            ]),
            DepartmentLog.operator_name.isnot(None),
            DepartmentLog.operator_name != "",
            DepartmentLog.entered_at >= start,
            DepartmentLog.entered_at <  end,
        )
        .group_by(
            DepartmentLog.department,
            DepartmentLog.operator_name,
            DepartmentLog.under_whom,
        )
        .all()
    )

    result = {"PRINTING": [], "LASER_CUTTING": []}
    for r in rows:
        dept_key = str(r.department).split(".")[-1]
        result[dept_key].append({
            "operator_name": r.operator_name,
            "under_whom":    r.under_whom,
            "count":         r.count,
        })
    return result


@app.get("/api/operators/known")
def get_known_operators(
    dept: str = Query(...),
    db:   Session = Depends(get_db),
):
    rows = (
        db.query(DepartmentLog.operator_name)
        .filter(
            DepartmentLog.department    == dept.upper(),
            DepartmentLog.operator_name.isnot(None),   # ← fix
            DepartmentLog.operator_name != "",          # ← fix
        )
        .distinct()
        .all()
    )
    names = sorted({r[0].strip().title() for r in rows if r[0]})
    return {"names": names}


@app.get("/api/stats/albums")
def album_stats(
    db:    Session = Depends(get_db),
    year:  int = Query(...),
    month: int = Query(...),
):
    TZ_OFFSET = timedelta(hours=5, minutes=30)
    start = datetime(year, month, 1) - TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - TZ_OFFSET

    count = (
        db.query(func.count(JobCard.id))
        .filter(
            JobCard.is_fully_completed == True,
            JobCard.completed_at >= start,
            JobCard.completed_at <  end,
        ).scalar() or 0
    )
    return {"year": year, "month": month, "total": count}

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "i Lab Gampaha", "time": datetime.utcnow().isoformat()}


# ── Static SPA ────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DIST_DIR = os.path.join(BASE_DIR, "frontend", "dist")

ASSETS_DIR = os.path.join(DIST_DIR, "assets")
if os.path.isdir(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
@app.get("/")
def serve_index():
    return FileResponse(os.path.join(DIST_DIR, "index.html"))

if not os.path.exists(DIST_DIR):
    print("❌ DIST folder not found! Build frontend first.")
else:
    print("✅ Frontend dist found")
# Debug: print the path so we can see it in logs
print(f"BASE_DIR: {BASE_DIR}")
print(f"DIST_DIR: {DIST_DIR}")
print(f"DIST exists: {os.path.isdir(DIST_DIR)}")
print(f"assets exists: {os.path.isdir(os.path.join(DIST_DIR, 'assets'))}")


    

@app.get("/ilab_icon.jpg")
def icon():
    f = os.path.join(DIST_DIR, "ilab_icon.jpg")
    return FileResponse(f) if os.path.exists(f) else HTTPException(404)

@app.get("/favicon.svg")
def favicon():
    f = os.path.join(DIST_DIR, "favicon.svg")
    return FileResponse(f) if os.path.exists(f) else HTTPException(404)

@app.get("/icons.svg")
def icons():
    f = os.path.join(DIST_DIR, "icons.svg")
    return FileResponse(f) if os.path.exists(f) else HTTPException(404)

@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    index = os.path.join(DIST_DIR, "index.html")
    if not os.path.exists(index):
        raise HTTPException(404, "Frontend not built.")
    return FileResponse(index)