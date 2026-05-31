# backend/app/routers/history.py
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, func, desc
from sqlalchemy.orm import Session

from ..models import JobCard, DepartmentLog, DepartmentEnum, get_db
from ..schemas import JobCardOut, _out  # 

router = APIRouter(prefix="/api/history", tags=["history"])


@router.get("", response_model=dict)
def get_history(
    db:         Session  = Depends(get_db),
    date:       Optional[str] = Query(None, description="YYYY-MM-DD"),
    date_from:  Optional[str] = Query(None),
    date_to:    Optional[str] = Query(None),
    search:     Optional[str] = Query(None, description="job_no / customer / couple_name"),
    page:       int = Query(1, ge=1),
    page_size:  int = Query(20, ge=1, le=100),
):
    """
    Returns paginated completed jobs.
    Filters: single date OR date range, plus free-text search.
    """
    q = db.query(JobCard).filter(JobCard.is_fully_completed == True)  # noqa

    # ── Date filters ──────────────────────────────────────────────
    if date:
        day_start = datetime.strptime(date, "%Y-%m-%d")
        day_end   = day_start + timedelta(days=1)
        # updated_at is your completion timestamp
        q = q.filter(JobCard.updated_at >= day_start, JobCard.updated_at < day_end)
    elif date_from or date_to:
        if date_from:
            q = q.filter(JobCard.updated_at >= datetime.strptime(date_from, "%Y-%m-%d"))
        if date_to:
            q = q.filter(JobCard.updated_at < datetime.strptime(date_to, "%Y-%m-%d") + timedelta(days=1))

    # ── Search filter (job_no OR customer OR couple_name) ─────────
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
        "pages":     max(1, -(-total // page_size)),   # ceiling division
        "jobs":      [_out(j, db).model_dump() for j in jobs],
    }


@router.get("/dates-with-completions")
def dates_with_completions(
    db:    Session = Depends(get_db),
    year:  int = Query(...),
    month: int = Query(...),
):
    """
    Returns list of calendar days in given month that have completions.
    Used to highlight calendar days with dot indicators.
    """
    start = datetime(year, month, 1)
    # last day of month
    if month == 12:
        end = datetime(year + 1, 1, 1)
    else:
        end = datetime(year, month + 1, 1)

    from sqlalchemy import extract

    rows = (
        db.query(
            extract("day", JobCard.updated_at).label("day"),
            func.count(JobCard.id).label("cnt"),
        )
        .filter(
            JobCard.is_fully_completed == True,
            JobCard.updated_at >= start,
            JobCard.updated_at <  end,
        )
        .group_by(extract("day", JobCard.updated_at))
        .all()
    )
    return {str(int(r.day)): r.cnt for r in rows}