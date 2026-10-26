"""backend/app/paper_auto.py
Automatic paper-stock deduction.

 * Printing completes a job  -> deduct job.print_pages from the mapped paper size
 * Laminating / Binding add a damage -> deduct `quantity` sheets (1 sheet per unit,
   One Side or Double Side - a reprint always uses one fresh sheet)
 * Not enough stock -> row is kept in paper_pending, Printing gets an alert,
   and it is applied automatically when a packet is added.

Every applied deduction is written as a normal PaperUsageEntry so it appears in
the Paper page exactly like a manual entry (source = AUTO_JOB / AUTO_DAMAGE).
"""
import re
from datetime import datetime

from sqlalchemy import desc
from sqlalchemy.orm import Session

from .models import (
    PaperStock, PaperUsageEntry, PaperPending, PaperPrice,
    DepartmentLog, DepartmentEnum, PAPER_SIZES,
)

# stock paper size -> album sizes that are printed on it
STOCK_TO_ALBUMS = {
    "9x13":  ["10x15", "10x16", "8x24", "8x20", "8x16", "12x16", "12x17", "8x22"],
    "10x16": ["10x20", "10x30", "10x24", "12x18", "10x28", "10x26"],
    "12x16": ["12x24", "12x28", "14x22", "12x30", "15x20", "12x20", "15x22"],
    "13x16": ["15x24"],
    "13x19": ["12x34", "17x24", "12x32", "16x24", "18x24", "12x36"],
}

# album size -> stock paper size (built automatically, used by album_to_paper)
SIZE_MAP = {
    album: stock
    for stock, albums in STOCK_TO_ALBUMS.items()
    for album in albums
}


def album_to_paper(print_size):
    s = str(print_size or "").lower().replace("×", "x").replace("*", "x")
    s = re.sub(r"[^0-9x]", "", s)          # "12 x 30" -> "12x30"
    return SIZE_MAP.get(s)


def _parse_pages(v):
    m = re.search(r"\d+", str(v or ""))
    return int(m.group()) if m else 0


def _apply(db: Session, p: PaperPending) -> bool:
    """Deduct now if stock is enough. Returns True if applied."""
    stock = db.query(PaperStock).filter(PaperStock.size == p.paper_size).first()
    if not stock or stock.balance < p.sheets:
        return False
    stock.balance -= p.sheets
    stock.updated_at = datetime.utcnow()
    db.add(PaperUsageEntry(
        job_no=p.job_no or "-",
        operator_name=p.operator_name or "Auto",
        paper_size=p.paper_size,
        ok_pages=p.ok_pages or 0,
        print_damage=0,
        accu_rp=p.accu_rp or 0,
        bind_rp=p.bind_rp or 0,
        total_used=p.sheets,
        source=p.source,
        source_id=p.source_id,
    ))
    return True


def _queue(db, *, source, source_id, job_no, operator, size, ok=0, accu=0, bind=0):
    sheets = ok + accu + bind
    if sheets <= 0 or size not in PAPER_SIZES:
        return
    p = PaperPending(
        source=source, source_id=source_id, job_no=job_no,
        operator_name=operator, paper_size=size, sheets=sheets,
        ok_pages=ok, accu_rp=accu, bind_rp=bind,
    )
    if not _apply(db, p):
        db.add(p)          # not enough paper -> stays pending + alert


def _already_done(db, source, source_id) -> bool:
    return bool(
        db.query(PaperUsageEntry.id)
        .filter(PaperUsageEntry.source == source, PaperUsageEntry.source_id == source_id)
        .first()
        or db.query(PaperPending.id)
        .filter(PaperPending.source == source, PaperPending.source_id == source_id)
        .first()
    )


# ── Printing finished a job ──────────────────────────────────────────
def auto_deduct_job(db: Session, job):
    if _already_done(db, "AUTO_JOB", job.id):
        return
    pages = _parse_pages(job.print_pages)
    size = album_to_paper(job.print_size)
    if pages <= 0 or not size:
        return             # unknown size / no pages -> nothing to deduct
    log = (
        db.query(DepartmentLog)
        .filter(DepartmentLog.job_id == job.id,
                DepartmentLog.department == DepartmentEnum.PRINTING)
        .order_by(desc(DepartmentLog.entered_at))
        .first()
    )
    _queue(db, source="AUTO_JOB", source_id=job.id, job_no=job.job_no,
           operator=(log.operator_name if log else None), size=size, ok=pages)


# ── Laminating / Binding recorded a damage ───────────────────────────
def auto_deduct_damage(db: Session, entry):
    dept = entry.department.value if hasattr(entry.department, "value") else str(entry.department)
    if dept not in ("LAMINATING", "BINDING"):
        return
    price = db.query(PaperPrice).filter(PaperPrice.id == entry.paper_price_id).first()
    if not price or price.size == "OTHER":
        return
    qty = int(entry.quantity or 0)
    _queue(db, source="AUTO_DAMAGE", source_id=entry.id,
           job_no=entry.job_no or "DAMAGE", operator=entry.operator_name,
           size=price.size,
           accu=qty if dept == "LAMINATING" else 0,
           bind=qty if dept == "BINDING" else 0)


# ── Refund (damage edited / deleted) ─────────────────────────────────
def release_source(db: Session, source: str, source_id: int):
    for e in db.query(PaperUsageEntry).filter(
        PaperUsageEntry.source == source, PaperUsageEntry.source_id == source_id
    ).all():
        stock = db.query(PaperStock).filter(PaperStock.size == e.paper_size).first()
        if stock:
            stock.balance += e.total_used
            stock.updated_at = datetime.utcnow()
        db.delete(e)
    db.query(PaperPending).filter(
        PaperPending.source == source, PaperPending.source_id == source_id
    ).delete(synchronize_session=False)


# ── Packet added -> apply waiting deductions (oldest first) ──────────
def apply_pending(db: Session, size: str) -> int:
    applied = 0
    rows = (
        db.query(PaperPending)
        .filter(PaperPending.paper_size == size)
        .order_by(PaperPending.created_at, PaperPending.id)
        .all()
    )
    for p in rows:
        if _apply(db, p):
            db.delete(p)
            applied += 1
        else:
            break
    return applied


# ── Data for the Printing alert ──────────────────────────────────────
def shortage_alerts(db: Session):
    rows = db.query(PaperPending).order_by(PaperPending.created_at, PaperPending.id).all()
    stock = {s.size: s.balance for s in db.query(PaperStock).all()}
    groups = {}
    for p in rows:
        g = groups.setdefault(p.paper_size, {
            "size": p.paper_size, "need": 0,
            "have": stock.get(p.paper_size, 0), "items": [],
        })
        g["need"] += p.sheets
        g["items"].append({
            "job_no": p.job_no, "sheets": p.sheets,
            "operator_name": p.operator_name, "source": p.source,
        })
    return {"shortages": list(groups.values())}