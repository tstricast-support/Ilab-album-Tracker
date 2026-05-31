import { useState, useEffect, useCallback, useRef } from "react";
import { API_BASE, POLL_INTERVAL_MS, APP_NAME } from "./config.js";
import {ArrowRight, Calendar,Pen,SquareX, Trash,Printer,TriangleAlert,Flame,Activity, Speech}from "lucide-react";
import logo from "./assets/logo.jpg";

// ── API ───────────────────────────────────────────────────────────────────────
async function apiFetch(path, opts = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...opts.headers },
    ...opts,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

const api = {
  jobs:          (done = false) => apiFetch(`/api/jobs?completed=${done}`),
  createJob:     (body)         => apiFetch("/api/jobs", { method: "POST", body: JSON.stringify(body) }),
  updateJob: (id, body) => apiFetch(`/api/jobs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteJob:     (id)           => apiFetch(`/api/jobs/${id}`, { method: "DELETE" }),
  queue:         (dept)         => apiFetch(`/api/station/${dept}/queue`),
  advance:       (id, dept, action) => apiFetch(`/api/jobs/${id}/advance/${dept}`, {
    method: "POST", body: JSON.stringify({ action }),
  }),
  stats:         ()             => apiFetch("/api/stats"),
  deptStats: () => apiFetch("/api/stats/departments"),
  setReason:     (id, dept, reason) => apiFetch(`/api/jobs/${id}/delay-reason/${dept}`, {
    method: "POST", body: JSON.stringify({ reason }),
  }),
  presetReasons: (dept)         => apiFetch(`/api/delay-reasons/${dept}`),
  analytics:     (from, to)     => apiFetch(`/api/analytics?from=${from}&to=${to}`),
};

// ── Role management ───────────────────────────────────────────────────────────
function initRole() {
  let role = sessionStorage.getItem("role");
  if (!role) {
    const p = window.location.pathname;
    if (p === "/entry") role = "ENTRY";
    else {
      const m = p.match(/^\/station\/([\w]+)$/);
      role = m ? m[1].toUpperCase() : "ADMIN";
    }
    sessionStorage.setItem("role", role);
  }
  return role;
}

const ROLE     = initRole();
const IS_ADMIN = ROLE === "ADMIN";

function getDeptHomePath() {
  if (ROLE === "ENTRY") return "/entry";
  if (["PRINTING", "LAMINATING", "LASER_CUTTING", "BINDING"].includes(ROLE))
    return `/station/${ROLE.toLowerCase()}`;
  return "/";
}

function getDeptLabel() {
  const map = {
    PRINTING: "Printing", LAMINATING: "Laminating",
    LASER_CUTTING: "Laser Cutting", BINDING: "Binding", ENTRY: "Entry",
  };
  return map[ROLE] || "Station";
}

// ── Router ────────────────────────────────────────────────────────────────────
function getPage() {
  const p = window.location.pathname;
  if (p === "/entry")     return { page: "entry" };
  if (p === "/history")   return { page: "history" };
  if (p === "/analytics") return { page: "analytics" };
  const m = p.match(/^\/station\/([\w]+)$/);
  if (m) return { page: "station", dept: m[1] };
  return { page: "dashboard" };
}

function navigate(path) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}



// ── Nav items (admin dashboard only) ─────────────────────────────────────────
const NAV_ITEMS = [
  { label: "Dashboard",     path: "/",                     accent: "var(--amber)"  },
  { label: "Entry",         path: "/entry",                accent: "var(--amber)"  },
  { label: "Printing",      path: "/station/printing",     accent: "#3b82f6"       },
  { label: "Laminating",    path: "/station/laminating",   accent: "#06b6d4"       },
  { label: "Laser Cut",     path: "/station/laser_cutting",accent: "#a855f7"       },
  { label: "Binding",       path: "/station/binding",      accent: "#22c55e"       },
];

// ── Toast ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
  }, []);
  return { toasts, add };
}



function ToastStack({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div style={{ position: "fixed", bottom: 22, right: 22, zIndex: 9999, display: "flex", flexDirection: "column", gap: 8 }}>
      {toasts.map(t => {
        const c = { success: "var(--green)", error: "var(--red)", info: "var(--blue)" }[t.type] || "var(--border)";
        return (
          <div key={t.id} className="si" style={{
            background: "var(--bg2)", border: `1px solid ${c}`, borderLeft: `4px solid ${c}`,
            borderRadius: 8, padding: "11px 16px", minWidth: 260,
            boxShadow: "0 4px 20px rgba(0,0,0,.5)", fontSize: 14, color: "var(--text-pri)",
          }}>{t.msg}</div>
        );
      })}
    </div>
  );
}

// ── Expiry badge ──────────────────────────────────────────────────────────────
function ExpiryBadge({ completedAt }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (!completedAt) return null;
  const remaining = new Date(completedAt).getTime() + 24 * 3600000 - Date.now();
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const isUrgent = remaining < 4 * 3600000;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      fontFamily: "var(--fm)", background: isUrgent ? "#2a0a00" : "var(--bg3)",
      color: isUrgent ? "#ff9060" : "var(--text-dim)",
      border: `1px solid ${isUrgent ? "#6a2a00" : "var(--border)"}`,
    }}>{h}h {m}m</span>
  );
}

// ── Delay reason modal ────────────────────────────────────────────────────────
function DelayReasonModal({ job, dept, onClose, onSaved, addToast }) {
  const [presets, setPresets] = useState([]);
  const [custom,  setCustom]  = useState("");
  const [saving,  setSaving]  = useState(false);
  const existingLog = job.logs?.find(l => l.department === dept && !l.exited_at && l.delay_reason);
  useEffect(() => {
    api.presetReasons(dept).then(d => setPresets(d.reasons || [])).catch(() => {});
    if (existingLog?.delay_reason) setCustom(existingLog.delay_reason);
  }, [dept]);
  async function save(reason) {
    if (!reason.trim()) return;
    setSaving(true);
    try {
      await api.setReason(job.id, dept, reason);
      addToast(`✓ Reason saved for Job #${job.job_no}`, "success");
      onSaved(); onClose();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }
  const deptLabel = { PRINTING: "Printing", LAMINATING: "Laminating", LASER_CUTTING: "Laser Cutting", BINDING: "Binding" }[dept] || dept;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.75)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontFamily: "var(--fd)", fontSize: 12, color: "var(--red)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>⏱ DELAY REASON — {deptLabel}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>{job.job_no}</div>
          <div style={{ fontSize: 14, color: "var(--text-sec)" }}>{job.customer}</div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Quick Select</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {presets.filter(p => p !== "Other").map(p => (
              <button key={p} onClick={() => save(p)} disabled={saving} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, borderRadius: 4, background: custom === p ? "var(--amber)" : "var(--bg3)", color: custom === p ? "var(--bg0)" : "var(--text-sec)", border: `1px solid ${custom === p ? "var(--amber)" : "var(--border)"}` }}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>Custom Reason</div>
          <textarea value={custom} onChange={e => setCustom(e.target.value)} placeholder="Type custom reason here…" rows={3} style={{ width: "100%", resize: "vertical", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => save(custom)} disabled={saving || !custom.trim()} style={{ flex: 1, padding: "11px 0", fontWeight: 800, fontSize: 14, borderRadius: 6, background: custom.trim() ? "var(--amber)" : "var(--bg3)", color: custom.trim() ? "var(--bg0)" : "var(--text-dim)" }}>{saving ? "Saving…" : "✓ Save Reason"}</button>
          <button onClick={onClose} style={{ padding: "11px 18px", fontWeight: 700, fontSize: 14, borderRadius: 6, background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)" }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function GlobalResponsiveStyles() {
  useEffect(() => {
    const id = "ilab-responsive-styles";
    if (document.getElementById(id)) return;
    const style = document.createElement("style");
    style.id = id;
    style.textContent = `
      /* ── Mobile viewport fix ── */
      html { -webkit-text-size-adjust: 100%; }
      * { -webkit-tap-highlight-color: transparent; }
 
      /* ── Touch targets: all buttons at least 44px tall on mobile ── */
      @media (max-width: 640px) {
        button { min-height: 40px; }
        input, select, textarea { font-size: 16px !important; } /* prevents iOS zoom */
      }
 
      /* ── Responsive grid helpers ── */
      .r-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px; }
      .r-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
      .r-grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
      .r-grid-entry { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
 
      @media (max-width: 640px) {
        .r-grid-3, .r-grid-2, .r-grid-4, .r-grid-entry {
          grid-template-columns: 1fr !important;
        }
        .r-grid-stats {
          grid-template-columns: 1fr 1fr !important;
        }
        .r-grid-intelligence {
          grid-template-columns: 1fr !important;
        }
        .r-grid-throughput {
          grid-template-columns: 1fr 1fr !important;
        }
        .r-history-layout {
          grid-template-columns: 1fr !important;
        }
        .r-stage-row {
          grid-template-columns: 1fr 1fr !important;
        }
        .r-header-title {
          font-size: 15px !important;
          letter-spacing: .02em !important;
        }
        .r-stat-num {
          font-size: 32px !important;
        }
        .r-hide-mobile {
          display: none !important;
        }
        .r-main-pad {
          padding: 12px !important;
        }
        .r-nav-bar {
          gap: 0 !important;
          padding: 0 4px !important;
        }
        .r-nav-btn {
          padding: 0 8px !important;
          font-size: 10px !important;
        }
        .r-job-header {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 8px !important;
        }
        .r-job-date-box {
          align-self: flex-start !important;
          flex-direction: row !important;
          align-items: center !important;
          gap: 10px !important;
          padding: 6px 12px !important;
          min-width: unset !important;
        }
        .r-bottleneck-row {
          flex-direction: column !important;
          align-items: flex-start !important;
          gap: 6px !important;
        }
        .r-goal-inner {
          flex-direction: column !important;
          align-items: center !important;
        }
        .r-history-card-header {
          flex-wrap: wrap !important;
          gap: 6px !important;
        }
        .r-station-queue-num {
          font-size: 32px !important;
        }
        .r-entry-form {
          padding: 12px !important;
        }
        /* ── Dashboard mobile font boosts ── */
        .r-dash-label {
          font-size: 12px !important;
        }
        .r-dash-section-title {
          font-size: 13px !important;
          letter-spacing: .08em !important;
        }
        .r-job-no {
          font-size: 18px !important;
        }
        .r-customer-name {
          font-size: 15px !important;
        }
        .r-chip-val {
          font-size: 13px !important;
        }
        .r-tab-btn {
          font-size: 13px !important;
        }
        .r-nav-btn {
          font-size: 11px !important;
        }
      }
 
      @media (max-width: 400px) {
        .r-grid-stats {
          grid-template-columns: 1fr !important;
        }
        .r-grid-throughput {
          grid-template-columns: 1fr 1fr !important;
        }
      }
    `;
    document.head.appendChild(style);
  }, []);
  return null;
}
 


// ── Shell ─────────────────────────────────────────────────────────────────────
function Shell({ title, accent = "var(--amber)", topRight, children }) {
  const [, forceUpdate] = useState(0);
  const isMobile = useIsMobile();
 
  useEffect(() => {
    const handler = () => forceUpdate(n => n + 1);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
 
  const path        = window.location.pathname;
  const onDashboard = path === "/";
  const onHistory   = path === "/history";
 
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg0)" }}>
      <header style={{
        background: "var(--bg1)", borderBottom: "1px solid var(--border)",
        padding: isMobile ? "0 10px" : "0 20px",
        height: isMobile ? 50 : 56,
        display: "flex", alignItems: "center",
        gap: isMobile ? 8 : 14,
        position: "sticky", top: 0, zIndex: 100,
        boxShadow: "0 2px 16px rgba(0,0,0,.45)",
      }}>
        <div style={{ width: 3, height: 36, background: accent, borderRadius: 2, flexShrink: 0 }} />
        <img src={logo} alt="Logo" style={{ height: isMobile ? 32 : 40, borderRadius: 50 }} />
        <span className="r-header-title" style={{
          fontFamily: "var(--fm)", fontWeight: 700,
          fontSize: isMobile ? 13 : 16,
          letterSpacing: ".04em", color: "var(--text-pri)", flex: 1,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>{title}</span>
 
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
          {IS_ADMIN && !onDashboard && (
            <button onClick={() => navigate("/")} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--amber)", color: "#000",
              border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>← {isMobile ? "" : "Dashboard"}{isMobile ? "Home" : ""}</button>
          )}
 
          {IS_ADMIN && !onHistory && (
            <button onClick={() => navigate("/history")} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--bg3)", color: "white",
              border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>{isMobile ? <Calendar size={14}/> : "History"}</button>
          )}
 
          {!IS_ADMIN && !onHistory && (
            <button onClick={() => navigate("/history")} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--bg3)", color: "white",
              border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>{isMobile ? <Calendar size={14}/> : "History"}</button>
          )}
 
          {!IS_ADMIN && onHistory && (
            <button onClick={() => navigate(getDeptHomePath())} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--amber)", color: "#000",
              border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>← {getDeptLabel()}</button>
          )}
 
          {topRight}
        </div>
      </header>
      <main className="r-main-pad" style={{ flex: 1, padding: 20, maxWidth: 1400, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {children}
      </main>
    </div>
  );
}

// ── Sec ───────────────────────────────────────────────────────────────────────
function Sec({ title, accent = "var(--amber)", children }) {
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: 18 }}>
      <div style={{ fontFamily: "var(--fd)", fontWeight: 700, fontSize: 12, letterSpacing: ".12em", textTransform: "uppercase", color: accent, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ width: 2, height: 14, background: accent, borderRadius: 1 }} />{title}
      </div>
      {children}
    </div>
  );
}

