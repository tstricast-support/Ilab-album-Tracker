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
    PaperPrice,          
    DamageEntry,          
    DamageDeptEnum,
    PaperStock,          
    PaperPacketLog,        
    PaperUsageEntry,        
    PAPER_SIZES,              
    LOW_STOCK_THRESHOLD,
    ThankYouCard
)
from .routers import history as history_router
# from .routers import analytics as analytics_router

from .schemas import (
    DepartmentLogOut,
    JobCardOut,
    _out,
    _str,
    _refresh_delays,
    PaperPriceOut,     
    DamageEntryOut,
    PaperStockOut,          
    PaperPacketLogOut,         
    PaperUsageEntryOut, 
    ThankYouCardOut
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
    laminated_by:  Optional[str] = None 

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
        log.exited_at        = now #type:ignore
        minutes              = math.ceil((now - log.entered_at).total_seconds() / 60)
        log.duration_minutes = minutes
        log.is_delayed       = minutes > TIMEOUT_MINUTES.get(_str(dept_enum), 9999)
    db.commit()

def _check_full_completion(job: JobCard, db: Session):
    lam_ok   = _str(job.status_laminating)    == "COMPLETED"
    laser_ok = _str(job.status_laser_cutting) in ("COMPLETED", "SKIPPED")
    bind_ok  = _str(job.status_binding)       == "COMPLETED"
    if lam_ok and laser_ok and bind_ok:
        job.is_fully_completed = True #type:ignore
        job.completed_at = datetime.utcnow()#type:ignore
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

    if (datetime.utcnow() - job.created_at) > timedelta(minutes=4): #type:ignore 
        raise HTTPException(403, "Edit window has expired. Job can no longer be edited.")
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    job.updated_at = datetime.utcnow() #type:ignore 
    db.commit()
    db.refresh(job)
    return _out(job, db)

@app.get("/api/jobs/search")
def search_jobs(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    term = f"%{q.strip()}%"
    rows = (
        db.query(JobCard)
        .filter(or_(
            JobCard.job_no.ilike(term),
            JobCard.customer.ilike(term),
            JobCard.couple_name.ilike(term),
        ))
        .order_by(desc(JobCard.created_at))
        .limit(10)
        .all()
    )
    return {"jobs": [_out(j, db).model_dump() for j in rows]}

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

# ── Paper Prices ──────────────────────────────────────────────────────

@app.get("/api/paper-prices", response_model=List[PaperPriceOut])
def list_paper_prices(db: Session = Depends(get_db)):
    rows = db.query(PaperPrice).order_by(PaperPrice.size, PaperPrice.side_type).all()
    return rows


class PaperPriceUpdate(BaseModel):
    unit_price: int


@app.patch("/api/paper-prices/{price_id}", response_model=PaperPriceOut)
def update_paper_price(price_id: int, payload: PaperPriceUpdate, db: Session = Depends(get_db)):
    row = db.query(PaperPrice).filter(PaperPrice.id == price_id).first()
    if not row:
        raise HTTPException(404, "Paper price not found")
    if payload.unit_price < 0:
        raise HTTPException(400, "Price cannot be negative")
    row.unit_price = payload.unit_price #type:ignore
    db.commit()
    db.refresh(row)
    return row


# ── Damage Entries ────────────────────────────────────────────────────

DAMAGE_EDIT_WINDOW_HOURS = 24


def _damage_out(entry: DamageEntry) -> DamageEntryOut:
    return DamageEntryOut(
        id=entry.id, #type:ignore 
        department=_str(entry.department),
        paper_price_id=entry.paper_price_id, #type:ignore 
        paper_label=entry.paper_price.label if entry.paper_price else "—",
        job_no=entry.job_no,#type:ignore 
        customer=entry.customer,#type:ignore 
        operator_name=entry.operator_name, #type:ignore 
        reason=entry.reason, #type:ignore 
        quantity=entry.quantity, #type:ignore  
        other_item=entry.other_item, #type:ignore
        unit_price_snapshot=entry.unit_price_snapshot, #type:ignore 
        total_value=entry.total_value, #type:ignore 
        created_at=entry.created_at, #type:ignore 
        updated_at=entry.updated_at, #type:ignore 
    )


class DamageCreate(BaseModel):
    department: str
    paper_price_id: int
    job_no: Optional[str] = None
    customer: Optional[str] = None
    operator_name: str
    reason: str
    quantity: int
    other_item: Optional[str] = None     
    actual_value: Optional[int] = None



@app.post("/api/damages", response_model=DamageEntryOut, status_code=201)
def create_damage(payload: DamageCreate, db: Session = Depends(get_db)):
    dept = payload.department.upper()
    if dept not in ("PRINTING", "LAMINATING", "BINDING"):
        raise HTTPException(400, "department must be PRINTING, LAMINATING, or BINDING")
    if payload.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than 0")
    if not payload.operator_name.strip():
        raise HTTPException(400, "Operator name is required")
    if not payload.reason.strip():
        raise HTTPException(400, "Reason is required")

    price = db.query(PaperPrice).filter(PaperPrice.id == payload.paper_price_id).first()
    if not price:
        raise HTTPException(404, "Paper price not found")

    is_other = price.size == "OTHER"
    other_item = None

    if is_other:
        other_item = (payload.other_item or "").strip()
        if not other_item:
            raise HTTPException(400, "Please describe the damaged item")
        if payload.actual_value is None or payload.actual_value < 0:
            raise HTTPException(400, "Actual value is required and cannot be negative")
        unit_price_snapshot = payload.actual_value
        total_value = payload.actual_value
        quantity = 1
    else:
        unit_price_snapshot = price.unit_price
        total_value = price.unit_price * payload.quantity
        quantity = payload.quantity

    entry = DamageEntry(
        department=DamageDeptEnum[dept],
        paper_price_id=price.id,
        job_no=(payload.job_no or "").strip() or None,
        customer=(payload.customer or "").strip() or None,
        operator_name=payload.operator_name.strip().title(),
        reason=payload.reason.strip(),
        quantity=quantity,
        other_item=other_item,
        unit_price_snapshot=unit_price_snapshot,
        total_value=total_value,
    )

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return _damage_out(entry)


@app.get("/api/damages", response_model=dict)
def list_damages(
    db: Session = Depends(get_db),
    department: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="YYYY-MM-DD, Sri Lanka calendar day"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    q = db.query(DamageEntry)
    if department:
        dept = department.upper()
        if dept not in ("PRINTING", "LAMINATING", "BINDING"):
            raise HTTPException(400, "Unknown department")
        q = q.filter(DamageEntry.department == DamageDeptEnum[dept])

    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d") - SL_TZ_OFFSET
        day_end   = day_start + timedelta(days=1)
        q = q.filter(DamageEntry.created_at >= day_start, DamageEntry.created_at < day_end)

    total = q.count()
    sum_value, sum_qty = q.with_entities(
        func.coalesce(func.sum(DamageEntry.total_value), 0),
        func.coalesce(func.sum(DamageEntry.quantity), 0),
    ).one()

    rows = (
        q.order_by(desc(DamageEntry.created_at))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "day_total_value": int(sum_value),
        "day_total_quantity": int(sum_qty),
        "entries": [_damage_out(e).model_dump() for e in rows],
    }

@app.get("/api/damages/dates-with-entries")
def damage_dates_with_entries(
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(...),
    department: Optional[str] = Query(None),
):
    start = datetime(year, month, 1) - SL_TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - SL_TZ_OFFSET

    q = db.query(DamageEntry.created_at, func.count(DamageEntry.id).label("cnt"))
    if department:
        dept = department.upper()
        if dept not in ("PRINTING", "LAMINATING", "BINDING"):
            raise HTTPException(400, "Unknown department")
        q = q.filter(DamageEntry.department == DamageDeptEnum[dept])

    rows = (
        q.filter(DamageEntry.created_at >= start, DamageEntry.created_at < end)
         .group_by(DamageEntry.created_at)
         .all()
    )

    day_counts: dict[str, int] = {}
    for r in rows:
        lk_date = r.created_at + SL_TZ_OFFSET
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + r.cnt
    return day_counts

# main.py — insert AFTER station_history_dates(), BEFORE @app.get("/api/stats")

# ── Admin: Date Correction ────────────────────────────────────────────
class DateCorrectionRequest(BaseModel):
    department: str
    new_date: str

_DEPT_LOG_ENUM = {
    "PRINTING":      DepartmentEnum.PRINTING,
    "LAMINATING":    DepartmentEnum.LAMINATING,
    "LASER_CUTTING": DepartmentEnum.LASER_CUTTING,
    "BINDING":       DepartmentEnum.BINDING,
}

def _sl_date(dt: datetime) -> str:
    return (dt + SL_TZ_OFFSET).strftime("%Y-%m-%d")

def _shift_to_new_date(dt: datetime, new_date_str: str) -> datetime:
    sl_dt = dt + SL_TZ_OFFSET
    y, m, d = map(int, new_date_str.split("-"))
    shifted_sl = datetime(y, m, d, sl_dt.hour, sl_dt.minute, sl_dt.second, sl_dt.microsecond)
    return shifted_sl - SL_TZ_OFFSET


@app.get("/api/admin/jobs/{job_id}/timeline")
def admin_job_timeline(job_id: int, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    logs = (
        db.query(DepartmentLog)
        .filter(DepartmentLog.job_id == job.id)
        .order_by(DepartmentLog.entered_at)
        .all()
    )
    return {
        "id": job.id,
        "job_no": job.job_no,
        "customer": job.customer,
        "created_at": job.created_at,
        "created_date_sl": _sl_date(job.created_at),
        "completed_at": job.completed_at,
        "completed_date_sl": _sl_date(job.completed_at) if job.completed_at else None,  #type:ignore
        "is_fully_completed": job.is_fully_completed,
        "logs": [
            {
                "id": l.id,
                "department": _str(l.department),
                "entered_at": l.entered_at,
                "exited_at": l.exited_at,
                "entered_date_sl": _sl_date(l.entered_at),
                "exited_date_sl": _sl_date(l.exited_at) if l.exited_at else None,  #type:ignore
                "duration_minutes": l.duration_minutes,
                "machine": l.machine,
                "operator_name": l.operator_name,
            }
            for l in logs
        ],
    }


@app.patch("/api/admin/jobs/{job_id}/date-correction", response_model=JobCardOut)
def admin_fix_date(job_id: int, payload: DateCorrectionRequest, db: Session = Depends(get_db)):
    job  = _job_or_404(job_id, db)
    dept = payload.department.upper()

    try:
        datetime.strptime(payload.new_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(400, "new_date must be in YYYY-MM-DD format")

    if dept == "ENTRY":
        old_date = _sl_date(job.created_at)  #type:ignore
        job.created_at = _shift_to_new_date(job.created_at, payload.new_date)  #type:ignore
        if _sl_date(job.updated_at) == old_date:  #type:ignore
            job.updated_at = _shift_to_new_date(job.updated_at, payload.new_date)  #type:ignore

    elif dept in _DEPT_LOG_ENUM:
        log = (
            db.query(DepartmentLog)
            .filter(DepartmentLog.job_id == job.id, DepartmentLog.department == _DEPT_LOG_ENUM[dept])
            .order_by(desc(DepartmentLog.entered_at))
            .first()
        )
        if not log:
            raise HTTPException(404, f"No {dept} log found for this job.")
        if not log.exited_at:  #type:ignore
            raise HTTPException(400, f"{dept} is not yet completed for this job — nothing to correct.")

        old_exit_date = _sl_date(log.exited_at)  #type:ignore

        log.entered_at = _shift_to_new_date(log.entered_at, payload.new_date)  #type:ignore
        log.exited_at  = _shift_to_new_date(log.exited_at, payload.new_date)   #type:ignore

        if _sl_date(job.updated_at) == old_exit_date:  #type:ignore
            job.updated_at = log.exited_at  #type:ignore

        if job.completed_at and _sl_date(job.completed_at) == old_exit_date:  #type:ignore
            job.completed_at = _shift_to_new_date(job.completed_at, payload.new_date)  #type:ignore
    else:
        raise HTTPException(400, f"Unknown department: {dept}")

    db.commit()
    db.refresh(job)
    return _out(job, db)

class DamageUpdate(BaseModel):
    paper_price_id: Optional[int] = None
    job_no: Optional[str] = None
    customer: Optional[str] = None
    operator_name: Optional[str] = None
    reason: Optional[str] = None
    quantity: Optional[int] = None
    other_item: Optional[str] = None      
    actual_value: Optional[int] = None


def _damage_or_404(damage_id: int, db: Session) -> DamageEntry:
    entry = db.query(DamageEntry).filter(DamageEntry.id == damage_id).first()
    if not entry:
        raise HTTPException(404, f"Damage entry {damage_id} not found")
    return entry


def _check_damage_editable(entry: DamageEntry):
    if (datetime.utcnow() - entry.created_at) > timedelta(hours=DAMAGE_EDIT_WINDOW_HOURS): #type:ignore 
        raise HTTPException(403, "Edit window has expired. This entry can no longer be changed.")


@app.patch("/api/damages/{damage_id}", response_model=DamageEntryOut)
def update_damage(damage_id: int, payload: DamageUpdate, db: Session = Depends(get_db)):
    entry = _damage_or_404(damage_id, db)
    _check_damage_editable(entry)

    if payload.paper_price_id is not None:
        price = db.query(PaperPrice).filter(PaperPrice.id == payload.paper_price_id).first()
        if not price:
            raise HTTPException(404, "Paper price not found")
        entry.paper_price_id = price.id
        if price.size != "OTHER":
            entry.unit_price_snapshot = price.unit_price

    current_price = db.query(PaperPrice).filter(PaperPrice.id == entry.paper_price_id).first()
    is_other = bool(current_price and current_price.size == "OTHER")

    if payload.job_no is not None:
        entry.job_no = payload.job_no.strip() or None

    if payload.customer is not None:
        entry.customer = payload.customer.strip() or None

    if payload.operator_name is not None:
        if not payload.operator_name.strip():
            raise HTTPException(400, "Operator name cannot be empty")
        entry.operator_name = payload.operator_name.strip().title()

    if payload.reason is not None:
        if not payload.reason.strip():
            raise HTTPException(400, "Reason cannot be empty")
        entry.reason = payload.reason.strip()

    if is_other:
        if payload.other_item is not None:
            if not payload.other_item.strip():
                raise HTTPException(400, "Please describe the damaged item")
            entry.other_item = payload.other_item.strip()
        if payload.actual_value is not None:
            if payload.actual_value < 0:
                raise HTTPException(400, "Actual value cannot be negative")
            entry.unit_price_snapshot = payload.actual_value
        entry.quantity = 1
    else:
        entry.other_item = None
        if payload.quantity is not None:
            if payload.quantity <= 0:
                raise HTTPException(400, "Quantity must be greater than 0")
            entry.quantity = payload.quantity

    entry.total_value = entry.unit_price_snapshot * entry.quantity
    entry.updated_at = datetime.utcnow()
    db.commit()                # ← the actual bug fix
    db.refresh(entry)
    return _damage_out(entry)

@app.delete("/api/damages/{damage_id}", status_code=204)
def delete_damage(damage_id: int, db: Session = Depends(get_db)):
    entry = _damage_or_404(damage_id, db)
    _check_damage_editable(entry)
    db.delete(entry)
    db.commit()


@app.get("/api/damages/known-operators")
def get_known_damage_operators(
    department: str = Query(...),
    db: Session = Depends(get_db),
):
    dept = department.upper()
    if dept not in ("PRINTING", "LAMINATING", "BINDING"):
        raise HTTPException(400, "Unknown department")
    rows = (
        db.query(DamageEntry.operator_name)
        .filter(DamageEntry.department == DamageDeptEnum[dept])
        .distinct()
        .all()
    )
    names = sorted({r[0].strip().title() for r in rows if r[0]})
    return {"names": names}


@app.get("/api/stats/damages")
def damage_stats(db: Session = Depends(get_db)):
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET
    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)
    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    def summary_for(start, end):
        q = db.query(DamageEntry).filter(
            DamageEntry.created_at >= start, DamageEntry.created_at < end,
        )
        entries = q.all()
        total_value = sum(e.total_value for e in entries)
        total_qty   = sum(e.quantity for e in entries)
        by_dept: dict[str, dict] = {}
        for e in entries:
            key = _str(e.department)
            by_dept.setdefault(key, {"quantity": 0, "value": 0, "by_size": {}})
            by_dept[key]["quantity"] += e.quantity
            by_dept[key]["value"]    += e.total_value

            size_key = e.paper_price.size if e.paper_price else "Unknown"
            by_dept[key]["by_size"].setdefault(size_key, {"quantity": 0, "value": 0})
            by_dept[key]["by_size"][size_key]["quantity"] += e.quantity
            by_dept[key]["by_size"][size_key]["value"]    += e.total_value

        return {"total_value": total_value, "total_quantity": total_qty, "by_department": by_dept}

    return {
        "monthly": summary_for(month_start, month_end),
        "daily":   summary_for(day_start, day_end),
    }

@app.patch("/api/jobs/{job_id}/payment", response_model=JobCardOut)
def update_payment(job_id: int, payload: PaymentUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    name = payload.payment_by.strip()
    if not name:
        raise HTTPException(400, "Payment taken by cannot be empty.")
    # No production/time-window checks — payment can be recorded any time,
    # even after the job is fully completed.
    job.payment_by = name.title() #type:ignore 
    job.payment_updated_at = datetime.utcnow() #type:ignore 
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
    job.box_pouch_status = status #type:ignore 
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

class AlbumTypeUpdate(BaseModel):
    album_type: str  # NORMAL / STORY / REBIND

@app.patch("/api/jobs/{job_id}/album-type", response_model=JobCardOut)
def update_album_type(job_id: int, payload: AlbumTypeUpdate, db: Session = Depends(get_db)):
    job = _job_or_404(job_id, db)
    val = payload.album_type.strip().upper()
    if val not in ("NORMAL", "STORY", "REBIND"):
        raise HTTPException(400, "album_type must be NORMAL, STORY, or REBIND")
    job.album_type = val #type:ignore 
    db.commit()
    db.refresh(job)
    return _out(job, db)


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
            raise HTTPException(400, "Machine (Green 2 / Green 3 /Epson) is required to start Printing.")
        
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
            job.box_pouch_status = bp #type:ignore

        if dept == "LAMINATING":
            finisher = (body.laminated_by or "").strip()
            if not finisher:
                raise HTTPException(400, "Please specify who is laminating this before completing.")
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
                log.laminated_by = finisher.title() #type:ignore 

        setattr(job, field, StageStatusEnum.COMPLETED)
        _close_log(job, dept_enum, db)
        _check_full_completion(job, db)
    else:
        raise HTTPException(400, "action must be 'start' or 'complete'")

    job.updated_at = datetime.utcnow() #type:ignore 
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

    log.delay_reason    = body.reason.strip() #type:ignore 
    log.delay_reason_at = datetime.utcnow() #type:ignore 
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
    search: Optional[str] = Query(
        None,
        description="job_no / customer / couple_name"
    ),
    date: Optional[str] = Query(
        None,
        description="YYYY-MM-DD, Sri Lanka day. Omit for today."
    ),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    dept = department.upper()

    
    if dept == "ENTRY":
        q = db.query(JobCard)
        order_col = JobCard.created_at

    
    else:
        if dept not in DEPT_FIELD:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown department: {department}"
            )

        dept_enum = DepartmentEnum[dept]

        q = (
            db.query(JobCard)
            .join(
                DepartmentLog,
                DepartmentLog.job_id == JobCard.id
            )
            .filter(
                DepartmentLog.department == dept_enum,
                DepartmentLog.exited_at.isnot(None),
            )
        )

        order_col = DepartmentLog.exited_at

    
    if date:
        try:
            selected_date = datetime.strptime(
                date,
                "%Y-%m-%d"
            )
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail="Invalid date format. Use YYYY-MM-DD."
            )

        day_start = selected_date - SL_TZ_OFFSET

    else:
        utc_now = datetime.utcnow()
        sl_now = utc_now + SL_TZ_OFFSET

        day_start = (
            datetime(
                sl_now.year,
                sl_now.month,
                sl_now.day
            )
            - SL_TZ_OFFSET
        )

    day_end = day_start + timedelta(days=1)

    q = q.filter(
        order_col >= day_start,
        order_col < day_end
    )

    
    if search and search.strip():
        term = f"%{search.strip()}%"

        q = q.filter(
            or_(
                JobCard.job_no.ilike(term),
                JobCard.customer.ilike(term),
                JobCard.couple_name.ilike(term),
            )
        )

    
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
        "jobs": [
            _out(job, db).model_dump()
            for job in jobs
        ],
    }

@app.get("/api/station/{department}/history/dates-with-entries")
def station_history_dates(
    department: str,
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(...),
):
    dept = department.upper()

  
    if dept == "ENTRY":
        col = JobCard.created_at

        q = db.query(
            col,
            func.count(JobCard.id).label("cnt")
        )

    
    else:
        if dept not in DEPT_FIELD:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown department: {department}"
            )

        dept_enum = DepartmentEnum[dept]

        col = DepartmentLog.exited_at

        q = (
            db.query(
                col,
                func.count(DepartmentLog.id).label("cnt")
            )
            .filter(
                DepartmentLog.department == dept_enum,
                DepartmentLog.exited_at.isnot(None),
            )
        )

   
    start = (
        datetime(year, month, 1)
        - SL_TZ_OFFSET
    )

    if month == 12:
        next_month = datetime(year + 1, 1, 1)
    else:
        next_month = datetime(year, month + 1, 1)

    end = next_month - SL_TZ_OFFSET

   
    rows = (
        q.filter(
            col >= start,
            col < end
        )
        .group_by(col)
        .all()
    )

    
    day_counts: dict[str, int] = {}

    for dt, cnt in rows:
        lk_date = dt + SL_TZ_OFFSET
        day_key = str(lk_date.day)

        day_counts[day_key] = (
            day_counts.get(day_key, 0) + cnt
        )

    return day_counts

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

    # Entry count this month — Sri Lanka calendar month
    entry_count_monthly = (
        db.query(func.count(JobCard.id))
        .filter(
            JobCard.created_at >= month_start,
            JobCard.created_at <  month_end,
        )
        .scalar() or 0
    )
    result["ENTRY"] = entry_count_monthly

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

    # ── Pending-print backlog: entered but printing not yet started ──
    pending_print_count = (
        db.query(func.count(JobCard.id))
        .filter(
            JobCard.status_printing == StageStatusEnum.PENDING,
            JobCard.is_fully_completed == False,  # noqa
        )
        .scalar() or 0
    )

    return {
        "monthly": result, "daily": daily, "machines": machines,
        "pending_print_count": pending_print_count,
    }

@app.get("/api/stats/pending-print-jobs")
def pending_print_jobs(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    q = db.query(JobCard).filter(
        JobCard.status_printing == StageStatusEnum.PENDING,
        JobCard.is_fully_completed == False,  # noqa
    )
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            JobCard.job_no.ilike(term),
            JobCard.customer.ilike(term),
            JobCard.couple_name.ilike(term),
        ))
    q = q.order_by(_urgent_first(), JobCard.created_at.asc())
    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "jobs": [_out(j, db).model_dump() for j in rows],
    }

