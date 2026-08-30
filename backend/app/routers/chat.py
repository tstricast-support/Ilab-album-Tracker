from __future__ import annotations
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import or_, and_, func, desc
from sqlalchemy.orm import Session

from ..models import JobCard, ChatMessage, ChatMessageItem, get_db
from ..schemas import ChatMessageOut, ChatMessageItemOut

router = APIRouter(prefix="/api/chat", tags=["chat"])

VALID_DEPTS = {"ENTRY", "PRINTING", "LAMINATING", "LASER_CUTTING", "BINDING", "ADMIN"}
RETENTION_HOURS = 24

# ── Name-tag quick template removed per requirements ──
QUICK_TEMPLATES = {
    "LASER_COVER_URGENT": "Need laser cut covers urgently - please prioritize.",
    "BOX_POUCH_CHECK": "Please confirm box/pouch status for pending jobs.",
}


def _dept(name: str) -> str:
    d = (name or "").strip().upper()
    if d not in VALID_DEPTS:
        raise HTTPException(400, f"Unknown department: {name}")
    return d


def _cutoff() -> datetime:
    return datetime.utcnow() - timedelta(hours=RETENTION_HOURS)


def _cleanup_expired(db: Session):
    db.query(ChatMessage).filter(ChatMessage.created_at < _cutoff()).delete(
        synchronize_session=False
    )
    db.commit()


def _out(msg: ChatMessage) -> ChatMessageOut:
    return ChatMessageOut.model_validate(msg, from_attributes=True)


# ── Inbox / thread (marks the OTHER side's messages as read when a specific thread is opened) ──
@router.get("/inbox", response_model=List[ChatMessageOut])
def get_inbox(
    department: str = Query(...),
    with_dept: Optional[str] = Query(None, description="Restrict to a two-way thread"),
    db: Session = Depends(get_db),
):
    dept = _dept(department)
    _cleanup_expired(db)

    q = db.query(ChatMessage).filter(
        ChatMessage.created_at >= _cutoff(),
        or_(
            ChatMessage.sender_department == dept,
            ChatMessage.recipient_department == dept,
        ),
    )
    if with_dept:
        other = _dept(with_dept)
        q = q.filter(
            or_(
                and_(ChatMessage.sender_department == dept, ChatMessage.recipient_department == other),
                and_(ChatMessage.sender_department == other, ChatMessage.recipient_department == dept),
            )
        )
        # Opening this specific thread = the recipient has now seen it → mark read
        db.query(ChatMessage).filter(
            ChatMessage.recipient_department == dept,
            ChatMessage.sender_department == other,
            ChatMessage.is_read == False,  # noqa
        ).update({"is_read": True}, synchronize_session=False)
        db.commit()

    rows = q.order_by(ChatMessage.created_at.asc()).all()
    return [_out(m) for m in rows]


# ── Unread counts — for the badge on the chat bubble ────────────────
@router.get("/unread-count")
def unread_count(department: str = Query(...), db: Session = Depends(get_db)):
    dept = _dept(department)
    _cleanup_expired(db)

    rows = (
        db.query(ChatMessage.sender_department, func.count(ChatMessage.id))
        .filter(
            ChatMessage.recipient_department == dept,
            ChatMessage.is_read == False,  # noqa
            ChatMessage.created_at >= _cutoff(),
        )
        .group_by(ChatMessage.sender_department)
        .all()
    )
    by_sender = {r[0]: r[1] for r in rows}
    return {"total": sum(by_sender.values()), "by_sender": by_sender}


# ── Plain send ───────────────────────────────────────────────────────
class ChatSendRequest(BaseModel):
    sender_department: str
    recipient_department: str
    message_text: str


