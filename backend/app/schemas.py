# backend/app/schemas.py

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel
from sqlalchemy.orm import Session

from .models import (
    DepartmentLog,
    JobCard,
    TIMEOUT_MINUTES,
    ThankYouCard
)


# ── Schemas ─────────────────────────────────────────

class DepartmentLogOut(BaseModel):
    id: int
    job_id: int
    department: str
    entered_at: datetime
    exited_at: Optional[datetime]
    duration_minutes: Optional[int]
    is_delayed: bool
    delay_reason: Optional[str]
    delay_reason_at: Optional[datetime]
    operator_name: Optional[str] = None   
    under_whom: Optional[str] = None
    machine: Optional[str] = None 

    model_config = {"from_attributes": True}


class JobCardOut(BaseModel):
    id: int
    job_no: str
    customer: str
    album_type: Optional[str] = None
    couple_name: Optional[str]
    order_no: Optional[str]
    order_date: datetime
    dele_date: datetime
    delivery_type: str
    priority: str
    special_note: Optional[str]
    print_size: Optional[str]
    print_pages: Optional[str]
    laser_cover_type: Optional[str]
    laminate_type: Optional[str]
    bind_rexing_no: Optional[str]
    box_type: Optional[str]
    payment_by: Optional[str] = None
    payment_updated_at: Optional[datetime] = None
    box_pouch_status: Optional[str] = None

    status_printing: str
    status_laminating: str
    status_laser_cutting: str
    status_binding: str

    is_fully_completed: bool
    binding_unlocked: bool

    completed_at: Optional[datetime]
    hours_since_completed: Optional[float]

    created_at: datetime
    updated_at: datetime

    logs: List[DepartmentLogOut] = []

    model_config = {"from_attributes": True}

class PaperPriceOut(BaseModel):
    id: int
    label: str
    size: str
    side_type: str
    unit_price: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class DamageEntryOut(BaseModel):
    id: int
    department: str
    paper_price_id: int
    paper_label: str
    job_no: Optional[str] = None
    customer: Optional[str] = None
    operator_name: str
    reason: str
    quantity: int
    unit_price_snapshot: int
    total_value: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperStockOut(BaseModel):
    id: int
    size: str
    balance: int
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperPacketLogOut(BaseModel):
    id: int
    size: str
    sheets_added: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PaperUsageEntryOut(BaseModel):
    id: int
    job_no: str
    operator_name: str
    paper_size: str
    ok_pages: int
    print_damage: int
    accu_rp: int
    bind_rp: int
    total_used: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True} 

class ThankYouCardOut(BaseModel):
    id: int
    customer: str
    couple_name: Optional[str] = None
    machine: str                     # ← ADD
    size: str
    quantity: int
    price: int
    total_price: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
# ── Helpers ─────────────────────────────────────────

def _str(val) -> str:
    return val.value if hasattr(val, "value") else str(val)


def _refresh_delays(job: JobCard, db: Session):
    now = datetime.utcnow()

    for log in job.logs:
        if log.exited_at is None:
            limit = TIMEOUT_MINUTES.get(_str(log.department), 9999)

            elapsed = (
                now - log.entered_at
            ).total_seconds() / 60

            log.is_delayed = elapsed > limit

    db.commit()


def _out(job: JobCard, db: Session) -> JobCardOut:
    _refresh_delays(job, db)

    completed_at = job.completed_at

    hours_since = (
        round(
            (
                datetime.utcnow() - completed_at
            ).total_seconds() / 3600,
            2,
        )
        if completed_at #type: ignore
        else None
    )

    return JobCardOut.model_validate({
        **{
            c.name: (
                _str(getattr(job, c.name))
                if hasattr(getattr(job, c.name), "value")
                else getattr(job, c.name)
            )
            for c in job.__table__.columns
        },

        "binding_unlocked": job.binding_unlocked,

        "completed_at": completed_at,

        "hours_since_completed": hours_since,

        "logs": [
            DepartmentLogOut.model_validate(
                lg,
                from_attributes=True
            )
            for lg in job.logs
        ],
    })