_ALBUM_DEPTS = ("ENTRY", "PRINTING", "LAMINATING", "BINDING")

def _album_counts_for(db, dept, start, end):
    if dept == "ENTRY":
        rows = (
            db.query(JobCard.album_type, func.count(JobCard.id))
            .filter(JobCard.created_at >= start, JobCard.created_at < end)
            .group_by(JobCard.album_type)
            .all()
        )
    else:
        dept_enum = DepartmentEnum[dept]
        rows = (
            db.query(JobCard.album_type, func.count(DepartmentLog.id))
            .join(DepartmentLog, DepartmentLog.job_id == JobCard.id)
            .filter(
                DepartmentLog.department == dept_enum,
                DepartmentLog.exited_at.isnot(None),
                DepartmentLog.exited_at >= start,
                DepartmentLog.exited_at < end,
            )
            .group_by(JobCard.album_type)
            .all()
        )
    result = {"NORMAL": 0, "STORY": 0, "REBIND": 0}
    for album_type, cnt in rows:
        key = album_type if album_type in ("STORY", "REBIND") else "NORMAL"
        result[key] += cnt
    return result


@app.get("/api/stats/album-breakdown")
def album_breakdown_stats(
    dept: str = Query(...),
    date: Optional[str] = Query(None, description="YYYY-MM-DD, Sri Lanka day. Omit for today."),
    db: Session = Depends(get_db),
):
    dept = dept.upper()
    if dept not in _ALBUM_DEPTS:
        raise HTTPException(400, f"Unknown department: {dept}")

    if date:
        sel = datetime.strptime(date, "%Y-%m-%d")
    else:
        sel = datetime.utcnow() + SL_TZ_OFFSET

    day_start = datetime(sel.year, sel.month, sel.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)
    month_start = datetime(sel.year, sel.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sel.year + 1, 1, 1) if sel.month == 12
        else datetime(sel.year, sel.month + 1, 1)
    ) - SL_TZ_OFFSET

    return {
        "selected_date": sel.strftime("%Y-%m-%d"),
        "daily":   _album_counts_for(db, dept, day_start, day_end),
        "monthly": _album_counts_for(db, dept, month_start, month_end),
    }


