import { useState, useEffect, useCallback, useRef } from "react";
import { MessageCircle, X, Search, Send, Zap } from "lucide-react";
import { API_BASE, POLL_INTERVAL_MS } from "./config.js";

async function chatFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).detail || msg;
    } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const chatApi = {
  inbox: (department, withDept = "") =>
    chatFetch(
      `/api/chat/inbox?department=${department}${withDept ? `&with_dept=${withDept}` : ""}`,
    ),
  unreadCount: (department) =>
    chatFetch(`/api/chat/unread-count?department=${department}`),
  send: (body) =>
    chatFetch("/api/chat/send", { method: "POST", body: JSON.stringify(body) }),
  albumListRequest: (body) =>
    chatFetch("/api/chat/album-list-request", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  quickRequest: (body) =>
    chatFetch("/api/chat/quick-request", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  toggleItem: (itemId) =>
    chatFetch(`/api/chat/items/${itemId}/toggle`, { method: "PATCH" }),
  replyWithItems: (body) =>
    chatFetch("/api/chat/reply-with-items", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  adminAll: (department = "") =>
    chatFetch(
      `/api/chat/admin/all${department ? `?department=${department}` : ""}`,
    ),
};

const DEPT_LABELS = {
  ENTRY: "Entry",
  PRINTING: "Printing",
  LAMINATING: "Laminating",
  LASER_CUTTING: "Laser Cutting",
  BINDING: "Binding",
  ADMIN: "Admin",
};
const ALL_DEPTS = [
  "ENTRY",
  "PRINTING",
  "LAMINATING",
  "LASER_CUTTING",
  "BINDING",
  "ADMIN",
];

function fmtTime(iso) {
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 640);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 640);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

function UnreadDot({ count }) {
  if (!count) return null;
  return (
    <span
      style={{
        position: "absolute",
        top: -4,
        right: -4,
        minWidth: 18,
        height: 18,
        borderRadius: 9,
        background: "var(--red)",
        color: "#fff",
        fontSize: 10,
        fontWeight: 800,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 4px",
        border: "2px solid var(--bg0)",
      }}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

function ChecklistMessage({ msg, myDept, otherDept, onReplied, addToast }) {
  const [search, setSearch] = useState("");
  const [customMsg, setCustomMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [localItems, setLocalItems] = useState(msg.items);

  useEffect(() => setLocalItems(msg.items), [msg.items]);

  async function toggle(item) {
    setLocalItems((its) =>
      its.map((i) =>
        i.id === item.id ? { ...i, is_checked: !i.is_checked } : i,
      ),
    );
    try {
      await chatApi.toggleItem(item.id);
    } catch (err) {
      addToast?.(err.message, "error");
    }
  }

  async function sendReply() {
    const checkedIds = localItems.filter((i) => i.is_checked).map((i) => i.id);
    if (checkedIds.length === 0 && !customMsg.trim()) return;
    setSending(true);
    try {
      await chatApi.replyWithItems({
        sender_department: myDept,
        recipient_department: otherDept,
        message_text: customMsg.trim() || undefined,
        item_ids: checkedIds,
      });
      setCustomMsg("");
      addToast?.("✓ Reply sent.", "success");
      onReplied?.();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSending(false);
    }
  }

  const filtered = localItems.filter((it) => {
    if (!search.trim()) return true;
    const t = search.trim().toLowerCase();
    return (
      it.job_no?.toLowerCase().includes(t) ||
      it.customer?.toLowerCase().includes(t) ||
      it.couple_name?.toLowerCase().includes(t)
    );
  });

  const isOwnMessage = msg.sender_department === myDept;
  const isAlbumList = msg.request_type === "ALBUM_LIST_3DAY_PRONTO";

  return (
    <div
      style={{
        background: isAlbumList
          ? "var(--warn-bg)"
          : isOwnMessage
            ? "var(--bg3)"
            : "var(--info-bg)",
        border: `1px solid ${isAlbumList ? "var(--amber)" : "var(--border)"}`,
        borderRadius: 8,
        padding: 10,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {isAlbumList && (
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            color: "var(--amber)",
            textTransform: "uppercase",
            letterSpacing: ".08em",
          }}
        >
          Pronto Album List Request
        </div>
      )}
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: isAlbumList ? "var(--text-pri)" : "var(--amber)",
        }}
      >
        {msg.message_text}
      </div>

      {localItems.length > 5 && (
        <div style={{ position: "relative" }}>
          <Search
            size={12}
            style={{
              position: "absolute",
              left: 8,
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-dim)",
            }}
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            style={{
              margin: 0,
              paddingLeft: 26,
              fontSize: 12,
              padding: "5px 8px 5px 26px",
            }}
          />
        </div>
      )}

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          maxHeight: 220,
          overflowY: "auto",
        }}
      >
        {filtered.length === 0 && (
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            No matching items.
          </div>
        )}
        {filtered.map((it) => (
          <label
            key={it.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "5px 8px",
              borderRadius: 5,
              background: "var(--bg2)",
              border: "1px solid var(--border)",
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={!!it.is_checked}
              onChange={() => toggle(it)}
              style={{ width: 14, height: 14, margin: 0 }}
            />
            <span
              style={{
                fontFamily: "var(--fm)",
                fontSize: 11,
                fontWeight: 800,
                color: "var(--amber)",
              }}
            >
              {it.job_no}
            </span>
            <span
              style={{
                fontSize: 11,
                color: "var(--text-sec)",
                flex: 1,
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {it.customer}
              {it.couple_name ? ` / ${it.couple_name}` : ""}
            </span>
          </label>
        ))}
      </div>

      {!isOwnMessage && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={customMsg}
            onChange={(e) => setCustomMsg(e.target.value)}
            placeholder="Optional custom message…"
            rows={2}
            style={{ fontSize: 12 }}
          />
          <button
            onClick={sendReply}
            disabled={sending}
            style={{
              padding: "7px 0",
              fontSize: 12,
              fontWeight: 700,
              borderRadius: 6,
              background: sending ? "var(--bg3)" : "var(--amber)",
              color: sending ? "var(--text-dim)" : "#000",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
            }}
          >
            <Send size={12} />{" "}
            {sending ? "Sending…" : "Send Checked Items Back"}
          </button>
        </div>
      )}
    </div>
  );
}

function PlainBubble({ msg, myDept }) {
  const mine = msg.sender_department === myDept;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
      }}
    >
      <div
        style={{
          maxWidth: "80%",
          background: mine ? "var(--amber)" : "var(--bg2)",
          color: mine ? "#000" : "var(--text-pri)",
          border: mine ? "none" : "1px solid var(--border)",
          borderRadius: 8,
          padding: "7px 11px",
          fontSize: 13,
        }}
      >
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            opacity: 0.7,
            marginBottom: 2,
          }}
        >
          {DEPT_LABELS[msg.sender_department] || msg.sender_department} ·{" "}
          {fmtTime(msg.created_at)}
        </div>
        {msg.message_text}
      </div>
    </div>
  );
}