@router.post("/send", response_model=ChatMessageOut, status_code=201)
def send_message(payload: ChatSendRequest, db: Session = Depends(get_db)):
    if not payload.message_text.strip():
        raise HTTPException(400, "Message cannot be empty")
    sender = _dept(payload.sender_department)
    recipient = _dept(payload.recipient_department)

    msg = ChatMessage(
        sender_department=sender,
        recipient_department=recipient,
        message_text=payload.message_text.strip(),
        is_automatic=False,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _out(msg)


# ── Automated 3-day Pronto album list — LOCKED to Printing → Binding ──
class AlbumListRequest(BaseModel):
    sender_department: str
    recipient_department: str
    days: int = 3
    album_type: Optional[str] = None
    message_text: Optional[str] = None


@router.post("/album-list-request", response_model=ChatMessageOut, status_code=201)
def album_list_request(payload: AlbumListRequest, db: Session = Depends(get_db)):
    sender = _dept(payload.sender_department)
    recipient = _dept(payload.recipient_department)

    if sender != "PRINTING" or recipient != "BINDING":
        raise HTTPException(
            400,
            "The 3-day Pronto album list request is only available from Printing to Binding.",
        )
    if payload.days < 1 or payload.days > 14:
        raise HTTPException(400, "days must be between 1 and 14")

    since = datetime.utcnow() - timedelta(days=payload.days)
    q = db.query(JobCard).filter(
        JobCard.delivery_type == "PRONTO",
        JobCard.created_at >= since,
    )
    if payload.album_type:
        at = payload.album_type.strip().upper()
        if at == "NORMAL":
            q = q.filter(or_(JobCard.album_type == "NORMAL", JobCard.album_type.is_(None)))
        else:
            q = q.filter(JobCard.album_type == at)

    jobs = q.order_by(JobCard.customer.asc()).all()

    default_text = (
        f"📋 {payload.days}-day PRONTO album list "
        f"({len(jobs)} job{'s' if len(jobs) != 1 else ''}) - please check off items completed."
    )

    msg = ChatMessage(
        sender_department=sender,
        recipient_department=recipient,
        message_text=(payload.message_text or default_text).strip(),
        is_automatic=True,
        request_type="ALBUM_LIST_3DAY_PRONTO",
    )
    db.add(msg)
    db.flush()

    for j in jobs:
        db.add(ChatMessageItem(
            chat_message_id=msg.id,
            job_no=j.job_no,
            customer=j.customer,
            couple_name=j.couple_name,
        ))

    db.commit()
    db.refresh(msg)
    return _out(msg)


# ── Quick request templates ─────────────────────────────────────────
class QuickRequest(BaseModel):
    sender_department: str
    recipient_department: str
    template_key: str


@router.post("/quick-request", response_model=ChatMessageOut, status_code=201)
def quick_request(payload: QuickRequest, db: Session = Depends(get_db)):
    sender = _dept(payload.sender_department)
    recipient = _dept(payload.recipient_department)
    text = QUICK_TEMPLATES.get(payload.template_key)
    if not text:
        raise HTTPException(400, f"Unknown template_key: {payload.template_key}")

    msg = ChatMessage(
        sender_department=sender,
        recipient_department=recipient,
        message_text=text,
        is_automatic=True,
        request_type=payload.template_key,
    )
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return _out(msg)


@router.patch("/items/{item_id}/toggle", response_model=ChatMessageItemOut)
def toggle_item(item_id: int, db: Session = Depends(get_db)):
    item = db.query(ChatMessageItem).filter(ChatMessageItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Item not found")
    item.is_checked = not item.is_checked  # type:ignore
    db.commit()
    db.refresh(item)
    return item


class ReplyWithItemsRequest(BaseModel):
    sender_department: str
    recipient_department: str
    message_text: Optional[str] = None
    item_ids: List[int] = []


@router.post("/reply-with-items", response_model=ChatMessageOut, status_code=201)
def reply_with_items(payload: ReplyWithItemsRequest, db: Session = Depends(get_db)):
    sender = _dept(payload.sender_department)
    recipient = _dept(payload.recipient_department)

    source_items = (
        db.query(ChatMessageItem).filter(ChatMessageItem.id.in_(payload.item_ids)).all()
        if payload.item_ids else []
    )

    msg = ChatMessage(
        sender_department=sender,
        recipient_department=recipient,
        message_text=(payload.message_text or "").strip() or None,
        is_automatic=False,
        request_type="REPLY_WITH_ITEMS" if source_items else None,
    )
    db.add(msg)
    db.flush()

    for it in source_items:
        db.add(ChatMessageItem(
            chat_message_id=msg.id, job_no=it.job_no,
            customer=it.customer, couple_name=it.couple_name,
            is_checked=True,
        ))

    db.commit()
    db.refresh(msg)
    return _out(msg)


# ── Admin master view — sees everything, read-only ────────────────────
@router.get("/admin/all", response_model=List[ChatMessageOut])
def admin_all_messages(
    department: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    _cleanup_expired(db)
    q = db.query(ChatMessage).filter(ChatMessage.created_at >= _cutoff())
    if department:
        d = _dept(department)
        q = q.filter(or_(
            ChatMessage.sender_department == d,
            ChatMessage.recipient_department == d,
        ))
    rows = q.order_by(desc(ChatMessage.created_at)).all()
    return [_out(m) for m in rows]


@router.post("/cleanup")
def cleanup_now(db: Session = Depends(get_db)):
    before = db.query(ChatMessage).count()
    _cleanup_expired(db)
    after = db.query(ChatMessage).count()
    return {"deleted": before - after}