// ── STEPS config ──────────────────────────────────────────────────────────────
const STEPS = [
  { label: "PRINT", field: "status_printing",      color: "#3b82f6", dept: "PRINTING"      },
  { label: "LASER", field: "status_laser_cutting",  color: "#a855f7", dept: "LASER_CUTTING" },
  { label: "LAM",   field: "status_laminating",     color: "#06b6d4", dept: "LAMINATING"    },
  { label: "BIND",  field: "status_binding",        color: "#22c55e", dept: "BINDING"       },
];

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ label, value, accent = "#555" }) {
  if (!value) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 0,
      fontSize: 12, borderRadius: 6, overflow: "hidden",
      border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`,
    }}>
      <span style={{
        padding: "4px 7px", background: "#111111",
        color: "rgba(255,255,255,0.55)", fontSize: 10, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: ".07em",
        borderRight: `1px solid ${accent}33`,
      }}>{label}</span>
      <span style={{
        padding: "4px 9px", background: "#000000",
        color: "#ffffff", fontWeight: 700, fontSize: 12,
      }}>{value}</span>
    </span>
  );
}

// ── Special note block ────────────────────────────────────────────────────────
function SpecialNote({ note }) {
  if (!note) return null;
  return (
    <div style={{
      background: "#0d0b00", border: "1px solid #4a3800",
      borderLeft: "4px solid var(--amber)", borderRadius: 6, overflow: "hidden",
    }}>
      <div style={{ background: "#1a1400", padding: "6px 12px", borderBottom: "1px solid #3a2800", display: "flex", alignItems: "center", gap: 7 }}>
        <Speech size={14}/>
        <span style={{ fontSize: 10, color: "var(--amber)", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 800 }}>Special Instructions</span>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 13, color: "#f5ecd0", lineHeight: 1.7, fontWeight: 500 }}>{note}</div>
    </div>
  );
}

// ── Stage row ─────────────────────────────────────────────────────────────────
function StageRow({ job }) {
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  return (
    <div style={{
      background: "var(--bg1)", borderRadius: 6, overflow: "hidden",
      border: `1px solid ${delayed ? "var(--red)" : "var(--border)"}`,
    }}>
      <div style={{ padding: "6px 12px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>Production Pipeline</span>
        {delayed && <span className="blink" style={{ fontSize: 10, color: "var(--red)", fontWeight: 700 }}>⚠ DELAYED</span>}
        {job.is_fully_completed && <span style={{ fontSize: 10, color: "var(--green)", fontWeight: 700 }}>✓ ALL DONE</span>}
      </div>
      {/* 2-col on mobile, 4-col on desktop */}
      <div className="r-stage-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STEPS.map((st, i) => {
          const sv           = job[st.field];
          const completedLog = job.logs?.find(l => l.department === st.dept && l.exited_at);
          const activeLog    = job.logs?.find(l => l.department === st.dept && !l.exited_at);
          const reason       = activeLog?.delay_reason || completedLog?.delay_reason;
          const isDelayed    = activeLog?.is_delayed || completedLog?.is_delayed;
          let bg, textClr, icon, statusLabel;
          if      (sv === "COMPLETED")   { bg = st.color + "22"; textClr = st.color;          icon = "✓"; statusLabel = "Done"; }
          else if (sv === "IN_PROGRESS") { bg = "#1a1400";       textClr = "var(--amber)";    icon = "●"; statusLabel = "In Progress"; }
          else if (sv === "SKIPPED")     { bg = "transparent";   textClr = "var(--text-dim)"; icon = "—"; statusLabel = "Skipped"; }
          else                           { bg = "transparent";   textClr = "var(--text-dim)"; icon = "○"; statusLabel = "Pending"; }
          return (
            <div key={st.label} style={{
              padding: "10px 12px", background: bg,
              borderRight: i < 3 ? "1px solid var(--border)" : "none",
              display: "flex", flexDirection: "column", gap: 4,
              borderTop: sv === "IN_PROGRESS" ? `2px solid ${st.color}` : "2px solid transparent",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: textClr, textTransform: "uppercase", letterSpacing: ".08em" }}>{icon} {st.label}</span>
                {sv === "COMPLETED" && (
                  <span style={{ width: 16, height: 16, borderRadius: "50%", background: st.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "#000", fontWeight: 900 }}>✓</span>
                )}
              </div>
              <span style={{ fontSize: 10, color: textClr, opacity: 0.75 }}>{statusLabel}</span>
              {sv === "COMPLETED" && completedLog?.duration_minutes && (
                <span style={{ fontSize: 10, fontWeight: 700, color: isDelayed ? "var(--red)" : "var(--green)", background: isDelayed ? "rgba(255,50,50,.1)" : "rgba(34,197,94,.1)", borderRadius: 3, padding: "1px 5px", alignSelf: "flex-start" }}>
                  {completedLog.duration_minutes} min {isDelayed ? "⚠" : "✓"}
                </span>
              )}
              {sv === "IN_PROGRESS" && <span style={{ fontSize: 10, color: "var(--amber)", fontWeight: 600 }}>Running…</span>}
              {reason && (
                <div style={{ fontSize: 10, color: isDelayed ? "#ffaa60" : "var(--text-dim)", background: isDelayed ? "rgba(255,100,0,.08)" : "rgba(255,255,255,.03)", borderRadius: 3, padding: "3px 6px", lineHeight: 1.4, borderLeft: `2px solid ${isDelayed ? "#ff6030" : "var(--border)"}` }}>
                  {reason}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Delay reasons summary list ────────────────────────────────────────────────
function DelayReasonsList({ logs }) {
  const delayed = logs?.filter(l => l.is_delayed && l.delay_reason);
  if (!delayed || delayed.length === 0) return null;
  const deptLabel = { PRINTING: "Printing", LAMINATING: "Laminating", LASER_CUTTING: "Laser Cutting", BINDING: "Binding" };
  const deptColor = { PRINTING: "#3b82f6", LAMINATING: "#06b6d4", LASER_CUTTING: "#a855f7", BINDING: "#22c55e" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700 }}>Delay Log</div>
      {delayed.map(l => (
        <div key={l.id} style={{ background: "var(--bg1)", borderRadius: 6, padding: "8px 12px", borderLeft: `3px solid ${deptColor[l.department] || "var(--red)"}`, display: "flex", flexDirection: "column", gap: 3 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: deptColor[l.department] || "var(--red)", textTransform: "uppercase", letterSpacing: ".06em" }}>{deptLabel[l.department] || l.department}</span>
            {l.delay_reason_at && <span style={{ fontSize: 10, color: "var(--text-dim)" }}>{new Date(l.delay_reason_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span>}
            {l.duration_minutes && <span style={{ fontSize: 10, color: "var(--text-dim)", marginLeft: "auto" }}>⏱ {l.duration_minutes} min</span>}
          </div>
          <div style={{ fontSize: 13, color: "#ffcc80", fontWeight: 500 }}>"{l.delay_reason}"</div>
        </div>
      ))}
    </div>
  );
}

// ── CompactCard (LivePanel) ───────────────────────────────────────────────────
function CompactCard({ job }) {
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  const days    = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);
  return (
    <div style={{
      background: "var(--bg2)",
      border: `1px solid ${delayed ? "var(--red)" : job.priority === "URGENT" ? "#5a1a1a" : "var(--border)"}`,
      borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 15, color: "var(--amber)", fontWeight: 800, letterSpacing: ".04em" }}>{job.job_no}</span>
          <span style={{ fontSize: 14, color: "var(--text-pri)", fontWeight: 600 }}>{job.customer}</span>
          {job.couple_name && <span style={{ fontSize: 12, color: "var(--text-sec)" }}>/ {job.couple_name}</span>}
          {job.priority === "URGENT" && <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "var(--red)", color: "#000", fontWeight: 800 }}>URGENT</span>}
          {delayed && <span className="blink" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 4, background: "#3a0000", color: "var(--red)", fontWeight: 800, border: "1px solid var(--red)" }}>LATE</span>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--fm)", fontWeight: 700, color: days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--text-sec)" }}>
            {new Date(job.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </div>
          <div style={{ fontSize: 10, color: days < 2 ? "var(--red)" : "var(--text-dim)" }}>
            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days}d left`}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        <Chip label="Size"    value={job.print_size}       accent="#3b82f6" />
        <Chip label="Pages"   value={job.print_pages}      accent="#3b82f6" />
        <Chip label="Lam"     value={job.laminate_type}    accent="#06b6d4" />
        <Chip label="Laser"   value={job.laser_cover_type} accent="#a855f7" />
        <Chip label="Rexing"  value={job.bind_rexing_no}   accent="#22c55e" />
        <Chip label="Box"     value={job.box_type}         accent="#f59e0b" />
        <Chip label="Deliver" value={job.delivery_type}    accent="#888"    />
      </div>
      <SpecialNote note={job.special_note} />
      <StageRow job={job} />
    </div>
  );
}

// ── LivePanel ─────────────────────────────────────────────────────────────────
function LivePanel() {
  const [jobs, setJobs] = useState([]);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const load = () => api.jobs().then(setJobs).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  const active = jobs.filter(j => !j.is_fully_completed);
  return (
    <div style={{ marginTop: 28 }}>
      <button onClick={() => setOpen(p => !p)} style={{ background: "var(--bg0)", color: "var(--text-pri)", border: "1px solid var(--amber)", borderRadius: 8, padding: "7px 14px", fontSize: 14, fontWeight: 900, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="blink" style={{ color: "var(--green)", fontSize: 10 }}>●</span>
        LIVE FACTORY PIPELINE <ArrowRight size={14} fontWeight={700} /> {active.length} ACTIVE JOB{active.length !== 1 ? "s" : ""}
        <span>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div className="si" style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 560, overflowY: "auto", padding: 2 }}>
          {active.length === 0
            ? <div style={{ color: "var(--text-dim)", fontSize: 13, padding: "10px 0" }}>No active jobs.</div>
            : active.map(j => <CompactCard key={j.id} job={j} />)
          }
        </div>
      )}
    </div>
  );
}

