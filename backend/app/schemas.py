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

    model_config = {"from_attributes": True}


class JobCardOut(BaseModel):
    id: int
    job_no: str
    customer: str
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

    completed_at = (
        job.updated_at
        if job.is_fully_completed
        else None
    )

    hours_since = (
        round(
            (
                datetime.utcnow() - completed_at
            ).total_seconds() / 3600,
            2,
        )
        if completed_at
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