from __future__ import annotations
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from ..models import JobCard, AlbumMovement, ChatMessage, get_db
from ..schemas import AlbumMovementOut, _str

router = APIRouter(prefix="/api/returns", tags=["returns"])

# Physical order of the factory floor. Returns may only go to a LOWER rank.
DEPT_RANK = {"PRINTING": 1, "LASER_CUTTING": 2, "LAMINATING": 3, "BINDING": 4}
STATUS_FIELD = {
    "PRINTING":      "status_printing",
    "LASER_CUTTING": "status_laser_cutting",
    "LAMINATING":    "status_laminating",
    "BINDING":       "status_binding",
}
DEPT_LABEL = {
    "PRINTING": "Printing", "LASER_CUTTING": "Laser Cutting",
    "LAMINATING": "Laminating", "BINDING": "Binding",
}
OPEN_STATES = ("IN_TRANSIT", "RECEIVED")

PRESET_RETURN_REASONS = [
    "Print quality issue",
    "Colour mismatch",
    "Wrong page order",
    "Missing pages",
    "Lamination bubbles / damage",
    "Cover / laser cut issue",
    "Customer requested change",
    "Other",
]


def _dept(name: str) -> str:
    d = (name or "").strip().upper()
    if d not in DEPT_RANK:
        raise HTTPException(400, f"Unknown department: {name}")
    return d


def _mv_out(m: AlbumMovement) -> AlbumMovementOut:
    out = AlbumMovementOut.model_validate(m, from_attributes=True)
    if m.job:
        return out.model_copy(update={
            "job_no": m.job.job_no,
            "customer": m.job.customer,
            "couple_name": m.job.couple_name,
        })
    return out


def _movement_or_404(mid: int, db: Session) -> AlbumMovement:
    m = db.query(AlbumMovement).filter(AlbumMovement.id == mid).first()
    if not m:
        raise HTTPException(404, f"Movement {mid} not found")
    return m


def _notify(db: Session, sender: str, recipient: str, text: str):
    # Plain (non-automatic) message so it shows as a normal chat bubble
    db.add(ChatMessage(
        sender_department=sender,
        recipient_department=recipient,
        message_text=text,
        is_automatic=False,
        request_type="ALBUM_RETURN",
    ))


@router.get("/reasons")
def preset_reasons():
    return {"reasons": PRESET_RETURN_REASONS}


# ── Send an album back ────────────────────────────────────────────────
class ReturnSendRequest(BaseModel):
    job_id: int
    from_department: str
    to_department: str
    reason: str
    sent_by: str