// ── Full Job Card ─────────────────────────────────────────────────────────────
function JobCardFull({ job, actionLabel, onAction, acting, actionBlocked = false, showExpiry = false, onAddReason, reasonDept }) {
  const isMobile = useIsMobile();
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  const days    = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);
  return (
    <div 
    className={delayed ? "delayed-card" : ""}
    style={{
      background: "#444343e0",
      border: `4px solid ${delayed ? "var(--red)" : job.priority === "URGENT" ? "#850606" : "none"}`,
      borderRadius: "12px 12px 0 0",
      boxShadow: delayed ? "0 0 0 1px var(--red)" : "none",
    }}>
      <div style={{ background: job.priority === "URGENT" ? "var(--red)" : delayed ? "var(--red)" : "var(--border)" }} />
      <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Job header: title + delivery box — stacks on mobile */}
        <div className="r-job-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--fm)", fontSize: 22, color: "var(--amber)", fontWeight: 800, letterSpacing: ".04em" }}>{job.job_no}</span>
              {job.priority === "URGENT" && (
                <span style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: "var(--red)", color: "#000", fontWeight: 800, letterSpacing: ".06em" }}><Flame  size ={18} color={"#ffa600"}/> URGENT</span>
              )}
              {delayed && (
                <span className="blink" style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: "#3a0000", color: "var(--red)", fontWeight: 800, border: "1px solid var(--red)" }}>⏱ DELAYED</span>
              )}
              {showExpiry && job.completed_at && <ExpiryBadge completedAt={job.completed_at} />}
            </div>
            <div style={{ fontSize: isMobile ? 17 : 16, fontWeight: 700, color: "var(--text-pri)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{job.customer}</div>
            {job.couple_name && <div style={{ fontSize: 13, color: "var(--text-sec)", marginTop: 2 }}>{job.couple_name}</div>}
            {job.order_no    && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>Order: {job.order_no}</div>}
          </div>
          {/* Delivery date box */}
          <div className="r-job-date-box" style={{
            textAlign: "center", flexShrink: 0,
            background: days < 2 ? "#2a0000" : days < 5 ? "#1a1200" : "var(--bg3)",
            border: `1px solid ${days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 8, padding: "10px 14px", minWidth: 80,
          }}>
            <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Delivery</div>
            <div style={{ fontFamily: "var(--fm)", fontSize: 16, fontWeight: 800, color: days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--text-pri)" }}>
              {new Date(job.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--text-dim)", marginTop: 2 }}>
              {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days}d`}
            </div>
          </div>
        </div>
        <div style={{ height: 1, background: "var(--border)" }} />
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          <Chip label="Print Size"  value={job.print_size}       accent="#3b82f6" />
          <Chip label="Pages"       value={job.print_pages}      accent="#3b82f6" />
          <Chip label="Laminate"    value={job.laminate_type}    accent="#06b6d4" />
          <Chip label="Laser Cover" value={job.laser_cover_type} accent="#a855f7" />
          <Chip label="Rexing"      value={job.bind_rexing_no}   accent="#22c55e" />
          <Chip label="Box Type"    value={job.box_type}         accent="#f59e0b" />
          <Chip label="Delivery"    value={job.delivery_type}    accent="#910e5f"    />
        </div>
        <SpecialNote note={job.special_note} />
        <StageRow job={job} />
        <DelayReasonsList logs={job.logs} />
 
          {actionLabel && onAction && (() => {
            const isDone    = actionLabel.toLowerCase().includes("done") ||
                              actionLabel.toLowerCase().includes("complete") ||
                              actionLabel.toLowerCase().includes("bound");
            // blocked = delay reason missing, shown in red-orange
            const bg        = acting        ? "var(--bg3)"
                            : actionBlocked ? "#3a0000"
                            : isDone        ? "#16a34a"
                            :                 "var(--amber)";
            const clr       = acting        ? "var(--text-dim)"
                            : actionBlocked ? "var(--red)"
                            :                 "#000";
            const border    = actionBlocked ? "1px solid var(--red)" : "none";
            const shadow    = actionBlocked ? "0 2px 12px rgba(229,62,62,.25)"
                            : isDone        ? "0 2px 12px rgba(22,163,74,.35)"
                            :                 "0 2px 12px rgba(245,166,35,.22)";
            return (
              <button onClick={() => onAction(job)} disabled={acting} style={{
                padding: "13px 20px", background: bg, color: clr,
                border, borderRadius: 8, fontSize: 16, fontWeight: 800,
                letterSpacing: ".08em", boxShadow: shadow, width: "100%",
              }}>
                {acting ? "Working…" : actionLabel}
              </button>
            );
          })()}
 
        {onAddReason && (() => {
          const thisLog = job.logs?.find(l => l.department === reasonDept && !l.exited_at && l.is_delayed);
          if (!thisLog) return null;
          return (
            <button onClick={() => onAddReason(job)} style={{
              padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 700,
              background: "var(--bg3)", color: "var(--red)",
              border: "1px solid var(--red)", letterSpacing: ".05em",
            }}>
              ⏱ {thisLog.delay_reason ? "✎ Edit Delay Reason" : "+ Add Delay Reason"}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ── Shared field sections (used in both create & edit forms) ────────
function JobFields({ job }) {
  return (
    <>
      <div className="r-grid-entry">
        <Sec title="1 – Printing" accent="var(--blue)">
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div><label>Print Size</label><input name="print_size" placeholder="12×30" defaultValue={job?.print_size || ""} /></div>
            <div><label>Number of Pages</label><input name="print_pages" placeholder="40" defaultValue={job?.print_pages || ""} /></div>
          </div>
        </Sec>
        <Sec title="2 – Laser Cutting  (blank = skip)" accent="var(--purple)">
          <div><label>Cover Type / Description</label><input name="laser_cover_type" placeholder="Leave blank to skip laser stage" defaultValue={job?.laser_cover_type || ""} /></div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 7 }}>ℹ Filling this activates the Laser track.</div>
        </Sec>
        <Sec title="3 – Laminating" accent="var(--cyan)">
          <div><label>Laminate Type</label><input name="laminate_type" placeholder="Silky / Gloss / Matt" defaultValue={job?.laminate_type || ""} /></div>
        </Sec>
        <Sec title="4 – Binding" accent="var(--green)">
          <div><label>Rexing No / Type</label><input name="bind_rexing_no" placeholder="SF10" defaultValue={job?.bind_rexing_no || ""} /></div>
        </Sec>
        <Sec title="5 – Box" accent="#f59e0b">
          <div><label>Box Type</label><input name="box_type" placeholder="SF10 - 12x 24" defaultValue={job?.box_type || ""} /></div>
        </Sec>
        <Sec title="Delivery Type" accent="#ff009d">
          <div><label>Delivery Type</label>
            <select name="delivery_type" defaultValue={job?.delivery_type || "PRONTO"}>
              <option value="PRONTO">PRONTO</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="PICKME">PICKME</option>
              <option value="BUS">BUS</option>
            </select>
          </div>
        </Sec>
      </div>
      <Sec title="Special Instructions">
        <div><label>Notes for all departments</label>
          <textarea name="special_note" placeholder="Any special instructions…" defaultValue={job?.special_note || ""} />
        </div>
      </Sec>
    </>
  );
}
// ── Entry page ────────────────────────────────────────────────────────────────
function EntryPage() {
  const { toasts, add } = useToast();
  const [busy,       setBusy]       = useState(false);
  const [jobs,       setJobs]       = useState([]);
  const [editJob,    setEditJob]    = useState(null);
  const [deleteJob,  setDeleteJob]  = useState(null);
  const [printJob,   setPrintJob]   = useState(null);   // ← NEW
  const [todayCount, setTodayCount] = useState(null);
  const [now,        setNow]        = useState(Date.now());
  const formRef = useRef(null);
  const editRef = useRef(null);
  const isMobile = useIsMobile();
  const LOCK_MS = 120_000;
 
  // ── UTC-safe helper — SQLite omits "Z", JS then parses as LOCAL time ────────
  function parseCreated(job) {
    const s = job.created_at;
    return new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  }
 
  const reload = useCallback(async () => {
    try {
      const jobList = await api.jobs(false);
      setJobs(jobList);
    } catch {}
    try {
      const ds = await api.deptStats();
      setTodayCount(ds?.ENTRY ?? 0);
    } catch {}
  }, []);
 
  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);
 
  // Tick every second to drive countdown + auto-hide
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
 
  // Auto-close edit modal if window expires while it is open
  // FIX: was `job.created_at` (undefined variable) — now correctly uses `editJob`
  useEffect(() => {
    if (!editJob) return;
    const elapsed = now - parseCreated(editJob);
    if (elapsed >= LOCK_MS) {
      setEditJob(null);
      add("Edit window expired. Job is now locked.", "error");
    }
  }, [now, editJob]);
 
  // Auto-close delete modal if window expires while it is open
  useEffect(() => {
    if (!deleteJob) return;
    const elapsed = now - parseCreated(deleteJob);
    if (elapsed >= LOCK_MS) {
      setDeleteJob(null);
      add("Edit window expired. Job is now locked.", "error");
    }
  }, [now, deleteJob]);
 
  // ── Helpers ──────────────────────────────────────────────────────────
  function isInProduction(job) {
    return (
      job.status_printing   !== "PENDING" ||
      job.status_laminating !== "PENDING" ||
      job.status_binding    !== "PENDING" ||
      (job.status_laser_cutting !== "PENDING" && job.status_laser_cutting !== "SKIPPED")
    );
  }
 
  function isEditable(job) {
    const elapsed = now - parseCreated(job);
    return elapsed < LOCK_MS && !isInProduction(job);
  }
 
  // ── Create ────────────────────────────────────────────────────────────
  async function handleSubmit(e) {
    e.preventDefault();
    const fd        = new FormData(e.currentTarget);
    const job_no    = (fd.get("job_no")    || "").trim();
    const customer  = (fd.get("customer")  || "").trim();
    const dele_date = (fd.get("dele_date") || "").trim();
    if (!job_no || !customer || !dele_date) {
      add("Job No, Customer, and Delivery Date are required.", "error"); return;
    }
    setBusy(true);
    try {
      await api.createJob({
        job_no, customer,
        couple_name:      fd.get("couple_name")      || "",
        order_no:         fd.get("order_no")         || "",
        dele_date:        new Date(dele_date).toISOString(),
        priority:         fd.get("priority")         || "NORMAL",
        delivery_type:    fd.get("delivery_type")    || "PRONTO",
        special_note:     fd.get("special_note")     || "",
        print_size:       fd.get("print_size")       || "",
        print_pages:      fd.get("print_pages")      || "",
        laser_cover_type: fd.get("laser_cover_type") || "",
        laminate_type:    fd.get("laminate_type")    || "",
        bind_rexing_no:   fd.get("bind_rexing_no")   || "",
        box_type:         fd.get("box_type")         || "",
      });
      add(`✓ Job #${job_no} created.`, "success");
      formRef.current?.reset();
      reload();
    } catch (err) { add(err.message, "error"); }
    finally { setBusy(false); }
  }
 
  // ── Edit save ─────────────────────────────────────────────────────────
  async function handleEditSave(e) {
    e.preventDefault();
    if (!isEditable(editJob)) {
      add("Edit window expired. Job is now locked.", "error");
      setEditJob(null); return;
    }
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await api.updateJob(editJob.id, {
        couple_name:      fd.get("couple_name")      || "",
        order_no:         fd.get("order_no")         || "",
        dele_date:        new Date(fd.get("dele_date")).toISOString(),
        priority:         fd.get("priority"),
        delivery_type:    fd.get("delivery_type"),
        special_note:     fd.get("special_note")     || "",
        print_size:       fd.get("print_size")       || "",
        print_pages:      fd.get("print_pages")      || "",
        laser_cover_type: fd.get("laser_cover_type") || "",
        laminate_type:    fd.get("laminate_type")    || "",
        bind_rexing_no:   fd.get("bind_rexing_no")   || "",
        box_type:         fd.get("box_type")         || "",
      });
      add(`✓ Job #${editJob.job_no} updated.`, "success");
      setEditJob(null);
      reload();
    } catch (err) { add(err.message, "error"); }
    finally { setBusy(false); }
  }
 
  // ── Delete ────────────────────────────────────────────────────────────
  async function handleDelete() {
    if (!isEditable(deleteJob)) {
      add("Edit window expired. Job is now locked.", "error");
      setDeleteJob(null); return;
    }
    try {
      await api.deleteJob(deleteJob.id);
      add(`Deleted #${deleteJob.job_no}`, "info");
      setDeleteJob(null);
      reload();
    } catch (err) { add(err.message, "error"); }
  }
 
  // ── Editable jobs (filtered list — re-evaluated every second via `now`) ──────
  const editableJobs = jobs.filter(isEditable);
 
  return (
    <>
      <Shell title="JOB ENTRY" accent="var(--amber)" topRight={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 5 : 8,
            background: "#001a00", border: "1px solid #1a4a1a",
            borderRadius: 8, padding: isMobile ? "2px 8px 2px 6px" : "2px 10px 2px 8px",
          }}>
            <span style={{
              fontFamily: "var(--fd)", fontSize: isMobile ? 28 : 38,
              fontWeight: 900, lineHeight: 1,
              color: todayCount > 0 ? "var(--green)" : "var(--text-dim)",
            }}>{todayCount ?? "—"}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 9 : 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>ISSUED</span>
              <span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 600, color: "#6aaa6a", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>TODAY</span>
            </div>
          </div>
        </div>
      }>
 
        {/* ── Create form ── */}
        <form ref={formRef} onSubmit={handleSubmit} autoComplete="off"
          style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 14, marginBottom: 32 }}>
          <Sec title="Job Header">
            <div className="r-grid-3" style={{ marginBottom: 14 }}>
              <div><label>Job No *</label><input name="job_no" placeholder="JOB-0001" /></div>
              <div><label>Photographer / Studio *</label><input name="customer" placeholder="Studio name" /></div>
              <div><label>Couple Name</label><input name="couple_name" placeholder="Optional" /></div>
            </div>
            <div className="r-grid-3">
              <div><label>Order No</label><input name="order_no" placeholder="Optional" /></div>
              <div><label>Delivery Date *</label><input name="dele_date" type="date" /></div>
              <div><label>Priority</label>
                <select name="priority" defaultValue="NORMAL">
                  <option value="NORMAL">NORMAL</option>
                  <option value="URGENT">URGENT</option>
                </select>
              </div>
            </div>
          </Sec>
          <JobFields job={null} />
          <button type="submit" disabled={busy} style={{
            padding: isMobile ? "14px 24px" : "16px 32px",
            background: busy ? "var(--bg3)" : "var(--amber)",
            color: busy ? "var(--text-dim)" : "var(--bg0)",
            borderRadius: 8, fontSize: isMobile ? 17 : 20, fontWeight: 900, letterSpacing: ".08em",
            width: "100%", boxShadow: "0 4px 24px rgba(245,166,35,.2)",
          }}>
            {busy ? "CREATING JOB…" : "CREATE JOB CARD"}
          </button>
        </form>
 
        {/* ── Editable jobs list ── */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase",
            color: "var(--text-pri)", marginBottom: 10, display: "flex", alignItems: "center",
            gap: 8, border: "1px solid var(--amber)", borderRadius: 8,
            padding: "4px 12px", width: "fit-content",
          }}>
            RECENT JOB CARDS — EDIT / DELETE
          </div>
 
          {editableJobs.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 0",
              color: "var(--text-dim)", fontFamily: "var(--fd)", letterSpacing: ".06em",
            }}>
              NO EDITABLE JOBS
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {editableJobs.map(job => {
                const days    = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);
                const elapsed = now - parseCreated(job);
                const secs    = Math.ceil(Math.max(0, LOCK_MS - elapsed) / 1000);
 
                return (
                  <div key={job.id} style={{
                    background: "var(--bg2)",
                    border: `1px solid ${secs <= 15 ? "var(--red)" : "var(--border)"}`,
                    borderRadius: 8, padding: "12px 14px",
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between", gap: 10, flexWrap: "wrap",
                    transition: "border-color 0.3s",
                  }}>
                    {/* Job info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontFamily: "var(--fm)", fontSize: 15, color: "var(--amber)", fontWeight: 800 }}>{job.job_no}</span>
                        {job.priority === "URGENT" && (
                          <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: "var(--red)", color: "#000", fontWeight: 800 }}><Flame  size ={18} color={"#ffa600"}/> URGENT</span>
                        )}
                        <span style={{ fontSize: 13, color: "var(--text-pri)", fontWeight: 600 }}>{job.customer}</span>
                        {job.couple_name && (
                          <span style={{ fontSize: 11, color: "var(--text-sec)" }}>{job.couple_name}</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11, marginTop: 3, fontWeight: 600,
                        color: days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--text-dim)",
                        display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <Calendar size={11} />
                        {new Date(job.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                        {days < 0 ? ` — ${Math.abs(days)}d overdue` : days === 0 ? " — Today!" : days === 1 ? " — Tomorrow" : ` — ${days}d`}
                      </div>
                    </div>
 
                    {/* Countdown + buttons */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
 
                      {/* Countdown badge */}
                      <div style={{
                        padding: "5px 10px", borderRadius: 5,
                        fontSize: 13, fontWeight: 900,
                        fontFamily: "var(--fm)",
                        minWidth: 48, textAlign: "center",
                        background: secs <= 15 ? "#2a0000" : "#1a1200",
                        color: secs <= 15 ? "var(--red)" : "var(--amber)",
                        border: `1px solid ${secs <= 15 ? "var(--red)" : "#4a3800"}`,
                        animation: secs <= 15 ? "blink 1s step-start infinite" : "none",
                      }}>{secs}s</div>
 
                      {/* Edit */}
                      <button onClick={() => setEditJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "var(--bg3)", color: "var(--amber)", border: "1px solid var(--amber)",
                      }}><Pen size={14} /></button>
 
                      {/* Print ← NEW */}
                      <button onClick={() => setPrintJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "var(--bg3)", color: "var(--cyan)", border: "1px solid var(--cyan)",
                      }}><Printer size={14} /></button>
 
                      {/* Delete */}
                      <button onClick={() => setDeleteJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "#2a0000", color: "var(--red)", border: "1px solid var(--red)",
                      }}><Trash size={14} /></button>
 
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
 
        <LivePanel />
      </Shell>
 
      {/* ── Edit modal ── */}
      {editJob && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.85)",
          display: "flex", alignItems: "flex-start", justifyContent: "center",
          zIndex: 9000, overflowY: "auto", padding: "20px 12px",
        }} onClick={() => setEditJob(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg1)", border: "1px solid var(--border)",
            borderRadius: 12, padding: 20, width: "100%", maxWidth: 860,
          }}>
            {/* Modal header with live countdown */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Edit Job Card</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "var(--amber)", fontFamily: "var(--fm)" }}>{editJob.job_no}</div>
                <div style={{ fontSize: 14, color: "var(--text-sec)" }}>{editJob.customer}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {/* Countdown inside modal */}
                {(() => {
                  const secs = Math.ceil(Math.max(0, LOCK_MS - (now - parseCreated(editJob))) / 1000);
                  return (
                    <div style={{
                      padding: "6px 12px", borderRadius: 6,
                      fontSize: 14, fontWeight: 900, fontFamily: "var(--fm)",
                      background: secs <= 15 ? "#2a0000" : "#1a1200",
                      color: secs <= 15 ? "var(--red)" : "var(--amber)",
                      border: `1px solid ${secs <= 15 ? "var(--red)" : "#4a3800"}`,
                      animation: secs <= 15 ? "blink 1s step-start infinite" : "none",
                    }}>⏱ {secs}s</div>
                  );
                })()}
                <button onClick={() => setEditJob(null)} style={{
                  padding: "8px 14px", background: "var(--bg3)", color: "var(--text-sec)",
                  border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700,
                }}>✕ Close</button>
              </div>
            </div>
 
            {/* Read-only fields */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>Job No (cannot change)</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-pri)", fontFamily: "var(--fm)" }}>{editJob.job_no}</div>
              </div>
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>Photographer / Studio (cannot change)</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-pri)" }}>{editJob.customer}</div>
              </div>
            </div>
 
            <form ref={editRef} onSubmit={handleEditSave} autoComplete="off"
              style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Sec title="Job Header">
                <div className="r-grid-3" style={{ marginBottom: 14 }}>
                  <div><label>Couple Name</label><input name="couple_name" defaultValue={editJob.couple_name || ""} /></div>
                  <div><label>Order No</label><input name="order_no" defaultValue={editJob.order_no || ""} /></div>
                  <div><label>Delivery Date *</label><input name="dele_date" type="date" defaultValue={editJob.dele_date?.slice(0, 10)} required /></div>
                </div>
                <div className="r-grid-3">
                  <div><label>Priority</label>
                    <select name="priority" defaultValue={editJob.priority || "NORMAL"}>
                      <option value="NORMAL">NORMAL</option>
                      <option value="URGENT">URGENT</option>
                    </select>
                  </div>
                </div>
              </Sec>
              <JobFields job={editJob} />
              <div style={{ display: "flex", gap: 8 }}>
                <button type="submit" disabled={busy} style={{
                  flex: 1, padding: "13px 0",
                  background: busy ? "var(--bg3)" : "var(--amber)",
                  color: busy ? "var(--text-dim)" : "#000",
                  borderRadius: 8, fontSize: 15, fontWeight: 800,
                }}>{busy ? "Saving…" : "✓ Save Changes"}</button>
                <button type="button" onClick={() => setEditJob(null)} style={{
                  padding: "13px 20px", background: "var(--bg3)", color: "var(--text-sec)",
                  border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700,
                }}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
 
      {/* ── Delete confirm modal ── */}
      {deleteJob && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,.85)",
          display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000,
        }} onClick={() => setDeleteJob(null)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: "var(--bg1)", border: "1px solid var(--red)",
            borderRadius: 12, padding: 24, width: "100%", maxWidth: 400,
            display: "flex", flexDirection: "column", gap: 16,
          }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: "var(--red)", textTransform: "uppercase", letterSpacing: ".1em" }}>⚠ Confirm Delete</div>
                {/* Countdown inside delete modal */}
                {(() => {
                  const secs = Math.ceil(Math.max(0, LOCK_MS - (now - parseCreated(deleteJob))) / 1000);
                  return (
                    <div style={{
                      padding: "4px 10px", borderRadius: 5,
                      fontSize: 13, fontWeight: 900, fontFamily: "var(--fm)",
                      background: secs <= 15 ? "#2a0000" : "#1a1200",
                      color: secs <= 15 ? "var(--red)" : "var(--amber)",
                      border: `1px solid ${secs <= 15 ? "var(--red)" : "#4a3800"}`,
                      animation: secs <= 15 ? "blink 1s step-start infinite" : "none",
                    }}>⏱ {secs}s</div>
                  );
                })()}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)", fontFamily: "var(--fm)" }}>{deleteJob.job_no}</div>
              <div style={{ fontSize: 14, color: "var(--text-pri)" }}>{deleteJob.customer}</div>
              {deleteJob.couple_name && <div style={{ fontSize: 12, color: "var(--text-sec)" }}>{deleteJob.couple_name}</div>}
              <div style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 10 }}>
                This will permanently delete the job card and all its logs. This cannot be undone.
              </div>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={handleDelete} style={{
                flex: 1, padding: "12px 0", background: "var(--red)", color: "#fff",
                borderRadius: 8, fontWeight: 800, fontSize: 15,
              }}>✕ Yes, Delete</button>
              <button onClick={() => setDeleteJob(null)} style={{
                padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)",
                border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700,
              }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
 
      {/* ── Print modal ← NEW ── */}
      {printJob && <PrintJobCardModal job={printJob} onClose={() => setPrintJob(null)} />}
      <ToastStack toasts={toasts} />
    </>
  );
}