@app.get("/api/stats/album-breakdown/dates-with-entries")
def album_breakdown_dates(
    dept: str = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    db: Session = Depends(get_db),
):
    dept = dept.upper()
    if dept not in _ALBUM_DEPTS:
        raise HTTPException(400, f"Unknown department: {dept}")

    start = datetime(year, month, 1) - SL_TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - SL_TZ_OFFSET

    if dept == "ENTRY":
        rows = (
            db.query(JobCard.created_at)
            .filter(JobCard.created_at >= start, JobCard.created_at < end)
            .all()
        )
        dates = [r[0] for r in rows]
    else:
        dept_enum = DepartmentEnum[dept]
        rows = (
            db.query(DepartmentLog.exited_at)
            .filter(
                DepartmentLog.department == dept_enum,
                DepartmentLog.exited_at.isnot(None),
                DepartmentLog.exited_at >= start,
                DepartmentLog.exited_at < end,
            )
            .all()
        )
        dates = [r[0] for r in rows]

    day_counts: dict[str, int] = {}
    for dt in dates:
        lk_date = dt + SL_TZ_OFFSET
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + 1
    return day_counts


@app.get("/api/stats/album-jobs")
def album_jobs_list(
    dept: str = Query(...),
    album_type: str = Query(...),
    date: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
):
    dept = dept.upper()
    if dept not in _ALBUM_DEPTS:
        raise HTTPException(400, f"Unknown department: {dept}")

    if date:
        sel = datetime.strptime(date, "%Y-%m-%d")
    else:
        sel = datetime.utcnow() + SL_TZ_OFFSET
    day_start = datetime(sel.year, sel.month, sel.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)

    at = album_type.strip().upper()

    if dept == "ENTRY":
        q = db.query(JobCard).filter(JobCard.created_at >= day_start, JobCard.created_at < day_end)
        order_col = JobCard.created_at
    else:
        dept_enum = DepartmentEnum[dept]
        q = (
            db.query(JobCard)
            .join(DepartmentLog, DepartmentLog.job_id == JobCard.id)
            .filter(
                DepartmentLog.department == dept_enum,
                DepartmentLog.exited_at.isnot(None),
                DepartmentLog.exited_at >= day_start,
                DepartmentLog.exited_at < day_end,
            )
        )
        order_col = DepartmentLog.exited_at

    if at == "NORMAL":
        q = q.filter(or_(JobCard.album_type == "NORMAL", JobCard.album_type.is_(None)))
    else:
        q = q.filter(JobCard.album_type == at)

    q = q.order_by(desc(order_col))
    total = q.count()
    rows  = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "jobs": [_out(j, db).model_dump() for j in rows],
    }

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
        base_q = db.query(JobCard).filter(
            JobCard.created_at >= start, JobCard.created_at < end,
        )
        raw_total = base_q.count()
        story  = base_q.filter(JobCard.album_type == "STORY").count()
        rebind = base_q.filter(JobCard.album_type == "REBIND").count()
        normal = base_q.filter(
            or_(JobCard.album_type == "NORMAL", JobCard.album_type.is_(None))
        ).count()
        return {"raw_total": raw_total, "normal": normal, "story": story, "rebind": rebind}

    return {"monthly": counts_for(month_start, month_end), 
            "daily": counts_for(day_start, day_end)}