// ── Album List request modal — special, restricted, deliberate flow ──
function AlbumListModal({ onClose, onSent, addToast }) {
  const [days, setDays] = useState(3);
  const [albumType, setAlbumType] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    try {
      await chatApi.albumListRequest({
        sender_department: "PRINTING",
        recipient_department: "BINDING",
        days,
        album_type: albumType || undefined,
      });
      addToast?.("✓ Pronto album list sent to Binding.", "success");
      onSent?.();
      onClose();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9700,
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg1)",
          border: "1px solid var(--amber)",
          borderRadius: 12,
          padding: 22,
          width: "100%",
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--text-dim)",
            textTransform: "uppercase",
            letterSpacing: ".1em",
          }}
        >
          Special Request → Binding
        </div>
        <div style={{ fontSize: 16, fontWeight: 800, color: "var(--amber)" }}>
          📋 Pronto Album List
        </div>
        <div>
          <label>Days back</label>
          <input
            type="number"
            min="1"
            max="14"
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 1)}
          />
        </div>
        <div>
          <label>Album Type</label>
          <select
            value={albumType}
            onChange={(e) => setAlbumType(e.target.value)}
          >
            <option value="">All Types</option>
            <option value="NORMAL">Magazine Album</option>
            <option value="STORY">Story Album</option>
            <option value="REBIND">Rebind Album</option>
          </select>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={submit}
            disabled={sending}
            style={{
              flex: 1,
              padding: "11px 0",
              background: "var(--amber)",
              color: "#000",
              borderRadius: 8,
              fontWeight: 800,
            }}
          >
            {sending ? "Sending…" : "Send to Binding"}
          </button>
          <button
            onClick={onClose}
            style={{
              padding: "11px 16px",
              background: "var(--bg3)",
              color: "var(--text-sec)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Admin Broadcast Alert — full-screen, blocking, persists until dismissed ──
const ADMIN_ALERT_STORAGE_PREFIX = "ilab-admin-alert-seen:";

function AdminBroadcastAlert({ myDept, onOpenChat }) {
  const [pending, setPending] = useState(null); // latest unseen admin message
  const isMobile = useIsMobile();

  const check = useCallback(async () => {
    if (myDept === "ADMIN") return; // admin doesn't alert itself
    try {
      const inbox = await chatApi.inbox(myDept, "ADMIN");
      const fromAdmin = inbox.filter((m) => m.sender_department === "ADMIN");
      if (fromAdmin.length === 0) return;

      const latest = fromAdmin[fromAdmin.length - 1];
      const storageKey = `${ADMIN_ALERT_STORAGE_PREFIX}${myDept}`;
      const lastSeenId = Number(localStorage.getItem(storageKey) || 0);

      if (latest.id > lastSeenId) {
        setPending(latest);
      }
    } catch {}
  }, [myDept]);

  useEffect(() => {
    check();
    const t = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [check]);

  function dismiss() {
    if (pending) {
      localStorage.setItem(
        `${ADMIN_ALERT_STORAGE_PREFIX}${myDept}`,
        String(pending.id),
      );
    }
    setPending(null);
  }

  function replyNow() {
    dismiss();
    onOpenChat?.();
  }

  if (!pending) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,.75)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: 16,
      }}
    >
      <div
        style={{
          background: "var(--bg1)",
          border: "2px solid var(--red)",
          borderRadius: 14,
          padding: isMobile ? 22 : 30,
          width: "100%",
          maxWidth: 440,
          boxShadow: "0 12px 50px rgba(0,0,0,.6)",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: "var(--red)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".12em",
          }}
        >
          ~ Message From Admin ~
        </div>

        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-pri)",
            lineHeight: 1.6,
          }}
        >
          {pending.message_text}
        </div>

        <div
          style={{
            fontSize: 12,
            color: "var(--text-dim)",
            borderTop: "1px solid var(--border)",
            paddingTop: 10,
          }}
        >
          Sent {fmtTime(pending.created_at)}
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={replyNow}
            style={{
              flex: 1,
              padding: "13px 0",
              background: "var(--amber)",
              color: "#000",
              borderRadius: 8,
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            Open Chat & Reply
          </button>
          <button
            onClick={dismiss}
            style={{
              padding: "13px 18px",
              background: "var(--bg3)",
              color: "var(--text-sec)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontWeight: 700,
            }}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────
export function ChatWidget({ myDept, addToast }) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [otherDept, setOtherDept] = useState(
    ALL_DEPTS.find((d) => d !== myDept) || "PRINTING",
  );
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showAlbumModal, setShowAlbumModal] = useState(false);
  const [unread, setUnread] = useState({ total: 0, by_sender: {} });
  const bottomRef = useRef(null);
  const knownTotalRef = useRef(0);

  const reload = useCallback(() => {
    chatApi
      .inbox(myDept, otherDept)
      .then(setMessages)
      .catch(() => {});
  }, [myDept, otherDept]);

  const pollUnread = useCallback(async () => {
    try {
      const u = await chatApi.unreadCount(myDept);
      if (!open && u.total > knownTotalRef.current) {
        const newSenders = Object.keys(u.by_sender).filter(
          (s) => (u.by_sender[s] || 0) > 0,
        );
        addToast?.(
          `New message${u.total !== 1 ? "s" : ""} from ${newSenders.map((s) => DEPT_LABELS[s] || s).join(", ")}`,
          "info",
        );
      }
      knownTotalRef.current = u.total;
      setUnread(u);
    } catch {}
  }, [myDept, open, addToast]);

  useEffect(() => {
    pollUnread();
    const t = setInterval(pollUnread, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [pollUnread]);

  useEffect(() => {
    if (!open) return;
    reload();
    const t = setInterval(() => {
      reload();
      pollUnread();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [open, reload, pollUnread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function sendPlain() {
    if (!text.trim()) return;
    setSending(true);
    try {
      await chatApi.send({
        sender_department: myDept,
        recipient_department: otherDept,
        message_text: text.trim(),
      });
      setText("");
      reload();
    } catch (err) {
      addToast?.(err.message, "error");
    } finally {
      setSending(false);
    }
  }

  const showAlbumListBtn = myDept === "PRINTING" && otherDept === "BINDING";

  return (
    <>
      {/* Moved to bottom-LEFT so it never overlaps the scroll-to-top button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Department Chat"
        style={{
          position: "fixed",
          bottom: isMobile ? 18 : 26,
          right: isMobile ? 66 : 84,
          zIndex: 8500,
          width: isMobile ? 42 : 52,
          height: isMobile ? 42 : 52,
          borderRadius: "50%",
          background: "var(--amber)",
          color: "#000",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,.5)",
        }}
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && <UnreadDot count={unread.total} />}
      </button>

      {open && (
        <div
          className="si"
          style={{
            position: "fixed",
            bottom: isMobile ? 70 : 92,
            right: isMobile ? 12 : 24,
            zIndex: 8500,
            width: 340,
            maxWidth: "92vw",
            height: 480,
            maxHeight: "70vh",
            background: "var(--bg1)",
            border: "1px solid var(--border)",
            borderRadius: 12,
            display: "flex",
            flexDirection: "column",
            boxShadow: "0 10px 40px rgba(0,0,0,.55)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              padding: "10px 12px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: 10,
                color: "var(--text-dim)",
                textTransform: "uppercase",
                letterSpacing: ".1em",
              }}
            >
              Chat with
            </div>
            <select
              value={otherDept}
              onChange={(e) => setOtherDept(e.target.value)}
              style={{ margin: "4px 0 0", fontSize: 13, padding: "6px 10px" }}
            >
              {ALL_DEPTS.filter((d) => d !== myDept).map((d) => (
                <option key={d} value={d}>
                  {DEPT_LABELS[d]}
                  {unread.by_sender[d] ? ` (${unread.by_sender[d]} new)` : ""}
                </option>
              ))}
            </select>
          </div>

          {showAlbumListBtn && (
            <div
              style={{
                padding: "8px 12px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <button
                onClick={() => setShowAlbumModal(true)}
                style={{
                  width: "100%",
                  padding: "8px 6px",
                  fontSize: 12,
                  fontWeight: 700,
                  borderRadius: 6,
                  background: "var(--warn-bg)",
                  color: "var(--amber)",
                  border: "1px solid var(--amber)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                }}
              >
                <Zap size={13} /> Send Pronto Album List
              </button>
            </div>
          )}

          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: 10,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {messages.length === 0 && (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--text-dim)",
                  fontSize: 12,
                  padding: "20px 0",
                }}
              >
                No messages in the last 24h.
              </div>
            )}
            {messages.map((m) =>
              m.is_automatic || m.items?.length > 0 ? (
                <ChecklistMessage
                  key={m.id}
                  msg={m}
                  myDept={myDept}
                  otherDept={otherDept}
                  onReplied={reload}
                  addToast={addToast}
                />
              ) : (
                <PlainBubble key={m.id} msg={m} myDept={myDept} />
              ),
            )}
            <div ref={bottomRef} />
          </div>

          <div
            style={{
              display: "flex",
              gap: 6,
              padding: 10,
              borderTop: "1px solid var(--border)",
            }}
          >
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendPlain()}
              placeholder="Type a message…"
              style={{ margin: 0, flex: 1, fontSize: 13 }}
            />
            <button
              onClick={sendPlain}
              disabled={sending || !text.trim()}
              style={{
                padding: "0 14px",
                background: "var(--amber)",
                color: "#000",
                borderRadius: 6,
                fontWeight: 700,
              }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      )}

      {showAlbumModal && (
        <AlbumListModal
          onClose={() => setShowAlbumModal(false)}
          onSent={reload}
          addToast={addToast}
        />
      )}

      <AdminBroadcastAlert
        myDept={myDept}
        onOpenChat={() => {
          setOtherDept("ADMIN");
          setOpen(true);
        }}
      />
    </>
  );
}

// ── Admin master view — no Pronto quick button here, read-only supervisor ──
export function AdminChatPage({ Shell, useToast, ToastStack }) {
  const { toasts, add } = useToast();
  const [filterDept, setFilterDept] = useState("");
  const [messages, setMessages] = useState([]);

  const reload = useCallback(() => {
    chatApi
      .adminAll(filterDept)
      .then(setMessages)
      .catch((e) => add(e.message, "error"));
  }, [filterDept]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);

  return (
    <>
      <Shell title="ADMIN - DEPARTMENT CHAT" accent="var(--red)">
        <div
          style={{ fontSize: 11, color: "var(--text-dim)", marginBottom: 10 }}
        >
          Read-only supervisory view. Admin does not send requests here.
        </div>
        <div
          style={{
            display: "flex",
            gap: 8,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {["", ...ALL_DEPTS].map((d) => (
            <button
              key={d || "ALL"}
              onClick={() => setFilterDept(d)}
              style={{
                padding: "7px 16px",
                fontSize: 12,
                fontWeight: 700,
                borderRadius: 6,
                background: filterDept === d ? "var(--amber)" : "var(--bg2)",
                color: filterDept === d ? "#000" : "var(--text-sec)",
                border: `1px solid ${filterDept === d ? "var(--amber)" : "var(--border)"}`,
              }}
            >
              {d ? DEPT_LABELS[d] : "All Departments"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {messages.length === 0 && (
            <div
              style={{
                textAlign: "center",
                padding: "40px 0",
                color: "var(--text-dim)",
              }}
            >
              No chat activity in the last 24h.
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              style={{
                background: "var(--bg2)",
                border: "1px solid var(--border)",
                borderLeft: `4px solid ${m.is_automatic ? "var(--purple)" : "var(--blue)"}`,
                borderRadius: 8,
                padding: "10px 14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: "var(--amber)",
                  }}
                >
                  {DEPT_LABELS[m.sender_department]} →{" "}
                  {DEPT_LABELS[m.recipient_department]}
                  {m.is_automatic && (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--purple)",
                        color: "#000",
                        fontWeight: 800,
                      }}
                    >
                      AUTO
                    </span>
                  )}
                  {!m.is_read && (
                    <span
                      style={{
                        marginLeft: 6,
                        fontSize: 10,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "var(--red)",
                        color: "#fff",
                        fontWeight: 800,
                      }}
                    >
                      UNREAD
                    </span>
                  )}
                </span>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
                  {fmtTime(m.created_at)}
                </span>
              </div>
              <div
                style={{ fontSize: 13, color: "var(--text-pri)", marginTop: 4 }}
              >
                {m.message_text}
              </div>
              {m.items?.length > 0 && (
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginTop: 6,
                  }}
                >
                  {m.items.length} item{m.items.length !== 1 ? "s" : ""} ·{" "}
                  {m.items.filter((i) => i.is_checked).length} checked
                </div>
              )}
            </div>
          ))}
        </div>
      </Shell>
      <ToastStack toasts={toasts} />
    </>
  );
}