@router.post("/send", response_model=AlbumMovementOut, status_code=201)
def send_return(payload: ReturnSendRequest, db: Session = Depends(get_db)):
    src = _dept(payload.from_department)
    dst = _dept(payload.to_department)

    if not payload.reason.strip():
        raise HTTPException(400, "Reason is required")
    if not payload.sent_by.strip():
        raise HTTPException(400, "Your name is required")
    if DEPT_RANK[dst] >= DEPT_RANK[src]:
        raise HTTPException(400, "An album can only be returned to an EARLIER department.")

    job = db.query(JobCard).filter(JobCard.id == payload.job_id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    if job.is_fully_completed:
        raise HTTPException(409, "Job is fully completed - it has already left the factory.")

    # Is the sender actually the one who could be holding it?
    if _str(getattr(job, STATUS_FIELD[src])) == "SKIPPED":
        raise HTTPException(400, f"{DEPT_LABEL[src]} is skipped for this job.")
    if src == "LAMINATING" and _str(job.status_printing) != "COMPLETED":
        raise HTTPException(409, "Album hasn't reached Laminating yet.")
    if src == "BINDING" and not job.binding_unlocked:
        raise HTTPException(409, "Album hasn't reached Binding yet.")
    if dst == "LASER_CUTTING" and _str(job.status_laser_cutting) == "SKIPPED":
        raise HTTPException(400, "This job has no Laser Cutting step.")

    already = (
        db.query(AlbumMovement.id)
        .filter(AlbumMovement.job_id == job.id, AlbumMovement.status.in_(OPEN_STATES))
        .first()
    )
    if already:
        raise HTTPException(409, "This album already has an open return. Receive/resolve it first.")

    m = AlbumMovement(
        job_id=job.id,
        kind="RETURN",
        from_department=src,
        to_department=dst,
        reason=payload.reason.strip(),
        sent_by=payload.sent_by.strip().title(),
        status="IN_TRANSIT",
    )
    db.add(m)
    _notify(
        db, src, dst,
        f"↩ Album #{job.job_no} ({job.customer}) is being returned to you from "
        f"{DEPT_LABEL[src]}. Reason: {m.reason}",
    )
    db.commit()
    db.refresh(m)
    return _mv_out(m)


# ── Receive (physically arrived) ──────────────────────────────────────
class ReceiveRequest(BaseModel):
    received_by: str


@router.post("/{movement_id}/receive", response_model=AlbumMovementOut)
def receive_return(movement_id: int, payload: ReceiveRequest, db: Session = Depends(get_db)):
    m = _movement_or_404(movement_id, db)
    if m.status != "IN_TRANSIT":
        raise HTTPException(409, f"Movement is already {m.status}.")
    if not payload.received_by.strip():
        raise HTTPException(400, "Your name is required")

    now = datetime.utcnow()
    m.received_by = payload.received_by.strip().title()
    m.received_at = now
    if m.kind == "FORWARD":
        # Album is back in the normal flow - nothing left to track
        m.status = "RESOLVED"
        m.resolved_by = m.received_by
        m.resolved_at = now
    else:
        m.status = "RECEIVED"
    db.commit()
    db.refresh(m)
    return _mv_out(m)


# ── Resolve & send back to the department that returned it ────────────
class ResolveRequest(BaseModel):
    resolved_by: str
    note: Optional[str] = None


@router.post("/{movement_id}/resolve", response_model=AlbumMovementOut, status_code=201)
def resolve_return(movement_id: int, payload: ResolveRequest, db: Session = Depends(get_db)):
    m = _movement_or_404(movement_id, db)
    if m.kind != "RETURN" or m.status != "RECEIVED":
        raise HTTPException(409, "Only a RECEIVED return can be resolved.")
    if not payload.resolved_by.strip():
        raise HTTPException(400, "Your name is required")

    who = payload.resolved_by.strip().title()
    m.status = "RESOLVED"
    m.resolved_by = who
    m.resolved_at = datetime.utcnow()

    fwd = AlbumMovement(
        job_id=m.job_id,
        kind="FORWARD",
        from_department=m.to_department,
        to_department=m.from_department,
        reason=(payload.note or "").strip() or "Fixed - sending back",
        sent_by=who,
        status="IN_TRANSIT",
        parent_id=m.id,
    )
    db.add(fwd)
    job = m.job
    _notify(
        db, fwd.from_department, fwd.to_department,
        f"✔ Album #{job.job_no} ({job.customer}) is fixed and coming back to you "
        f"from {DEPT_LABEL[fwd.from_department]}.",
    )
    db.commit()
    db.refresh(fwd)
    return _mv_out(fwd)


# ── Lists ─────────────────────────────────────────────────────────────
@router.get("/open", response_model=List[AlbumMovementOut])
def list_open(
    department: Optional[str] = Query(None, description="Only movements addressed TO this department"),
    db: Session = Depends(get_db),
):
    q = db.query(AlbumMovement).filter(AlbumMovement.status.in_(OPEN_STATES))
    if department:
        q = q.filter(AlbumMovement.to_department == _dept(department))
    rows = q.order_by(AlbumMovement.sent_at.asc()).all()
    return [_mv_out(m) for m in rows]


@router.get("/job/{job_id}", response_model=List[AlbumMovementOut])
def job_history(job_id: int, db: Session = Depends(get_db)):
    rows = (
        db.query(AlbumMovement)
        .filter(AlbumMovement.job_id == job_id)
        .order_by(desc(AlbumMovement.sent_at))
        .all()
    )
    return [_mv_out(m) for m in rows]