@app.get("/api/stats/printing-breakdown")
def printing_breakdown_stats(db: Session = Depends(get_db)):
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
        rows = (
            db.query(JobCard.album_type, DepartmentLog.machine, func.count(DepartmentLog.id))
            .join(DepartmentLog, DepartmentLog.job_id == JobCard.id)
            .filter(
                DepartmentLog.department == DepartmentEnum.PRINTING,
                DepartmentLog.machine.isnot(None),
                DepartmentLog.exited_at != None,
                DepartmentLog.exited_at >= start,
                DepartmentLog.exited_at < end,
            )
            .group_by(JobCard.album_type, DepartmentLog.machine)
            .all()
        )
        result = {
            "NORMAL": {"total": 0, "machines": {}},
            "STORY":  {"total": 0, "machines": {}},
            "REBIND": {"total": 0, "machines": {}},
        }
        for album_type, machine, cnt in rows:
            key = album_type if album_type in ("STORY", "REBIND") else "NORMAL"
            result[key]["total"] += cnt
            result[key]["machines"][machine] = result[key]["machines"].get(machine, 0) + cnt
        return result

    return {"daily": counts_for(day_start, day_end), "monthly": counts_for(month_start, month_end)}

@app.get("/api/stats/printing-jobs")
def printing_jobs_list(
    db: Session = Depends(get_db),
    machine: str = Query(...),
    album_type: str = Query(..., description="NORMAL / STORY / REBIND"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD, Sri Lanka day. Omit for current month."),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
):
    if date:
        start = datetime.strptime(date, "%Y-%m-%d") - SL_TZ_OFFSET
        end   = start + timedelta(days=1)
    else:
        utc_now = datetime.utcnow()
        sl_now  = utc_now + SL_TZ_OFFSET
        start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
        end   = (
            datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
            else datetime(sl_now.year, sl_now.month + 1, 1)
        ) - SL_TZ_OFFSET

    q = (
        db.query(JobCard.job_no, JobCard.customer, JobCard.couple_name)
        .join(DepartmentLog, DepartmentLog.job_id == JobCard.id)
        .filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.machine    == machine.strip().upper(),
            DepartmentLog.exited_at.isnot(None),
            DepartmentLog.exited_at >= start,
            DepartmentLog.exited_at <  end,
        )
    )
    at = album_type.strip().upper()
    if at == "NORMAL":
        q = q.filter(or_(JobCard.album_type == "NORMAL", JobCard.album_type.is_(None)))
    else:
        q = q.filter(JobCard.album_type == at)

    q = q.order_by(desc(DepartmentLog.exited_at))
    total = q.count()
    rows  = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "jobs": [
            {"job_no": r[0], "customer": r[1], "couple_name": r[2]} for r in rows
        ],
    }

