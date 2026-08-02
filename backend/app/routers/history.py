from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session
from ..models import JobCard, DepartmentLog, DepartmentEnum, get_db
from ..schemas import JobCardOut, _out

router = APIRouter(prefix="/api/history", tags=["history"])

TZ_OFFSET = timedelta(hours=5, minutes=30)  # Sri Lanka UTC+5:30


@router.get("", response_model=dict)
def get_history(
    db:         Session  = Depends(get_db),
    date:       Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_from:  Optional[str] = Query(None),
    date_to:    Optional[str] = Query(None),
    search:     Optional[str] = Query(None, description="job_no / customer / couple_name"),
    machine:    Optional[str] = Query(None, description="GREEN_2 / GREEN_3/EPSON"),
    album_type: Optional[str] = Query(None, description="NORMAL / STORY / REBIND"),
    page:       int = Query(1, ge=1),
    page_size:  int = Query(20, ge=1, le=100),
):
    q = db.query(JobCard).filter(JobCard.is_fully_completed == True)  # noqa

    # ── Date filters ──────────────────────────────────────────────
    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d") - TZ_OFFSET
        day_end   = day_start + timedelta(days=1)
        q = q.filter(JobCard.completed_at >= day_start, JobCard.completed_at < day_end)

    elif date_from or date_to:
        if date_from:
            q = q.filter(
                JobCard.updated_at >= datetime.strptime(date_from, "%Y-%m-%d") - TZ_OFFSET
            )
        if date_to:
            q = q.filter(
                JobCard.updated_at < datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1) - TZ_OFFSET
            )
        # ── Machine filter ───────────────────────────────────────────
    if machine:
        q = q.filter(
            db.query(DepartmentLog.id)
              .filter(
                  DepartmentLog.job_id     == JobCard.id,
                  DepartmentLog.department == DepartmentEnum.PRINTING,
                  DepartmentLog.machine    == machine.strip().upper(),
              )
              .exists()
        )

    if album_type:
        q = q.filter(JobCard.album_type == album_type.strip().upper())

    # ── Search filter ─────────────────────────────────────────────
    if search and search.strip():
        term = f"%{search.strip()}%"
        q = q.filter(or_(
            JobCard.job_no.ilike(term),
            JobCard.customer.ilike(term),
            JobCard.couple_name.ilike(term),
        ))

    total = q.count()
    jobs = (
        q.order_by(desc(JobCard.updated_at))
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    return {
        "total":     total,
        "page":      page,
        "page_size": page_size,
        "pages":     max(1, -(-total // page_size)),
        "jobs":      [_out(j, db).model_dump() for j in jobs],
    }


@router.get("/dates-with-completions")
def dates_with_completions(
    db:    Session = Depends(get_db),
    year:  int = Query(...),
    month: int = Query(...),
):
    # Shift the month window by TZ_OFFSET so calendar dots
    # reflect Sri Lanka dates, not UTC dates
    start = datetime(year, month, 1) - TZ_OFFSET
    end   = (datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)) - TZ_OFFSET

    rows = (
        db.query(
            JobCard.updated_at,
            func.count(JobCard.id).label("cnt"),
        )
        .filter(
            JobCard.is_fully_completed == True,  # noqa
            JobCard.updated_at >= start,
            JobCard.updated_at <  end,
        )
        .group_by(JobCard.updated_at)
        .all()
    )

    # Convert each UTC timestamp → LK local date → extract day
    day_counts: dict[str, int] = {}
    for r in rows:
        lk_date = r.updated_at + TZ_OFFSET          # shift UTC → LK time
        day_key = str(lk_date.day)
        day_counts[day_key] = day_counts.get(day_key, 0) + r.cnt

    return day_counts