// ── Station config ────────────────────────────────────────────────────────────
const STATION_CFG = {
  printing: {
    label: "PRINTING", dept: "PRINTING", accent: "var(--blue)",
    getAction(job) {
      if (job.status_printing === "PENDING")     return { action: "start",    label: "▶ START PRINTING" };
      if (job.status_printing === "IN_PROGRESS") return { action: "complete", label: "✓ MARK PRINTED — DONE" };
      return null;
    },
  },
  laminating: {
    label: "LAMINATING", dept: "LAMINATING", accent: "var(--cyan)",
    getAction(job) {
      if (job.status_laminating === "PENDING")     return { action: "start",    label: "▶ START LAMINATING" };
      if (job.status_laminating === "IN_PROGRESS") return { action: "complete", label: "✓ MARK LAMINATED — DONE" };
      return null;
    },
  },
  laser_cutting: {
    label: "LASER CUTTING", dept: "LASER_CUTTING", accent: "var(--purple)",
    getAction(job) {
      if (job.status_laser_cutting === "SKIPPED")     return null;
      if (job.status_laser_cutting === "PENDING")     return { action: "start",    label: "▶ START LASER CUT" };
      if (job.status_laser_cutting === "IN_PROGRESS") return { action: "complete", label: "✓ MARK CUT DONE" };
      return null;
    },
  },
  binding: {
    label: "BINDING", dept: "BINDING", accent: "var(--green)",
    getAction(job) {
      if (!job.binding_unlocked)                return null;
      if (job.status_binding === "PENDING")     return { action: "start",    label: "▶ START BINDING" };
      if (job.status_binding === "IN_PROGRESS") return { action: "complete", label: "✓ MARK BOUND — JOB COMPLETE" };
      return null;
    },
  },
};

