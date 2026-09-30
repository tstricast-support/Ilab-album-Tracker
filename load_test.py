import httpx
import asyncio
import time

BASE = "http://localhost:8000"


async def hammer(client, path):
    for _ in range(50):
        try:
            r = await client.get(f"{BASE}{path}", timeout=10)
            if r.status_code >= 500:
                print("ERROR:", r.status_code, path)
        except Exception as e:
            print("FAILED:", path, repr(e), type(e).__name__)


async def hammer_write(client, path, payload_fn, iterations=10):
    for i in range(iterations):
        try:
            r = await client.post(f"{BASE}{path}", json=payload_fn(i), timeout=10)
            if r.status_code >= 500:
                print("ERROR:", r.status_code, path)
        except Exception as e:
            print("FAILED:", path, repr(e))
        await asyncio.sleep(0.5)  
async def main():
    async with httpx.AsyncClient() as client:
        tasks = []

        # ── Read-heavy endpoints (unchanged) ──
        read_paths = [
            "/api/jobs?completed=false",
            "/api/stats",
            "/api/stats/departments",
            "/api/chat/unread-count?department=PRINTING",
            "/api/chat/inbox?department=ENTRY",
            "/api/station/printing/queue",
        ]
        for p in read_paths:
            for _ in range(10):
                tasks.append(hammer(client, p))

        # ── Write-heavy endpoint: /api/chat/send ──
        # Fires alongside the reads above so you're testing writes and reads
        # contending for the connection pool / SQLite lock at the same time.
        def chat_payload(i):
            return {
                "sender_department": "ENTRY",
                "recipient_department": "PRINTING",
                "message_text": f"[load_test] message #{i}",
            }

        for _ in range(10):
            tasks.append(hammer_write(client, "/api/chat/send", chat_payload))

        start = time.time()
        await asyncio.gather(*tasks)
        print("Done in", time.time() - start, "s")


asyncio.run(main())