@app.get("/api/stats/printing-jobs/dates-with-entries")
def printing_jobs_dates_with_entries(
    db: Session = Depends(get_db),
    machine: str = Query(...),
    album_type: str = Query(...),
    year: int = Query(...),
    month: int = Query(...),
):
    start = datetime(year, month, 1) - SL_TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - SL_TZ_OFFSET

    q = (
        db.query(DepartmentLog.exited_at, func.count(DepartmentLog.id))
        .join(JobCard, JobCard.id == DepartmentLog.job_id)
        .filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.machine    == machine.strip().upper(),
            DepartmentLog.exited_at.isnot(None),
            DepartmentLog.exited_at >= start,
            DepartmentLog.exited_at <  end,
        )
    )
    at = album_type.strip().upper()
    if at == "NORMAL":
        q = q.filter(or_(JobCard.album_type == "NORMAL", JobCard.album_type.is_(None)))
    else:
        q = q.filter(JobCard.album_type == at)

    rows = q.group_by(DepartmentLog.exited_at).all()

    day_counts: dict[str, int] = {}
    for exited_at, cnt in rows:
        lk_date = exited_at + SL_TZ_OFFSET
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + cnt
    return day_counts

@app.get("/api/stats/operators")
def operator_stats(
    db:    Session = Depends(get_db),
    year:  int = Query(...),
    month: int = Query(...),
):
    TZ_OFFSET = timedelta(hours=5, minutes=30)
    start = datetime(year, month, 1) - TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - TZ_OFFSET

    def named_counts(dept_enum, column, ts_column):
        rows = (
            db.query(column, func.count(DepartmentLog.id).label("count"))
            .filter(
                DepartmentLog.department == dept_enum,
                column.isnot(None),
                column != "",
                ts_column >= start,
                ts_column < end,
            )
            .group_by(column)
            .all()
        )
        return [{"operator_name": r[0], "under_whom": None, "count": r[1]} for r in rows]

    # ── PRINTING: operators (with loader detail) + loader totals ──
    printing_rows = (
        db.query(
            DepartmentLog.operator_name,
            DepartmentLog.under_whom,
            func.count(DepartmentLog.id).label("count"),
        )
        .filter(
            DepartmentLog.department == DepartmentEnum.PRINTING,
            DepartmentLog.operator_name.isnot(None),
            DepartmentLog.operator_name != "",
            DepartmentLog.entered_at >= start,
            DepartmentLog.entered_at < end,
        )
        .group_by(DepartmentLog.operator_name, DepartmentLog.under_whom)
        .all()
    )
    printing_operators = [
        {"operator_name": r.operator_name, "under_whom": r.under_whom, "count": r.count}
        for r in printing_rows
    ]
    printing_loaders = named_counts(DepartmentEnum.PRINTING, DepartmentLog.under_whom, DepartmentLog.entered_at)

    # ── LASER CUTTING: operators only ──
    laser_rows = (
        db.query(
            DepartmentLog.operator_name,
            DepartmentLog.under_whom,
            func.count(DepartmentLog.id).label("count"),
        )
        .filter(
            DepartmentLog.department == DepartmentEnum.LASER_CUTTING,
            DepartmentLog.operator_name.isnot(None),
            DepartmentLog.operator_name != "",
            DepartmentLog.entered_at >= start,
            DepartmentLog.entered_at < end,
        )
        .group_by(DepartmentLog.operator_name, DepartmentLog.under_whom)
        .all()
    )
    laser_operators = [
        {"operator_name": r.operator_name, "under_whom": r.under_whom, "count": r.count}
        for r in laser_rows
    ]

    # ── LAMINATING: Accubind-by (start) + Laminated-by (complete) ──
    laminating_operators = named_counts(DepartmentEnum.LAMINATING, DepartmentLog.operator_name, DepartmentLog.entered_at)
    laminating_finishers = named_counts(DepartmentEnum.LAMINATING, DepartmentLog.laminated_by, DepartmentLog.exited_at)

    return {
        "PRINTING":      {"operators": printing_operators,   "loaders": printing_loaders},
        "LAMINATING":    {"operators": laminating_operators, "finishers": laminating_finishers},
        "LASER_CUTTING": {"operators": laser_operators},
    }