// ── Station page ──────────────────────────────────────────────────────────────
// ── Station page ──────────────────────────────────────────────────────────────
function StationPage({ deptKey }) {
  const cfg = STATION_CFG[deptKey];
  const { toasts, add } = useToast();
  const [queue,              setQueue]              = useState([]);
  const [deptCompletedCount, setDeptCompletedCount] = useState(null);
  const [actingId,           setActingId]           = useState(null);
  const [reasonJob,          setReasonJob]          = useState(null);
  // NEW: track if modal was opened specifically to unblock a completion
  const [pendingCompleteJob, setPendingCompleteJob] = useState(null);
  const isMobile = useIsMobile();

  const reload = useCallback(async () => {
    try {
      const [q, ds] = await Promise.all([api.queue(deptKey), api.deptStats()]);
      setQueue(q);
      setDeptCompletedCount(ds?.[cfg.dept] ?? 0);
    } catch {}
  }, [deptKey]);

  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);

  if (!cfg) return (
    <Shell title="UNKNOWN STATION">
      <div style={{ color: "var(--red)", padding: 20 }}>Unknown station: {deptKey}</div>
    </Shell>
  );

  async function act(job) {
    const a = cfg.getAction(job);
    if (!a) return;

    // ── GUARD: block "complete" if job is delayed but has no reason ──────────
    if (a.action === "complete") {
      const activeLog = job.logs?.find(
        l => l.department === cfg.dept && !l.exited_at && l.is_delayed
      );
      if (activeLog && !activeLog.delay_reason) {
        // Force them to fill the reason first; remember this job so we can
        // auto-complete once the reason is saved.
        add("⏱ This job is delayed — please fill in the delay reason before completing.", "error");
        setPendingCompleteJob(job);
        setReasonJob(job);
        return;
      }
    }

    setActingId(job.id);
    try {
      await api.advance(job.id, cfg.dept, a.action);
      add(
        a.action === "start"
          ? `Job #${job.job_no} started at ${cfg.label}.`
          : `Job #${job.job_no} ✓ completed!`,
        "success"
      );
      await reload();
    } catch (err) {
      add(err.message, "error");
    } finally {
      setActingId(null);
    }
  }

  // Called after delay reason is saved — if we were blocking a completion,
  // automatically proceed with it now.
  async function onReasonSaved() {
    await reload();
    if (pendingCompleteJob) {
      const refreshed = (await api.queue(deptKey)).find(j => j.id === pendingCompleteJob.id);
      setPendingCompleteJob(null);
      if (refreshed) await act(refreshed);
    }
  }

  return (
    <>
      <Shell title={`${cfg.label} STATION`} accent={cfg.accent} topRight={
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Queue count */}
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 6 : 10,
            background: "#000", border: "1px solid var(--border)",
            borderRadius: 8, padding: isMobile ? "2px 8px 2px 6px" : "2px 10px 2px 8px",
          }}>
            <span className="r-station-queue-num" style={{
              fontFamily: "var(--fd)",
              fontSize: isMobile ? 36 : 50,
              fontWeight: 900, lineHeight: 1,
              color: queue.length > 0 ? "var(--green)" : "var(--text-dim)",
            }}>{queue.length}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>{queue.length !== 1 ? "JOBS" : "JOB"}</span>
              <span style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, color: "#dad2d2", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>IN QUEUE</span>
            </div>
          </div>
          {/* Completed count (24h) */}
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 5 : 8,
            background: "#001a00", border: "1px solid #1a4a1a",
            borderRadius: 8, padding: isMobile ? "2px 8px 2px 6px" : "2px 10px 2px 8px",
          }}>
            <span style={{
              fontFamily: "var(--fd)",
              fontSize: isMobile ? 36 : 50,
              fontWeight: 900, lineHeight: 1,
              color: deptCompletedCount > 0 ? "var(--green)" : "var(--text-dim)",
            }}>{deptCompletedCount ?? "—"}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 10 : 12, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>DONE</span>
              <span style={{ fontSize: isMobile ? 8 : 10, fontWeight: 600, color: "#6aaa6a", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>TODAY</span>
            </div>
          </div>
        </div>
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {queue.length === 0
            ? <div style={{ textAlign: "center", padding: isMobile ? "40px 16px" : "60px 20px", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: isMobile ? 15 : 20, letterSpacing: ".06em" }}>✓ QUEUE CLEAR</div>
            : queue.map(job => {
                const a = cfg.getAction(job);

                // ── Determine if this job is blocked (delayed + no reason) ──
                const activeLog = job.logs?.find(
                  l => l.department === cfg.dept && !l.exited_at && l.is_delayed
                );
                const isBlocked = a?.action === "complete" && activeLog && !activeLog.delay_reason;

                return (
                  <div key={job.id}>
                    <JobCardFull
                      job={job}
                      actionLabel={
                        isBlocked
                          ? "⏱ Fill Delay Reason to Complete"
                          : a?.label
                      }
                      onAction={act}
                      acting={actingId === job.id}
                      // Override button style via a new prop when blocked
                      actionBlocked={isBlocked}
                      onAddReason={setReasonJob}
                      reasonDept={cfg.dept}
                    />
                    {/* Inline warning strip shown under blocked cards */}
                    {isBlocked && (
                      <div style={{
                        background: "#2a0000",
                        border: "1px solid var(--red)",
                        borderTop: "none",
                        borderRadius: "0 0 8px 8px",
                        padding: "9px 16px",
                        display: "flex", alignItems: "center", gap: 8,
                        fontSize: 12, fontWeight: 700, color: "var(--red)",
                      }}>
                        ⚠ Delay reason required — tap the ⏱ button above to unlock completion
                      </div>
                    )}
                  </div>
                );
              })
          }
          <LivePanel />
        </div>
      </Shell>

      {reasonJob && (
        <DelayReasonModal
          job={reasonJob}
          dept={cfg.dept}
          onClose={() => { setReasonJob(null); setPendingCompleteJob(null); }}
          // Use onReasonSaved instead of plain reload so auto-complete fires
          onSaved={onReasonSaved}
          addToast={add}
        />
      )}
      <ToastStack toasts={toasts} />
    </>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PRODUCTION DASHBOARD FEATURES
// Drop these four components into your App.jsx (anywhere before DashboardPage),
// then replace your DashboardPage with the one at the bottom of this file.
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. BOTTLENECK RADAR ───────────────────────────────────────────────────────
// Shows per-department delayed + active counts. Worst offender floats to top.
// Uses only the `active` jobs array already fetched by DashboardPage.

const DEPT_META = [
  { key: "PRINTING",      label: "Printing",   accent: "#005ef5", field: "status_printing"      },
  { key: "LAMINATING",    label: "Laminating", accent: "#06b6d4", field: "status_laminating"    },
  { key: "LASER_CUTTING", label: "Laser Cut",  accent: "#a855f7", field: "status_laser_cutting" },
  { key: "BINDING",       label: "Binding",    accent: "#22c55e", field: "status_binding"       },
];

function BottleneckRadar({ active }) {
  const isMobile = useIsMobile();

  const deptStats = DEPT_META.map(dept => {
    const delayed    = active.filter(job => job.logs?.some(l => l.department === dept.key && l.is_delayed && !l.exited_at)).length;
    const inProgress = active.filter(job => job[dept.field] === "IN_PROGRESS").length;
    const pending    = active.filter(job => job[dept.field] === "PENDING").length;
    return { ...dept, delayed, inProgress, pending, total: inProgress + pending };
  });

  const sorted     = [...deptStats].sort((a, b) => b.delayed - a.delayed || b.total - a.total);
  const maxTotal   = Math.max(...deptStats.map(d => d.total), 1);
  const worstDept  = sorted[0];
  const hasBottleneck = worstDept.delayed > 0 || worstDept.total > 2;

  return (
    <div style={{
      background: "#444343e0",
      border: `1px solid ${hasBottleneck && worstDept.delayed > 0 ? "var(--red)" : "var(--border)"}`,
      borderRadius: 10, padding: "14px 16px",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-pri)", textShadow: '2px 2px 4px rgba(0,0,0,0.9)' }}>Bottleneck Radar</span>
        </div>
        {hasBottleneck && worstDept.delayed > 0 ? (
          <span className="blink" style={{ fontSize: 9, fontWeight: 800, padding: "2px 7px", borderRadius: 4, background: "#3a0000", color: "var(--red)", border: "1px solid var(--red)" }}>
            ⚠ {worstDept.label.toUpperCase()}
          </span>
        ) : (
          <span></span>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
        {sorted.map((dept) => {
          const barPct = maxTotal > 0 ? (dept.total / maxTotal) * 100 : 0;
          return (
<div key={dept.key} style={{
            background: "#000000",
            border: `1px solid ${dept.delayed > 0 ? dept.accent + "44" : "var(--bg0)"}`,
            boxShadow: '3px 4px 5px #181717',
            borderLeft: `3px solid ${dept.delayed > 0 ? "var(--red)" : dept.accent}`,
            borderRadius: 5, padding: "8px 10px",
            opacity: dept.total === 0 && dept.delayed === 0 ? 0.4 : 1,
          }}>
            {/* TOP ROW: label + counts, never wrap */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6, flexWrap: "nowrap", minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: dept.accent, textTransform: "uppercase", letterSpacing: ".06em", whiteSpace: "nowrap", flexShrink: 0 }}>
                {dept.label}
              </span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "nowrap", alignItems: "center" }}>
                {dept.inProgress > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#1a1400", color: "var(--amber)", border: "1px solid #4a3800", whiteSpace: "nowrap" }}>● {dept.inProgress}</span>
                )}
                {dept.pending > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "var(--bg3)", color: "var(--text-pri)", whiteSpace: "nowrap" }}>{dept.pending}</span>
                )}
                {dept.delayed > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 800, padding: "1px 6px", borderRadius: 4, background: "#3a0000", color: "var(--red)", border: "1px solid rgba(229,62,62,.4)", whiteSpace: "nowrap" }}>⏱ {dept.delayed}</span>
                )}
                {dept.total === 0 && dept.delayed === 0 && (
                  <span style={{ fontSize: 12, color: "var(--text-pri)" }}>idle</span>
                )}
              </div>
            </div>

            {/* BOTTOM ROW: bar always full width */}
            {(dept.total > 0 || dept.delayed > 0) && (
              <div style={{ width: "100%", height: 5, background: "var(--bg3)", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: `${Math.max(0, Math.min(barPct, 100))}%`,
                  minWidth: dept.total > 0 ? 2 : 0,
                  background: dept.delayed > 0 ? `linear-gradient(90deg, var(--red), ${dept.accent})` : dept.accent,
                  borderRadius: 3,
                  transition: "width 0.4s ease",
                }} />
              </div>
            )}
          </div>
          );
        })}
      </div>
    </div>
  );
}

