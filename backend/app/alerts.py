import json
import logging
import threading
import time
import urllib.request

from .config import settings

log = logging.getLogger("ilab.alerts")
_last_sent: dict[str, float] = {}
_sent_times: list[float] = []          # timestamps of recent alerts (global limit)
_lock = threading.Lock()               # send_alert can run from many threads

COOLDOWN_SECONDS = 300      # same alert at most once per 5 minutes
GLOBAL_WINDOW_SECONDS = 600 # look back 10 minutes...
GLOBAL_MAX_ALERTS = 20      # ...and allow at most 20 alerts in that window


def _post(text: str) -> None:
    try:
        url = f"https://api.telegram.org/bot{settings.TELEGRAM_BOT_TOKEN}/sendMessage"
        data = json.dumps({"chat_id": settings.TELEGRAM_CHAT_ID, "text": text}).encode()
        req = urllib.request.Request(
            url, data=data, headers={"Content-Type": "application/json"}, method="POST"
        )
        urllib.request.urlopen(req, timeout=10).read()
    except Exception:
        log.exception("Telegram alert failed")


def send_alert(title: str, detail: str = "", key: str | None = None) -> None:
    """Never raises, never blocks the request."""
    if not (settings.ALERTS_ENABLED and settings.TELEGRAM_BOT_TOKEN and settings.TELEGRAM_CHAT_ID):
        return
    k = key or title
    now = time.time()

    with _lock:
        # 1) per-key cooldown
        if now - _last_sent.get(k, 0) < COOLDOWN_SECONDS:
            return

        # 2) global limit: drop timestamps older than the window, then check
        _sent_times[:] = [t for t in _sent_times if now - t < GLOBAL_WINDOW_SECONDS]
        if len(_sent_times) >= GLOBAL_MAX_ALERTS:
            return
        _sent_times.append(now)

        _last_sent[k] = now

        # 3) stop _last_sent growing forever
        if len(_last_sent) > 500:
            for old_key in [x for x, t in _last_sent.items() if now - t > COOLDOWN_SECONDS]:
                del _last_sent[old_key]

    text = f"ALERT [{settings.ENV}] {title}\n{detail}"[:3900]
    threading.Thread(target=_post, args=(text,), daemon=True).start()


class AlertLogHandler(logging.Handler):
    """Any log.error / log.exception in the backend sends an alert."""
    def emit(self, record):
        if record.name.startswith("ilab.alerts"):
            return   # prevents an alert loop
        try:
            send_alert(
                f"Log {record.levelname}: {record.name}",
                self.format(record)[-1500:],
                key=f"log:{record.name}:{record.getMessage()[:80]}",
            )
        except Exception:
            pass


def install_log_alerts():
    h = AlertLogHandler(level=logging.ERROR)
    h.setFormatter(logging.Formatter("%(message)s"))
    logging.getLogger().addHandler(h)