@app.get("/api/stats/operator-jobs")
def operator_jobs_list(
    dept: str = Query(...),
    field: str = Query(...),   # operator_name / under_whom / laminated_by
    name: str = Query(...),
    year: int = Query(...),
    month: int = Query(...),
    page: int = Query(1, ge=1),
    page_size: int = Query(15, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        dept_enum = DepartmentEnum[dept.upper()]
    except KeyError:
        raise HTTPException(400, f"Unknown department: {dept}")

    column = getattr(DepartmentLog, field, None)
    if column is None:
        raise HTTPException(400, f"Unknown field: {field}")

    TZ_OFFSET = timedelta(hours=5, minutes=30)
    start = datetime(year, month, 1) - TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - TZ_OFFSET

    # laminated_by is captured at completion → filter/sort by exited_at.
    # operator_name / under_whom are captured at start → filter/sort by entered_at.
    ts_col = DepartmentLog.exited_at if field == "laminated_by" else DepartmentLog.entered_at

    q = (
        db.query(JobCard.job_no, JobCard.customer, JobCard.couple_name, ts_col.label("ts"))
        .join(DepartmentLog, DepartmentLog.job_id == JobCard.id)
        .filter(
            DepartmentLog.department == dept_enum,
            column == name,
            ts_col >= start,
            ts_col < end,
        )
        .order_by(desc(ts_col))
    )

    total = q.count()
    rows = q.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "jobs": [
            {"job_no": r[0], "customer": r[1], "couple_name": r[2]}
            for r in rows
        ],
    }

@app.get("/api/operators/known")
def get_known_operators(
    dept:  str = Query(...),
    field: str = Query("operator_name"),  
    db:    Session = Depends(get_db),
):
    column = getattr(DepartmentLog, field, None)
    if column is None:
        raise HTTPException(400, f"Unknown field: {field}")
    rows = (
        db.query(column)
        .filter(
            DepartmentLog.department == dept.upper(),
            column.isnot(None),
            column != "",
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

# ── Paper Stock Tracking ─────────────────────────────────────────────

PAPER_EDIT_WINDOW_HOURS = 24


def _paper_check_editable(created_at: datetime):
    if (datetime.utcnow() - created_at) > timedelta(hours=PAPER_EDIT_WINDOW_HOURS):
        raise HTTPException(403, "Edit window has expired. This entry can no longer be changed.")


def _get_stock_or_404(size: str, db: Session) -> PaperStock:
    stock = db.query(PaperStock).filter(PaperStock.size == size).first()
    if not stock:
        raise HTTPException(404, f"Unknown paper size: {size}")
    return stock


@app.get("/api/paper-stock", response_model=List[PaperStockOut])
def list_paper_stock(db: Session = Depends(get_db)):
    return db.query(PaperStock).order_by(PaperStock.size).all()


class AddPacketRequest(BaseModel):
    size: str


@app.post("/api/paper-stock/add-packet", response_model=PaperStockOut, status_code=201)
def add_paper_packet(payload: AddPacketRequest, db: Session = Depends(get_db)):
    size = payload.size.strip()
    if size not in PAPER_SIZES:
        raise HTTPException(400, f"size must be one of {PAPER_SIZES}")

    stock = _get_stock_or_404(size, db)
    stock.balance += 100   #type:ignore
    stock.updated_at = datetime.utcnow() #type:ignore

    log = PaperPacketLog(size=size, sheets_added=100)
    db.add(log)
    db.commit()
    db.refresh(stock)
    return stock


@app.get("/api/paper-packet-logs", response_model=dict)
def list_packet_logs(
    db: Session = Depends(get_db),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    q = db.query(PaperPacketLog)
    total = q.count()
    rows = (
        q.order_by(desc(PaperPacketLog.created_at))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "logs": [PaperPacketLogOut.model_validate(r).model_dump() for r in rows],
    }


class PacketLogUpdate(BaseModel):
    size: str


@app.patch("/api/paper-packet-logs/{log_id}", response_model=PaperPacketLogOut)
def update_packet_log(log_id: int, payload: PacketLogUpdate, db: Session = Depends(get_db)):
    log = db.query(PaperPacketLog).filter(PaperPacketLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Packet log not found")
    _paper_check_editable(log.created_at) #type:ignore

    new_size = payload.size.strip()
    if new_size not in PAPER_SIZES:
        raise HTTPException(400, f"size must be one of {PAPER_SIZES}")

    if new_size == log.size:
        return log

    old_stock = _get_stock_or_404(log.size, db) #type:ignore
    new_stock = _get_stock_or_404(new_size, db)

    if old_stock.balance - log.sheets_added < 0: #type:ignore
        raise HTTPException(400, f"Cannot move packet: {log.size} balance would go negative.")

    old_stock.balance -= log.sheets_added #type:ignore
    new_stock.balance += log.sheets_added #type:ignore
    old_stock.updated_at = datetime.utcnow() #type:ignore
    new_stock.updated_at = datetime.utcnow() #type:ignore

    log.size = new_size #type:ignore
    log.updated_at = datetime.utcnow() #type:ignore
    db.commit()
    db.refresh(log)
    return log


@app.delete("/api/paper-packet-logs/{log_id}", status_code=204)
def delete_packet_log(log_id: int, db: Session = Depends(get_db)):
    log = db.query(PaperPacketLog).filter(PaperPacketLog.id == log_id).first()
    if not log:
        raise HTTPException(404, "Packet log not found")
    _paper_check_editable(log.created_at) #type:ignore

    stock = _get_stock_or_404(log.size, db)#type:ignore
    if stock.balance - log.sheets_added < 0: #type:ignore 
        raise HTTPException(400, f"Cannot delete: {log.size} balance would go negative.")

    stock.balance -= log.sheets_added #type:ignore 
    stock.updated_at = datetime.utcnow() #type:ignore
    db.delete(log)
    db.commit()


class PaperUsageCreate(BaseModel):
    job_no: str
    operator_name: str
    paper_size: str
    ok_pages: int = 0
    print_damage: int = 0
    accu_rp: int = 0
    bind_rp: int = 0


@app.post("/api/paper-usage", response_model=PaperUsageEntryOut, status_code=201)
def create_paper_usage(payload: PaperUsageCreate, db: Session = Depends(get_db)):
    if not payload.job_no.strip():
        raise HTTPException(400, "Job No is required")
    if not payload.operator_name.strip():
        raise HTTPException(400, "Operator name is required")

    size = payload.paper_size.strip()
    if size not in PAPER_SIZES:
        raise HTTPException(400, f"paper_size must be one of {PAPER_SIZES}")

    for field_name, val in [
        ("ok_pages", payload.ok_pages), ("print_damage", payload.print_damage),
        ("accu_rp", payload.accu_rp), ("bind_rp", payload.bind_rp),
    ]:
        if val < 0:
            raise HTTPException(400, f"{field_name} cannot be negative")

    total = payload.ok_pages + payload.print_damage + payload.accu_rp + payload.bind_rp
    if total <= 0:
        raise HTTPException(400, "Must record at least one sheet used")

    stock = _get_stock_or_404(size, db)
    if stock.balance - total < 0: #type:ignore 
        raise HTTPException(400, f"Not enough paper. {size} balance is {stock.balance}, need {total}.")

    stock.balance -= total #type:ignore 
    stock.updated_at = datetime.utcnow() #type:ignore 

    entry = PaperUsageEntry(
        job_no=payload.job_no.strip(),
        operator_name=payload.operator_name.strip().title(),
        paper_size=size,
        ok_pages=payload.ok_pages,
        print_damage=payload.print_damage,
        accu_rp=payload.accu_rp,
        bind_rp=payload.bind_rp,
        total_used=total,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@app.get("/api/paper-usage", response_model=dict)
def list_paper_usage(
    db: Session = Depends(get_db),
    search: Optional[str] = Query(None, description="job_no / operator_name"),
    date: Optional[str] = Query(None, description="YYYY-MM-DD, Sri Lanka calendar day"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    q = db.query(PaperUsageEntry)
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            PaperUsageEntry.job_no.ilike(term),
            PaperUsageEntry.operator_name.ilike(term),
        ))

    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d") - SL_TZ_OFFSET
        day_end   = day_start + timedelta(days=1)
        q = q.filter(PaperUsageEntry.created_at >= day_start, PaperUsageEntry.created_at < day_end)

    total = q.count()
    day_total_used = q.with_entities(func.coalesce(func.sum(PaperUsageEntry.total_used), 0)).scalar() or 0

    rows = (
        q.order_by(desc(PaperUsageEntry.created_at))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "day_total_used": int(day_total_used),
        "entries": [PaperUsageEntryOut.model_validate(r).model_dump() for r in rows],
    }
@app.get("/api/paper-usage/dates-with-entries")
def paper_usage_dates_with_entries(
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(...),
):
    start = datetime(year, month, 1) - SL_TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - SL_TZ_OFFSET

    rows = (
        db.query(PaperUsageEntry.created_at, func.count(PaperUsageEntry.id).label("cnt"))
        .filter(PaperUsageEntry.created_at >= start, PaperUsageEntry.created_at < end)
        .group_by(PaperUsageEntry.created_at)
        .all()
    )
    day_counts: dict[str, int] = {}
    for r in rows:
        lk_date = r.created_at + SL_TZ_OFFSET
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + r.cnt
    return day_counts




class PaperUsageUpdate(BaseModel):
    job_no: Optional[str] = None
    operator_name: Optional[str] = None
    paper_size: Optional[str] = None
    ok_pages: Optional[int] = None
    print_damage: Optional[int] = None
    accu_rp: Optional[int] = None
    bind_rp: Optional[int] = None


@app.patch("/api/paper-usage/{entry_id}", response_model=PaperUsageEntryOut)
def update_paper_usage(entry_id: int, payload: PaperUsageUpdate, db: Session = Depends(get_db)):
    entry = db.query(PaperUsageEntry).filter(PaperUsageEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Paper usage entry not found")
    _paper_check_editable(entry.created_at) #type:ignore

    new_size = (payload.paper_size or entry.paper_size).strip()
    if new_size not in PAPER_SIZES:
        raise HTTPException(400, f"paper_size must be one of {PAPER_SIZES}")

    new_ok     = payload.ok_pages     if payload.ok_pages     is not None else entry.ok_pages
    new_print  = payload.print_damage if payload.print_damage is not None else entry.print_damage
    new_accu   = payload.accu_rp      if payload.accu_rp      is not None else entry.accu_rp
    new_bind   = payload.bind_rp      if payload.bind_rp      is not None else entry.bind_rp

    for field_name, val in [("ok_pages", new_ok), ("print_damage", new_print), ("accu_rp", new_accu), ("bind_rp", new_bind)]:
        if val < 0: #type:ignore 
            raise HTTPException(400, f"{field_name} cannot be negative")

    new_total = new_ok + new_print + new_accu + new_bind
    if new_total <= 0: #type:ignore 
        raise HTTPException(400, "Must record at least one sheet used")

    old_stock = _get_stock_or_404(entry.paper_size, db) #type:ignore 
    new_stock = _get_stock_or_404(new_size, db)

    if new_size == entry.paper_size:
        # same size — just adjust the delta
        projected = old_stock.balance + entry.total_used - new_total
        if projected < 0: #type:ignore 
            raise HTTPException(400, f"Not enough paper. {new_size} balance would go negative.")
        old_stock.balance = projected  #type:ignore 
        old_stock.updated_at = datetime.utcnow() #type:ignore 
    else:
        # moved to a different size — refund old, deduct new
        refunded_old = old_stock.balance + entry.total_used
        if refunded_old < 0: #type:ignore 
            raise HTTPException(400, f"Cannot move entry: {entry.paper_size} balance would go negative.")
        projected_new = new_stock.balance - new_total
        if projected_new < 0: #type:ignore 
            raise HTTPException(400, f"Not enough paper. {new_size} balance is {new_stock.balance}, need {new_total}.")
        old_stock.balance = refunded_old #type:ignore
        new_stock.balance = projected_new #type:ignore
        old_stock.updated_at = datetime.utcnow() #type:ignore
        new_stock.updated_at = datetime.utcnow() #type:ignore 

    if payload.job_no is not None:
        if not payload.job_no.strip():
            raise HTTPException(400, "Job No cannot be empty")
        entry.job_no = payload.job_no.strip() #type:ignore

    if payload.operator_name is not None:
        if not payload.operator_name.strip():
            raise HTTPException(400, "Operator name cannot be empty")
        entry.operator_name = payload.operator_name.strip().title() #type:ignore 

    entry.paper_size   = new_size #type:ignore 
    entry.ok_pages     = new_ok #type:ignore 
    entry.print_damage = new_print #type:ignore
    entry.accu_rp      = new_accu #type:ignore
    entry.bind_rp      = new_bind #type:ignore
    entry.total_used   = new_total #type:ignore
    entry.updated_at   = datetime.utcnow() #type:ignore

    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/api/paper-usage/{entry_id}", status_code=204)
def delete_paper_usage(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(PaperUsageEntry).filter(PaperUsageEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(404, "Paper usage entry not found")
    _paper_check_editable(entry.created_at) #type:ignore

    stock = _get_stock_or_404(entry.paper_size, db) #type:ignore
    stock.balance += entry.total_used #type:ignore
    stock.updated_at = datetime.utcnow() #type:ignore

    db.delete(entry)
    db.commit()


@app.get("/api/paper-usage/known-operators")
def known_paper_operators(db: Session = Depends(get_db)):
    rows = db.query(PaperUsageEntry.operator_name).distinct().all()
    names = sorted({r[0].strip().title() for r in rows if r[0]})
    return {"names": names}

class ThankYouCardCreate(BaseModel):
    customer: str
    couple_name: Optional[str] = None
    machine: str                      
    size: str
    quantity: int = 1
    price: int
    date: Optional[str] = None
    job_no: Optional[str] = None


TYC_MACHINES = ("GREEN_2", "GREEN_3", "GREEN_3_NEW")   # Epson excluded on purpose


@app.post("/api/thankyou-cards", response_model=ThankYouCardOut, status_code=201)
def create_thankyou_card(payload: ThankYouCardCreate, db: Session = Depends(get_db)):
    if not payload.customer.strip():
        raise HTTPException(400, "Photographer / Studio name is required")
    machine = payload.machine.strip().upper()
    if machine not in TYC_MACHINES:
        raise HTTPException(400, f"machine must be one of {TYC_MACHINES}")
    if not payload.size.strip():
        raise HTTPException(400, "Size is required")
    if payload.quantity <= 0:
        raise HTTPException(400, "Quantity must be greater than 0")
    if payload.price < 0:
        raise HTTPException(400, "Price cannot be negative")

    job_no = (payload.job_no or "").strip().upper() or None
    if job_no:
        dup = db.query(ThankYouCard).filter(ThankYouCard.job_no == job_no).first()
        if dup:
            raise HTTPException(409, f"Job No '{job_no}' is already used on a thank-you card entry.")

    if payload.date:
        try:
            y, m, d = map(int, payload.date.split("-"))
        except ValueError:
            raise HTTPException(400, "date must be in YYYY-MM-DD format")
        sl_now   = datetime.utcnow() + SL_TZ_OFFSET
        sl_dt    = datetime(y, m, d, sl_now.hour, sl_now.minute, sl_now.second)
        created_at = sl_dt - SL_TZ_OFFSET
    else:
        created_at = datetime.utcnow()

    entry = ThankYouCard(
        customer=payload.customer.strip().title(),
        couple_name=(payload.couple_name or "").strip() or None,
        machine=machine,
        job_no=job_no,                 
        size=payload.size.strip(),
        quantity=payload.quantity,
        price=payload.price,
        total_price=payload.quantity * payload.price,
        created_at=created_at,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

@app.get("/api/thankyou-cards", response_model=dict)
def list_thankyou_cards(
    db: Session = Depends(get_db),
    machine: Optional[str] = Query(None),
    date: Optional[str] = Query(None, description="YYYY-MM-DD, Sri Lanka calendar day"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    q = db.query(ThankYouCard)
    if machine:
        q = q.filter(ThankYouCard.machine == machine.strip().upper())
    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d") - SL_TZ_OFFSET
        day_end   = day_start + timedelta(days=1)
        q = q.filter(ThankYouCard.created_at >= day_start, ThankYouCard.created_at < day_end)

    total = q.count()
    rows = (
        q.order_by(desc(ThankYouCard.created_at))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": max(1, -(-total // page_size)),
        "cards": [ThankYouCardOut.model_validate(r).model_dump() for r in rows],
    }

class ThankYouCardUpdate(BaseModel):
    job_no: Optional[str] = None
    customer: Optional[str] = None
    couple_name: Optional[str] = None
    machine: Optional[str] = None
    size: Optional[str] = None
    quantity: Optional[int] = None
    price: Optional[int] = None


TYC_EDIT_WINDOW_HOURS = 24


def _tyc_check_editable(entry: ThankYouCard):
    if (datetime.utcnow() - entry.created_at) > timedelta(hours=TYC_EDIT_WINDOW_HOURS):  #type:ignore
        raise HTTPException(403, "Edit window has expired. This entry can no longer be changed.")


def _tyc_or_404(card_id: int, db: Session) -> ThankYouCard:
    entry = db.query(ThankYouCard).filter(ThankYouCard.id == card_id).first()
    if not entry:
        raise HTTPException(404, f"Thank you card {card_id} not found")
    return entry


@app.patch("/api/thankyou-cards/{card_id}", response_model=ThankYouCardOut)
def update_thankyou_card(card_id: int, payload: ThankYouCardUpdate, db: Session = Depends(get_db)):
    entry = _tyc_or_404(card_id, db)
    _tyc_check_editable(entry)

    if payload.job_no is not None:
        new_job_no = payload.job_no.strip().upper() or None
        if new_job_no and new_job_no != entry.job_no:
            dup = db.query(ThankYouCard).filter(
                ThankYouCard.job_no == new_job_no,
                ThankYouCard.id != card_id,
            ).first()
            if dup:
                raise HTTPException(409, f"Job No '{new_job_no}' is already used on another thank-you card entry.")
        entry.job_no = new_job_no  #type:ignore

    if payload.customer is not None:
        if not payload.customer.strip():
            raise HTTPException(400, "Photographer / Studio name cannot be empty")
        entry.customer = payload.customer.strip().title()  #type:ignore

    if payload.couple_name is not None:
        entry.couple_name = payload.couple_name.strip() or None  #type:ignore

    if payload.machine is not None:
        machine = payload.machine.strip().upper()
        if machine not in TYC_MACHINES:
            raise HTTPException(400, f"machine must be one of {TYC_MACHINES}")
        entry.machine = machine  #type:ignore

    if payload.size is not None:
        if not payload.size.strip():
            raise HTTPException(400, "Size cannot be empty")
        entry.size = payload.size.strip()  #type:ignore

    if payload.quantity is not None:
        if payload.quantity <= 0:
            raise HTTPException(400, "Quantity must be greater than 0")
        entry.quantity = payload.quantity  #type:ignore

    if payload.price is not None:
        if payload.price < 0:
            raise HTTPException(400, "Price cannot be negative")
        entry.price = payload.price  #type:ignore

    entry.total_price = entry.quantity * entry.price  #type:ignore
    entry.updated_at = datetime.utcnow()  #type:ignore
    db.commit()
    db.refresh(entry)
    return entry


@app.delete("/api/thankyou-cards/{card_id}", status_code=204)
def delete_thankyou_card(card_id: int, db: Session = Depends(get_db)):
    entry = _tyc_or_404(card_id, db)
    _tyc_check_editable(entry)
    db.delete(entry)
    db.commit()

@app.get("/api/thankyou-cards/dates-with-entries")
def thankyou_dates_with_entries(
    db: Session = Depends(get_db),
    year: int = Query(...),
    month: int = Query(...),
    machine: Optional[str] = Query(None),
):
    start = datetime(year, month, 1) - SL_TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - SL_TZ_OFFSET

    q = db.query(ThankYouCard.created_at, func.count(ThankYouCard.id).label("cnt"))
    if machine:
        q = q.filter(ThankYouCard.machine == machine.strip().upper())
    rows = (
        q.filter(ThankYouCard.created_at >= start, ThankYouCard.created_at < end)
         .group_by(ThankYouCard.created_at)
         .all()
    )
    day_counts: dict[str, int] = {}
    for created_at, cnt in rows:
        lk_date = created_at + SL_TZ_OFFSET
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + cnt
    return day_counts


@app.get("/api/stats/thankyou-cards-by-machine")
def thankyou_cards_by_machine(db: Session = Depends(get_db)):
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
        rows = (
            db.query(ThankYouCard.machine, func.count(ThankYouCard.id), func.coalesce(func.sum(ThankYouCard.quantity), 0))
            .filter(
                ThankYouCard.machine.in_(TYC_MACHINES),
                ThankYouCard.created_at >= start,
                ThankYouCard.created_at < end,
            )
            .group_by(ThankYouCard.machine)
            .all()
        )
        result = {m: {"entries": 0, "quantity": 0} for m in TYC_MACHINES}
        for machine, cnt, qty in rows:
            result[machine] = {"entries": cnt, "quantity": int(qty)}
        return result

    return {"daily": counts_for(day_start, day_end), "monthly": counts_for(month_start, month_end)}

@app.get("/api/stats/thankyou-cards")
def thankyou_card_stats(db: Session = Depends(get_db)):
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET
    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)
    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    def summary_for(start, end):
        q = db.query(ThankYouCard).filter(
            ThankYouCard.created_at >= start, ThankYouCard.created_at < end,
        )
        count = q.count()
        total_qty   = q.with_entities(func.coalesce(func.sum(ThankYouCard.quantity), 0)).scalar() or 0
        total_price = q.with_entities(func.coalesce(func.sum(ThankYouCard.total_price), 0)).scalar() or 0
        return {"count": count, "total_quantity": int(total_qty), "total_price": int(total_price)}

    return {
        "daily":   summary_for(day_start, day_end),
        "monthly": summary_for(month_start, month_end),
    }


@app.get("/api/thankyou-cards/known-names")
def known_thankyou_names(db: Session = Depends(get_db)):
    rows = db.query(ThankYouCard.customer).distinct().all()
    names = sorted({r[0].strip().title() for r in rows if r[0]})
    return {"names": names}


@app.get("/api/stats/paper-stock")
def paper_stock_stats(db: Session = Depends(get_db)):
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET
    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    stocks = db.query(PaperStock).order_by(PaperStock.size).all()
    balances = {s.size: s.balance for s in stocks}
    low_stock = [s.size for s in stocks if s.balance <= LOW_STOCK_THRESHOLD] #type:ignore

    monthly_rows = (
        db.query(PaperUsageEntry)
        .filter(PaperUsageEntry.created_at >= month_start, PaperUsageEntry.created_at < month_end)
        .all()
    )
    monthly_used: dict[str, int] = {size: 0 for size in PAPER_SIZES}
    for e in monthly_rows:
        monthly_used[e.paper_size] = monthly_used.get(e.paper_size, 0) + e.total_used #type:ignore

    return {
        "balances": balances,
        "low_stock_sizes": low_stock,
        "low_stock_threshold": LOW_STOCK_THRESHOLD,
        "monthly_used": monthly_used,
    }

@app.get("/api/stats/paper-usage-breakdown")
def paper_usage_breakdown(db: Session = Depends(get_db)):
    utc_now = datetime.utcnow()
    sl_now  = utc_now + SL_TZ_OFFSET
    day_start = datetime(sl_now.year, sl_now.month, sl_now.day) - SL_TZ_OFFSET
    day_end   = day_start + timedelta(days=1)
    month_start = datetime(sl_now.year, sl_now.month, 1) - SL_TZ_OFFSET
    month_end   = (
        datetime(sl_now.year + 1, 1, 1) if sl_now.month == 12
        else datetime(sl_now.year, sl_now.month + 1, 1)
    ) - SL_TZ_OFFSET

    def summary_for(start, end):
        rows = (
            db.query(PaperUsageEntry)
            .filter(PaperUsageEntry.created_at >= start, PaperUsageEntry.created_at < end)
            .all()
        )
        result = {
            size: {"total": 0, "ok_pages": 0, "print_damage": 0, "accu_rp": 0, "bind_rp": 0}
            for size in PAPER_SIZES
        }
        for e in rows:
            key = e.paper_size
            if key not in result:
                result[key] = {"total": 0, "ok_pages": 0, "print_damage": 0, "accu_rp": 0, "bind_rp": 0} #type:ignore
            result[key]["total"]        += e.total_used #type:ignore
            result[key]["ok_pages"]     += e.ok_pages #type:ignore
            result[key]["print_damage"] += e.print_damage #type:ignore
            result[key]["accu_rp"]      += e.accu_rp #type:ignore
            result[key]["bind_rp"]      += e.bind_rp #type:ignore
        return result

    return {"daily": summary_for(day_start, day_end), "monthly": summary_for(month_start, month_end)}

class TrackStageOut(BaseModel):
    label: str
    status: str  # PENDING / IN_PROGRESS / COMPLETED / SKIPPED

class TrackOut(BaseModel):
    job_no: str
    couple_name: Optional[str] = None
    dele_date: datetime
    is_fully_completed: bool
    stages: List[TrackStageOut]


@app.get("/api/track/{job_no}", response_model=TrackOut)
def track_job(job_no: str, db: Session = Depends(get_db)):
    job = db.query(JobCard).filter(JobCard.job_no == job_no.strip()).first()
    if not job:
        raise HTTPException(404, "No album found with this Job No. Please check and try again.")

    stages = [
        {"label": "Printing",      "status": _str(job.status_printing)},
        {"label": "Laser Cutting", "status": _str(job.status_laser_cutting)},
        {"label": "Laminating",    "status": _str(job.status_laminating)},
        {"label": "Binding",       "status": _str(job.status_binding)},
    ]

    return TrackOut(
        job_no=job.job_no,               #type:ignore
        couple_name=job.couple_name,     #type:ignore
        dele_date=job.dele_date,         #type:ignore
        is_fully_completed=job.is_fully_completed,  #type:ignore
        stages=stages, #type:ignore
    )

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
    print(" Frontend dist found")
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