// ── 2. DAILY GOAL RING ────────────────────────────────────────────────────────
// Completion rate for today: completed ÷ (completed + active) × 100
// Rendered as an SVG arc ring + fraction card, zero backend changes needed.

function DailyGoalRing({ active, done }) {
  const isMobile = useIsMobile();

  const completed = done.length;
  const total = completed + active.length;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const R = isMobile ? 38 : 44;
  const size = isMobile ? 88 : 100;
  const CX = size / 2;
  const CY = size / 2;

  const circ = 2 * Math.PI * R;
  const fill = (rate / 100) * circ;

  const ringColor =
    rate < 40
      ? "var(--amber)"
      : rate < 70
      ? "var(--amber)"
      : "var(--green)";

  return (
    <div
      style={{
        background: "#444343e0",
        border: `1px solid ${ringColor}55`,
        borderRadius: 10,
        padding: "14px 16px",
      }}
    >
      {/* HEADER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <span
          style={{
            fontFamily: "var(--fd)",
            fontSize: 14,
            fontWeight: 1000,
            letterSpacing: ".1em",
            textTransform: "uppercase",
            color: "var(--text-pri)",
            textShadow: "2px 2px 4px rgba(0,0,0,0.9)",
          }}
        >
          Daily Progress
        </span>
      </div>

      {/* CONTENT */}
      <div
        className="r-goal-inner"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          flexWrap: isMobile ? "wrap" : "nowrap",
        }}
      >
        {/* RING */}
        <div style={{ position: "relative", flexShrink: 0 }}>
          <svg
            width={size}
            height={size}
            style={{ transform: "rotate(-90deg)" }}
          >
            {/* background ring */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke="var(--bg3)"
              strokeWidth={8}
            />

            {/* progress ring */}
            <circle
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={ringColor}
              strokeWidth={8}
              strokeDasharray={`${fill} ${circ}`}
              strokeLinecap="round"
              style={{
                transition: "stroke-dasharray .4s ease",
                filter: "drop-shadow(0px 1px 2px rgba(0,0,0,0.9))",
              }}
            />
          </svg>

          {/* CENTER TEXT */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                fontFamily: "var(--fm)",
                fontSize: isMobile ? 18 : 22,
                fontWeight: 900,
                color: ringColor,
                lineHeight: 1,
                textShadow: "2px 2px 4px rgba(0,0,0,0.9)",
              }}
            >
              {rate}%
            </span>

            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                color: "var(--text-spec)",
                textTransform: "uppercase",
                letterSpacing: ".05em",
                marginTop: 2,
              }}
            >
              Today
            </span>
          </div>
        </div>

        {/* STATS */}
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              width: isMobile ? "100%" : "auto",
            }}
          >
          {[
            { label: "Completed", value: completed, color: "var(--green)" },
            { label: "Active", value: active.length, color: "var(--amber)" },
            { label: "Total", value: total, color: "var(--text-pri)" },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                background: "#000",
                border: `1px solid ${item.color}33`,
                borderLeft: `3px solid ${item.color}`,
                boxShadow: "3px 4px 5px #181717",
                borderRadius: 5,
                padding: isMobile ? "6px 10px" : "7px 14px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                width: "100%",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  color: "var(--text-sec)",
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {item.label}
              </span>

              <span
                style={{
                  fontFamily: "var(--fm)",
                  fontSize: isMobile ? 15 : 17,
                  fontWeight: 900,
                  color: item.color,
                }}
              >
                {item.value}
              </span>
            </div>
          ))}

          {/* STATUS BAR (FIXED MOBILE WIDTH) */}
          <div
            style={{
        marginTop: 3,
        padding: isMobile ? "8px 14px" : "5px 10px",
        borderRadius: 5,
        textAlign: "center",
        fontSize: 12,
        fontWeight: 800,
        background:
          rate >= 80
            ? "#002b14"
            : rate >= 50
            ? "#3d2a00"
            : "#3a0000",
        color: ringColor,
        border: `1px solid ${ringColor}55`,
        textTransform: "uppercase",
        letterSpacing: ".05em",

        // ✅ ADD THIS
        width: "100%",
        maxWidth: isMobile ? "100%" : "auto",
      }}
          >
            {total === 0
              ? "No Jobs Yet"
              : rate === 100
              ? "Perfect Day"
              : rate >= 80
              ? "Excellent"
              : rate >= 50
              ? "Steady"
              : "අවදානය දිය යුතුයි"}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 3. OVERDUE DELIVERY ALERT ─────────────────────────────────────────────────
// Jobs that are past their delivery date but still in the pipeline.
// Computed from `active` jobs — no backend needed.

