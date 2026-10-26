"""backend/app/emailer.py
Sends the "album finished" email through the Gmail API (HTTPS / port 443).
SMTP is blocked on Railway Hobby, the Gmail API is not.
No extra packages needed - stdlib only."""
import base64
import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from email.message import EmailMessage
from email.utils import formataddr
from html import escape

from sqlalchemy import func

from .config import settings
from .models import JobCard, Photographer, SessionLocal, SL_TZ_OFFSET

log = logging.getLogger("ilab.email")

_TOKEN_URL = "https://oauth2.googleapis.com/token"
_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"
_token = {"value": None, "exp": 0.0}

ALBUM_LABELS = {
    "NORMAL": "Magazine Album",
    "STORY": "Story Album",
    "REBIND": "Rebind Album",
}


def email_configured() -> bool:
    return bool(
        settings.EMAIL_ENABLED
        and settings.GMAIL_CLIENT_ID
        and settings.GMAIL_CLIENT_SECRET
        and settings.GMAIL_REFRESH_TOKEN
    )


def _post(url: str, data: bytes, headers: dict) -> dict:
    req = urllib.request.Request(url, data=data, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode() or "{}")
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="ignore")[:300]
        raise RuntimeError(f"HTTP {e.code}: {body}")


def _access_token() -> str:
    if _token["value"] and time.time() < _token["exp"] - 60:
        return _token["value"]
    data = urllib.parse.urlencode({
        "client_id": settings.GMAIL_CLIENT_ID,
        "client_secret": settings.GMAIL_CLIENT_SECRET,
        "refresh_token": settings.GMAIL_REFRESH_TOKEN,
        "grant_type": "refresh_token",
    }).encode()
    res = _post(_TOKEN_URL, data, {"Content-Type": "application/x-www-form-urlencoded"})
    _token["value"] = res["access_token"]
    _token["exp"] = time.time() + int(res.get("expires_in", 3600))
    return _token["value"]


def send_email(to: str, subject: str, text: str, html: str) -> None:
    msg = EmailMessage()
    msg["To"] = to
    msg["From"] = formataddr(("i Lab Gampaha", settings.GMAIL_SENDER))
    msg["Subject"] = subject
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    _post(
        _SEND_URL,
        json.dumps({"raw": raw}).encode(),
        {
            "Authorization": f"Bearer {_access_token()}",
            "Content-Type": "application/json",
        },
    )


def _val(v):
    v = getattr(v, "value", v)
    v = "" if v is None else str(v).strip()
    return v


def build_album_email(job: JobCard):
    done_at = (job.completed_at + SL_TZ_OFFSET).strftime("%d %b %Y, %I:%M %p") if job.completed_at else ""
    dele = job.dele_date.strftime("%d %b %Y") if job.dele_date else ""

    rows = [
        ("Job No", _val(job.job_no)),
        ("Couple", _val(job.couple_name)),
        ("Album type", ALBUM_LABELS.get(_val(job.album_type), "Magazine Album")),
        ("Print size", _val(job.print_size)),
        ("Pages", _val(job.print_pages)),
        ("Laminate", _val(job.laminate_type)),
        ("Cover", _val(job.laser_cover_type)),
        ("Rexing", _val(job.bind_rexing_no)),
        ("Box", _val(job.box_type)),
        ("Delivery type", _val(job.delivery_type)),
        ("Delivery date", dele),
        ("Finished on", done_at),
    ]
    rows = [(k, v) for k, v in rows if v]

    subject = f"Your album is finished - Job {job.job_no}"

    text = (
        f"Hello {job.customer},\n\n"
        f"Your album has been completed and is ready.\n\n"
        + "\n".join(f"{k}: {v}" for k, v in rows)
        + "\n\nThank you,\ni Lab Gampaha\nSuresh - 071 032 1032\n"
    )

    trs = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;'
        f'width:140px">{escape(k)}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:600;'
        f'color:#111">{escape(v)}</td></tr>'
        for k, v in rows
    )
    html = f"""
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#222">
      <div style="background:#111;color:#f5a623;padding:16px 20px;border-radius:8px 8px 0 0;
                  font-size:18px;font-weight:800">i Lab Gampaha</div>
      <div style="border:1px solid #ddd;border-top:none;padding:20px;border-radius:0 0 8px 8px">
        <p style="margin:0 0 6px">Hello <b>{escape(_val(job.customer))}</b>,</p>
        <p style="margin:0 0 16px">Your album has been <b style="color:#16a34a">completed</b> and is ready.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">{trs}</table>
        <p style="margin:18px 0 0;font-size:13px;color:#555">
          Thank you,<br>i Lab Gampaha<br>Suresh - 071 032 1032</p>
      </div>
    </div>"""
    return subject, text, html


def notify_album_finished(job_id: int, force: bool = False) -> str:
    """Runs in a background task. Never raises. Returns a status string."""
    if not email_configured():
        return "skipped: email not configured"

    db = SessionLocal()
    claimed = False
    try:
        job = db.query(JobCard).filter(JobCard.id == job_id).first()
        if not job:
            return "skipped: job not found"
        if job.email_sent_at is not None and not force:
            return "skipped: already sent"

        key = (job.customer or "").strip().lower()
        ph = (
            db.query(Photographer)
            .filter(func.lower(func.trim(Photographer.name)) == key)
            .first()
        )
        if not ph:
            return "skipped: photographer not in Manage list"
        if not ph.email:
            return "skipped: photographer has no email"

        # Claim first (atomic) so two requests can never send twice.
        # updated_at is kept unchanged so History calendars aren't affected.
        q = db.query(JobCard).filter(JobCard.id == job_id)
        if not force:
            q = q.filter(JobCard.email_sent_at.is_(None))
        n = q.update(
            {"email_sent_at": datetime.utcnow(), "updated_at": JobCard.updated_at},
            synchronize_session=False,
        )
        db.commit()
        if n == 0:
            return "skipped: already sent"
        claimed = True

        db.refresh(job)
        subject, text, html = build_album_email(job)
        send_email(ph.email, subject, text, html)
        log.info("Album email sent: job %s -> %s", job.job_no, ph.email)
        return f"sent to {ph.email}"
    except Exception as e:
        log.exception("Album email failed for job id %s", job_id)
        db.rollback()
        if claimed:  # release the claim so it can be retried
            db.query(JobCard).filter(JobCard.id == job_id).update(
                {"email_sent_at": None, "updated_at": JobCard.updated_at},
                synchronize_session=False,
            )
            db.commit()
        return f"failed: {e}"
    finally:
        db.close()