function OverdueAlert({ active }) {
  const isMobile = useIsMobile();
  const now      = Date.now();
  const overdue  = active.filter(job => new Date(job.dele_date).getTime() < now);
  if (overdue.length === 0) return null;
 
  return (
    <div className="pulse" style={{ background: "#180000", border: "1px solid var(--red)", borderRadius: 8, padding: "12px 14px", marginBottom: 10,flex: 1,minWidth: 280 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <TriangleAlert size={isMobile ? 14 : 18} color="var(--amber)" />
        <span style={{ fontFamily: "var(--fd)", fontWeight: 800, fontSize: isMobile ? 12 : 14, color: "var(--red)", letterSpacing: ".04em" }}>
          {overdue.length} JOB{overdue.length > 1 ? "S" : ""} PAST DELIVERY DATE
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        {overdue.map(job => {
          const daysLate = Math.ceil((now - new Date(job.dele_date).getTime()) / 86400000);
          const currentDept = ["PRINTING","LAMINATING","LASER_CUTTING","BINDING"].find(d => {
            const f = { PRINTING:"status_printing", LAMINATING:"status_laminating", LASER_CUTTING:"status_laser_cutting", BINDING:"status_binding" }[d];
            return job[f] === "IN_PROGRESS";
          });
          return (
            <div key={job.id} style={{
              background: "rgba(229,62,62,.08)", border: "1px solid rgba(229,62,62,.2)",
              borderRadius: 6, padding: "7px 10px",
              display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6,
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--amber)", fontWeight: 800 }}>{job.job_no}</span>
                <span style={{ fontSize: 12, color: "var(--text-pri)", fontWeight: 600 }}>{job.customer}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {currentDept && !isMobile && (
                  <span style={{ fontSize: 10, color: "var(--text-dim)" }}>@ {({ PRINTING:"Print", LAMINATING:"Lam", LASER_CUTTING:"Laser", BINDING:"Bind" })[currentDept]}</span>
                )}
                <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 7px", borderRadius: 3, background: "var(--red)", color: "#fff" }}>{daysLate}d late</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── 4. THROUGHPUT TICKER ──────────────────────────────────────────────────────
// Shows how many jobs were completed in the last N hours — live velocity.
// Computed from `done` (last-24h completed jobs array).

function ThroughputTicker({ done }) {
  const [, setTick] = useState(0);
  const isMobile = useIsMobile();

  useEffect(() => {
    const t = setInterval(() => setTick(n => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const toMs = ts => {
    if (!ts) return 0;
    return new Date(ts.endsWith("Z") ? ts : ts + "Z").getTime();
  };

  const SLOTS = [
    { startH: 0,  label: "12am", sub: "4am"  },
    { startH: 4,  label: "4am",  sub: "8am"  },
    { startH: 8,  label: "8am",  sub: "12pm" },
    { startH: 12, label: "12pm", sub: "4pm"  },
    { startH: 16, label: "4pm",  sub: "8pm"  },
    { startH: 20, label: "8pm",  sub: "12am" },
  ];

  // Count completions per 4-hour slot
  const counts = [0, 0, 0, 0, 0, 0];
  done.forEach(j => {
    const raw = j.completed_at ?? j.updated_at;
    if (!raw) return;
    const h   = new Date(toMs(raw)).getHours();
    const idx = Math.floor(h / 4);
    if (idx >= 0 && idx < 6) counts[idx]++;
  });

  const maxCount   = Math.max(...counts, 1);
  const totalToday = done.length;
  const nowHour    = new Date().getHours();
  const activeSlot = Math.floor(nowHour / 4);

  return (
    <div style={{
      background: "#444343e0",
      border: "1px solid var(--border)",
      borderRadius: 12, padding: "14px 16px",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between", marginBottom: 14, gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000,
          letterSpacing: ".12em", textTransform: "uppercase",
          color: "var(--text-pri)", textShadow: "2px 2px 4px rgba(0,0,0,0.9)",
        }}>
          Throughput — Today
        </span>
        {/* Total badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background: "#000", border: "1px solid var(--border)",
          borderRadius: 6, padding: "4px 10px", flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "var(--fm)",
            fontSize: isMobile ? 22 : 18,
            fontWeight: 900, lineHeight: 1,
            color: totalToday > 0 ? "var(--green)" : "var(--text-dim)",
          }}>
            {totalToday}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1.3 }}>Total</span>
            <span style={{ fontSize: 9, fontWeight: 700, color: "#666", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1.3 }}>Albums</span>
          </div>
        </div>
      </div>

      {/* Timeline grid — 6 cols desktop, 3 cols mobile */}
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)",
        gap: isMobile ? 6 : 5,
      }}>
        {SLOTS.map((slot, i) => {
          const count     = counts[i];
          const isCurrent = i === activeSlot;
          const isFuture  = i > activeSlot;
          const barPct    = (count / maxCount) * 100;

          // Color logic
          let numColor, lblColor, barColor, borderTop;
          if (isFuture) {
            numColor = "var(--bg3)"; lblColor = "var(--bg3)";
            barColor = "var(--bg3)"; borderTop = "2px solid var(--bg2)";
          } else if (isCurrent) {
            numColor  = count > 10 ? "#0616f0" : "var(--text-dim)";
            lblColor  = "#0616f0";
            barColor  = "#0616f0";
            borderTop = "2px solid #0616f0";
          } else if (count > 5 && count <= 10) {
            numColor  = "#34d40c"; lblColor = "var(--text-dim)";
            barColor  = "#34d40c";     borderTop = "2px solid #34d40c";
          } else if (count > 0 && count < 5) {
            numColor  = "#fd2d26"; lblColor = "var(--text-dim)";
            barColor  = "#fd2d26";      borderTop = "2px solid #fd2d26";
          } else if (count > 10) {
            numColor  = "#22c55e"; lblColor = "var(--text-dim)";
            barColor  = "#22c55e";      borderTop = "2px solid #22c55e";


          } else {
            numColor  = "var(--text-dim)"; lblColor = "var(--text-dim)";
            barColor  = "var(--bg3)";      borderTop = "2px solid var(--bg2)";
          }

          return (
            <div key={i} style={{
              background: "#000",
              border: `1px solid ${isCurrent ? "#22c55e33" : "var(--bg0)"}`,
              borderTop,
              borderRadius: 8,
              padding: isMobile ? "10px 6px 8px" : "10px 6px 8px",
              textAlign: "center",
              display: "flex", flexDirection: "column",
              alignItems: "center", gap: 5,
              position: "relative",
              opacity: isFuture ? 0.3 : 1,
              transition: "opacity 0.3s",
            }}>
              {/* Current slot green dot */}
             {isCurrent && (
                    <div style={{
                      position: "absolute", top: -8, left: "50%",
                      transform: "translateX(-50%)",
                    }}>
                      <Activity
                        size={15}
                        color="#0caeee"
                        className="blink"
                      />
                    </div>
                  )}

              {/* Count number */}
              <div style={{
                fontFamily: "var(--fm)",
                fontSize: isMobile ? 24 : 20,
                fontWeight: 900, lineHeight: 1,
                color: numColor,
              }}>
                {isFuture ? "—" : count}
              </div>

              {/* Time label */}
              <div style={{
                fontSize: isMobile ? 9 : 8,
                fontWeight: 700,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: lblColor,
                lineHeight: 1.4,
              }}>
                {slot.label}<br />{slot.sub}
              </div>

              {/* Mini bar */}
              <div style={{
                width: "100%", height: 3,
                background: "var(--bg3)", borderRadius: 2, overflow: "hidden",
              }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${isFuture ? 0 : barPct}%`,
                  background: barColor,
                  transition: "width 0.5s ease",
                  minWidth: count > 0 ? 2 : 0,
                }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


function DashboardPage() {
  const { toasts, add } = useToast();
  const [active, setActive] = useState([]);
  const [done,   setDone]   = useState([]);
  const [stats,  setStats]  = useState(null);
  const [tab,    setTab]    = useState("active");
  const isMobile = useIsMobile();
 
  // In DashboardPage, replace the reload function:
const reload = useCallback(async () => {
  try {
    const [a, c, s] = await Promise.all([api.jobs(false), api.jobs(true), api.stats()]);
    
    const todayStr = new Date().toISOString().slice(0, 10); 
    const todayDone = c.filter(job => {
      const completedAt = job.completed_at ?? job.updated_at;
      if (!completedAt) return false;
      // Normalize to local date string
      return new Date(completedAt).toLocaleDateString("en-CA") === todayStr;
    });

    setActive(a);
    setDone(todayDone); // only today's completions
    setStats(s);
  } catch {}
}, []);
 
  useEffect(() => {
    reload();
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);
 
  async function del(job) {
    if (!window.confirm(`Delete job #${job.job_no}? This cannot be undone.`)) return;
    try { await api.deleteJob(job.id); add(`Deleted #${job.job_no}`, "info"); reload(); }
    catch (err) { add(err.message, "error"); }
  }
 
  const list = tab === "active" ? active : done;
 
  function Stat({ label, val, clr = "var(--text-pri)", sub }) {
    return (
      <div style={{ background: "#444343e0", border: "1px solid var(--border)", borderRadius: 10, padding: isMobile ? "12px 14px" : "14px 18px", textAlign: "center" }}>
        <div className="r-stat-num" style={{ fontFamily: "var(--fd)", fontSize: isMobile ? 30 : 40, fontWeight: 900, color: clr, lineHeight: 1,textShadow: '2px 2px 4px rgba(0, 0, 0, 0.9)' }}>{val ?? "—"}</div>
        <div style={{ fontSize: isMobile ? 13 : 11, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, fontWeight: 800 }}>{label}</div>
        {sub && !isMobile && <div style={{ fontSize: 10, color: "#b4b2b2", marginTop: 2 }}>{sub}</div>}
      </div>
    );
  }
 
  return (
    <>
      <Shell title="PRODUCTION DASHBOARD" accent="var(--amber)">
        {/* Nav bar */}
        <div className="r-nav-bar" style={{
          margin: "-12px -12px 16px", borderBottom: "1px solid var(--border)",
          background: "var(--bg1)", display: "flex", alignItems: "center",
          overflowX: "auto", padding: "0 12px", gap: 2, height: 44,
          WebkitOverflowScrolling: "touch",
        }}>
          {NAV_ITEMS.map(item => {
            const isActive = item.path === "/" ? window.location.pathname === "/" : window.location.pathname === item.path;
            return (
              <button key={item.path} onClick={() => navigate(item.path)} className="r-nav-btn" style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "0 12px", height: 44, background: "transparent",
                color: isActive ? item.accent : "var(--text-sec)",
                border: "none",
                borderBottom: isActive ? `2px solid ${item.accent}` : "2px solid transparent",
                borderRadius: 0, fontSize: isMobile ? 12 : 12,
                fontWeight: isActive ? 800 : 600,
                letterSpacing: ".05em", textTransform: "uppercase",
                cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              }}>{item.label}</button>
            );
          })}
        </div>
 
        {/* Stats row — 3-col desktop, 2-col mobile */}
        <div className="r-grid-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Stat label="Active Jobs"     val={stats?.active_jobs}    clr="var(--amber)" />
          <Stat label="Completed (24h)" val={stats?.completed_jobs} clr="var(--green)" sub="Auto-clears after 24 h" />
          <Stat label="Delayed"         val={stats?.delayed_jobs}   clr={stats?.delayed_jobs > 0 ? "var(--red)" : "var(--text-sec)"} />
        </div>
 
        {/* Urgent banner */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
  
          {stats?.urgent_pending > 0 && (
            <div
              className="pulse"
              style={{
                background: "#2a0000",
                border: "1px solid var(--red)",
                borderRadius: 8,
                padding: "10px 14px",
                flex: 1,
                minWidth: 280,
                display: "flex",
                marginBottom :"10px",
                alignItems: "center",
                gap: 10
              }}
            >
              <Flame  size ={18} color={"#ff5100"}/>
              <span
                style={{
                  fontFamily: "var(--fd)",
                  fontWeight: 700,
                  fontSize: isMobile ? 14 : 16,
                  color: "var(--red)",
                  letterSpacing: ".04em"
                }}
              >
                {stats.urgent_pending} URGENT JOB{stats.urgent_pending > 1 ? "S" : ""} IN PIPELINE
              </span>
            </div>
          )}

          <OverdueAlert active={active} />

        </div>
              
 
        {/* Intelligence row — side-by-side on desktop, stacked on mobile */}
        <div className="r-grid-intelligence" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <BottleneckRadar active={active} />
          <DailyGoalRing   active={active} done={done} />
        </div>
 
        {/* Throughput ticker */}
        <div style={{ marginBottom: 16 }}>
          <ThroughputTicker done={done} />
        </div>
 
        {/* Tab bar */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {[["active", "Active"], ["done", "Completed (24h)"]].map(([k, lbl]) => (
            <button key={k} onClick={() => setTab(k)} style={{
              padding: isMobile ? "8px 12px" : "7px 18px",
              fontSize: isMobile ? 14 : 13,
              fontWeight: 700, letterSpacing: ".04em", borderRadius: 4,
              background: tab === k ? "var(--amber)" : "var(--bg2)",
              color:      tab === k ? "var(--bg0)"   : "var(--text-sec)",
              border: `1px solid ${tab === k ? "var(--amber)" : "var(--border)"}`,
              flex: isMobile ? 1 : "unset",
            }}>
              {lbl} ({k === "active" ? active.length : done.length})
            </button>
          ))}
        </div>
 
        {/* Job list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {list.length === 0
            ? <div style={{ textAlign: "center", padding: "48px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: isMobile ? 14 : 18, letterSpacing: ".04em" }}>
                {tab === "active" ? "✓ NO ACTIVE JOBS" : "NO RECENTLY COMPLETED JOBS"}
              </div>
            : list.map(job => (
              <div key={job.id} style={{ position: "relative" }}>
                <JobCardFull job={job} showExpiry={tab === "done"} />
                <button onClick={() => del(job)} title="Delete" style={{
                  position: "absolute", top: 12, right: 12,
                  background: "rgba(0, 0, 0, 0.6)", color: "var(--red)",
                  fontSize: 13, padding: "4px 9px", borderRadius: 4,
                  border: "1px solid var(--border)",
                  minHeight: "unset",
                }}><SquareX size={13}/></button>
              </div>
            ))
          }
        </div>
      </Shell>
      <ToastStack toasts={toasts} />
    </>
  );
}

function HistoryList({ data, loading, search, selectedDate, fmtDate, fmtTime, setPrintJob, page, setPage }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", letterSpacing: ".08em" }}>LOADING…</div>}
      {!loading && data?.jobs?.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: 14, letterSpacing: ".06em" }}>
          NO COMPLETED JOBS {search ? "MATCHING SEARCH" : `ON ${fmtDate(selectedDate + "T00:00:00")}`}
        </div>
      )}
      {!loading && data?.jobs?.map(job => (
        <HistoryCard key={job.id} job={job} fmtDate={fmtDate} fmtTime={fmtTime} onPrint={() => setPrintJob(job)} />
      ))}
      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 8 }}>
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>◀ Prev</button>
          <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{page} / {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p+1))} disabled={page===data.pages} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>Next ▶</button>
        </div>
      )}
    </div>
  );
}

// ── History page ──────────────────────────────────────────────────────────────
function HistoryPage() {
  const { toasts, add } = useToast();
  const isMobile = useIsMobile();
 
  const today = new Date().toISOString().slice(0, 10);
  const [selectedDate,    setSelectedDate]    = useState(today);
  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page,            setPage]            = useState(1);
  const [data,            setData]            = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [dotDays,         setDotDays]         = useState({});
  const [calYear,         setCalYear]         = useState(new Date().getFullYear());
  const [calMonth,        setCalMonth]        = useState(new Date().getMonth() + 1);
  const [printJob,        setPrintJob]        = useState(null);
  const [showCal,         setShowCal]         = useState(!isMobile); // on mobile cal is collapsed by default
 
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [search]);
 
  useEffect(() => {
    apiFetch(`/api/history/dates-with-completions?year=${calYear}&month=${calMonth}`)
      .then(setDotDays).catch(() => {});
  }, [calYear, calMonth]);
 
  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ date: selectedDate, page: String(page), page_size: "20" });
    if (debouncedSearch) params.set("search", debouncedSearch);
    apiFetch(`/api/history?${params}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { add(err.message, "error"); setLoading(false); });
  }, [selectedDate, debouncedSearch, page]);
 
  function MiniCalendar() {
    const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const startDay    = new Date(calYear, calMonth - 1, 1).getDay();
    const cells = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
 
    function selectDay(d) {
      const mm = String(calMonth).padStart(2, "0");
      const dd = String(d).padStart(2, "0");
      setSelectedDate(`${calYear}-${mm}-${dd}`);
      setPage(1);
      if (isMobile) setShowCal(false); // auto-collapse on mobile after selecting
    }
 
    const selDay = selectedDate.startsWith(`${calYear}-${String(calMonth).padStart(2,"0")}`)
      ? parseInt(selectedDate.slice(8)) : -1;
 
    return (
      <div style={{ background: "var(--bg3)", borderRadius: 8, padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button onClick={() => { if (calMonth === 1) { setCalYear(y=>y-1); setCalMonth(12); } else setCalMonth(m=>m-1); }} style={{ color: "var(--text-sec)", fontSize: 16, padding: "0 6px" }}>◀</button>
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)", fontFamily: "var(--fm)" }}>{monthNames[calMonth-1]} {calYear}</span>
          <button onClick={() => { if (calMonth === 12) { setCalYear(y=>y+1); setCalMonth(1); } else setCalMonth(m=>m+1); }} style={{ color: "var(--text-sec)", fontSize: 16, padding: "0 6px" }}>▶</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 4 }}>
          {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 9, color: "var(--text-dim)", fontWeight: 700, padding: "2px 0" }}>{d}</div>)}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} />;
            const hasDot   = !!dotDays[String(d)];
            const isActive = d === selDay;
            return (
              <button key={d} onClick={() => selectDay(d)} style={{
                position: "relative", padding: "6px 2px", borderRadius: 4,
                fontSize: 12, fontWeight: isActive ? 800 : 500,
                background: isActive ? "var(--amber)" : "transparent",
                color: isActive ? "var(--bg0)" : hasDot ? "var(--text-pri)" : "var(--text-sec)",
                border: hasDot && !isActive ? "1px solid var(--border)" : "1px solid transparent",
                minHeight: 32,
              }}>
                {d}
                {hasDot && !isActive && <span style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: "var(--green)", display: "block" }} />}
              </button>
            );
          })}
        </div>
        <button onClick={() => { const t = new Date(); setCalYear(t.getFullYear()); setCalMonth(t.getMonth()+1); setSelectedDate(t.toISOString().slice(0,10)); setPage(1); if(isMobile) setShowCal(false); }}
          style={{ marginTop: 8, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 700, color: "var(--amber)", background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--border)" }}>Today</button>
      </div>
    );
  }
 
  const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const fmtTime = iso => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
 
  const selectedLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
 
  return (
    <>
      <Shell title="JOB HISTORY" accent="var(--cyan)">
        {/* On mobile: search bar + calendar toggle up top, then list */}
        {isMobile ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Search + calendar toggle row */}
            <div style={{ display: "flex", gap: 8 }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Job no / Studio / Couple…" style={{ flex: 1, margin: 0 }} />
             <button
                onClick={() => setShowCal(p => !p)}
                style={{
                  padding: "0 14px",
                  background: showCal ? "var(--cyan)" : "var(--bg3)",
                  color: showCal ? "#000" : "var(--text-sec)",
                  border: `1px solid ${showCal ? "var(--cyan)" : "var(--border)"}`,
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 12,
                  flexShrink: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Calendar size={14} />
                {selectedDate.slice(5).replace("-", "/")}
              </button>
            </div>
            {search && <button onClick={() => { setSearch(""); setPage(1); }} style={{ fontSize: 12, color: "var(--red)", textAlign: "left" }}>Clear search</button>}
            {showCal && <MiniCalendar />}
            {data && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{search ? "matching jobs" : selectedLabel}</span>
                <span style={{ fontFamily: "var(--fd)", fontSize: 24, fontWeight: 900, color: "var(--cyan)" }}>{data.total}</span>
              </div>
            )}
            <HistoryList data={data} loading={loading} search={search} selectedDate={selectedDate} fmtDate={fmtDate} fmtTime={fmtTime} setPrintJob={setPrintJob} page={page} setPage={setPage} />
          </div>
        ) : (
          /* Desktop: sidebar + list */
          <div className="r-history-layout" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <MiniCalendar />
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginBottom: 6 }}>Search</div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Job no / Studio / Couple…" style={{ margin: 0 }} />
                {search && <button onClick={() => { setSearch(""); setPage(1); }} style={{ marginTop: 6, fontSize: 12, color: "var(--red)", width: "100%", textAlign: "center" }}>✕ Clear</button>}
              </div>
              {data && (
                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginBottom: 8 }}>Results</div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: 32, fontWeight: 900, color: "var(--cyan)", lineHeight: 1 }}>{data.total}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                    {search ? "matching jobs" : `completed on ${fmtDate(selectedDate + "T00:00:00")}`}
                  </div>
                </div>
              )}
            </div>
            <HistoryList data={data} loading={loading} search={search} selectedDate={selectedDate} fmtDate={fmtDate} fmtTime={fmtTime} setPrintJob={setPrintJob} page={page} setPage={setPage} />
          </div>
        )}
      </Shell>
      {printJob && <PrintJobCardModal job={printJob} onClose={() => setPrintJob(null)} />}
      <ToastStack toasts={toasts} />
    </>
  );
}

// ── History card ──────────────────────────────────────────────────────────────
function HistoryCard({ job, fmtDate, fmtTime, onPrint }) {
  const [expanded, setExpanded] = useState(false);
  const isMobile    = useIsMobile();
  const totalMinutes = job.logs?.filter(l => l.duration_minutes).reduce((s, l) => s + l.duration_minutes, 0) || 0;
  const hadDelay     = job.logs?.some(l => l.is_delayed);
 
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", borderLeft: hadDelay ? "4px solid var(--red)" : "4px solid var(--green)" }}>
      <div onClick={() => setExpanded(p => !p)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div className="r-history-card-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 14, color: "var(--amber)", fontWeight: 800, minWidth: isMobile ? 70 : 90, flexShrink: 0 }}>{job.job_no}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-pri)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.customer}</div>
            {job.couple_name && <div style={{ fontSize: 11, color: "var(--text-sec)" }}>{job.couple_name}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: hadDelay ? "#3a0000" : "#001a00", color: hadDelay ? "var(--red)" : "var(--green)", border: `1px solid ${hadDelay ? "var(--red)" : "var(--green)"}` }}>{hadDelay ? "LATE" : "✓"}</span>
            {totalMinutes > 0 && !isMobile && (
              <span style={{ fontSize: 11, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{Math.floor(totalMinutes/60)}h{totalMinutes%60}m</span>
            )}
            <span style={{ color: "var(--text-dim)", fontSize: 11 }}>{expanded ? "▲" : "▼"}</span>
          </div>
        </div>
      </div>
      {expanded && (
        <div className="si" style={{ borderTop: "1px solid var(--border)", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            <Chip label="Size"    value={job.print_size}       accent="#3b82f6" />
            <Chip label="Pages"   value={job.print_pages}      accent="#3b82f6" />
            <Chip label="Lam"     value={job.laminate_type}    accent="#06b6d4" />
            <Chip label="Laser"   value={job.laser_cover_type} accent="#a855f7" />
            <Chip label="Rexing"  value={job.bind_rexing_no}   accent="#22c55e" />
            <Chip label="Box"     value={job.box_type}         accent="#f59e0b" />
            <Chip label="Deliver" value={job.delivery_type}    accent="#888"    />
          </div>
          <StageRow job={job} />
          {job.special_note && <SpecialNote note={job.special_note} />}
          <DelayReasonsList logs={job.logs} />
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={onPrint} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6 }}>🖨 Print Job Card</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Print helpers ─────────────────────────────────────────────────────────────
function buildPrintHTML(job) {
  const fmtDate = iso => new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const chips = [
    ["Print Size", job.print_size], ["Pages", job.print_pages],
    ["Laminate",   job.laminate_type], ["Laser Cover", job.laser_cover_type],
    ["Rexing",     job.bind_rexing_no], ["Box",        job.box_type],
    ["Delivery",   job.delivery_type],
  ].filter(([, v]) => v);

  const stageRows = [
    ["Printing",     job.status_printing],
    ["Laser Cutting",job.status_laser_cutting],
    ["Laminating",   job.status_laminating],
    ["Binding",      job.status_binding],
  ];

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Job Card — ${job.job_no}</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:24px;color:#111;background:#fff}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px}
    .job-no{font-size:28px;font-weight:900;letter-spacing:.04em}
    .customer{font-size:18px;font-weight:700;margin-top:4px}
    .couple{font-size:14px;color:#555;margin-top:2px}
    .delivery{text-align:right;font-size:13px}
    .delivery .date{font-size:20px;font-weight:800}
    .chips{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
    .chip{display:inline-flex;font-size:11px;border:1px solid #ccc;border-radius:4px;overflow:hidden}
    .chip .lbl{padding:3px 7px;background:#eee;font-weight:600;text-transform:uppercase;font-size:10px}
    .chip .val{padding:3px 9px;font-weight:700}
    .note{background:#fffbe6;border:1px solid #e6c800;border-left:4px solid #e6a800;padding:10px 14px;border-radius:4px;font-size:13px;margin-bottom:16px}
    .note-title{font-size:10px;text-transform:uppercase;letter-spacing:.1em;font-weight:800;color:#856600;margin-bottom:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    th{background:#111;color:#fff;padding:7px 12px;text-align:left;font-size:11px;letter-spacing:.08em;text-transform:uppercase}
    td{padding:7px 12px;border-bottom:1px solid #eee}
    .urgent{display:inline-block;background:#c00;color:#fff;font-size:10px;padding:2px 8px;border-radius:3px;font-weight:800;margin-left:8px}
    @media print{body{padding:0}button{display:none}}
  </style></head><body>
  <div class="header">
    <div>
      <div class="job-no">${job.job_no}${job.priority === "URGENT" ? '<span class="urgent"><Flame size={18} color={"#ff5100"}/> URGENT</span>' : ""}</div>
      <div class="customer">${job.customer}</div>
      ${job.couple_name ? `<div class="couple">${job.couple_name}</div>` : ""}
      ${job.order_no ? `<div style="font-size:12px;color:#888;margin-top:2px">Order: ${job.order_no}</div>` : ""}
    </div>
    <div class="delivery">
      <div style="font-size:11px;color:#888;text-transform:uppercase;letter-spacing:.06em">Delivery</div>
      <div class="date">${fmtDate(job.dele_date)}</div>
      <div style="font-size:12px;color:#555;margin-top:2px">${job.delivery_type || ""}</div>
    </div>
  </div>
  <div class="chips">${chips.map(([l, v]) => `<span class="chip"><span class="lbl">${l}</span><span class="val">${v}</span></span>`).join("")}</div>
  ${job.special_note ? `<div class="note"><div class="note-title">${<Speech size={14}/>}Special Instructions</div>${job.special_note}</div>` : ""}
  <table>
    <thead><tr><th>Stage</th><th>Status</th></tr></thead>
    <tbody>${stageRows.map(([label, status]) => `<tr><td>${label}</td><td>${status || "—"}</td></tr>`).join("")}</tbody>
  </table>
  <div style="margin-top:24px;font-size:11px;color:#aaa;text-align:right">Printed ${new Date().toLocaleString("en-GB")}</div>
  </body></html>`;
}

function PrintJobCardModal({ job, onClose }) {
  function doPrint() {
    const win = window.open("", "_blank", "width=800,height=600");
    win.document.write(buildPrintHTML(job));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const days = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: 12, padding: 24, width: "100%", maxWidth: 520, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 6 }}>Print Job Card</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--amber)", fontFamily: "var(--fm)" }}>{job.job_no}</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-pri)" }}>{job.customer}</div>
          {job.couple_name && <div style={{ fontSize: 13, color: "var(--text-sec)" }}>{job.couple_name}</div>}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          <Chip label="Size"    value={job.print_size}       accent="#3b82f6" />
          <Chip label="Pages"   value={job.print_pages}      accent="#3b82f6" />
          <Chip label="Lam"     value={job.laminate_type}    accent="#06b6d4" />
          <Chip label="Laser"   value={job.laser_cover_type} accent="#a855f7" />
          <Chip label="Rexing"  value={job.bind_rexing_no}   accent="#22c55e" />
          <Chip label="Box"     value={job.box_type}         accent="#f59e0b" />
          <Chip label="Deliver" value={job.delivery_type}    accent="#888"    />
        </div>
        {job.special_note && <SpecialNote note={job.special_note} />}
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={doPrint} style={{ flex: 1, padding: "12px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>🖨 Open Print Dialog</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
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

// ── App root ──────────────────────────────────────────────────────────────────
export default function App() {
  const [route, setRoute] = useState(getPage());
 
  useEffect(() => {
    const handler = () => setRoute(getPage());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
 
  const { page, dept } = route;
 
  return (
    <>
      <GlobalResponsiveStyles />
      {page === "entry"     ? <EntryPage /> :
       page === "station"   ? <StationPage deptKey={dept} /> :
       page === "history"   ? <HistoryPage /> :
       page === "analytics" ? <AnalyticsPage /> :
       <DashboardPage />}
    </>
  );
}