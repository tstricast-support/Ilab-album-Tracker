import { useState, useEffect, useCallback, useRef,createContext, useContext } from "react";
import { API_BASE, POLL_INTERVAL_MS, APP_NAME,MACHINES,ALBUM_TYPES,DAMAGE_DEPTS, PAPER_SIZES, LOW_STOCK_THRESHOLD,CORRECTABLE_DEPTS,THANK_U_CARDS_SIZES} from "./config.js";
import {ArrowRight, Calendar,Pen,SquareX, Trash,Printer,TriangleAlert,Flame,Activity, Speech, Scissors,BookOpen,Plus, Timer,ChevronDown ,Search,Palette,Check,ArrowUp,Download,Gift}from "lucide-react";
import logo from "./assets/logo.jpg";
import trackQR from "./assets/track-qr.png";
import "./index.css";


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
  // FIXED
  advance: (id, dept, action, extra = {}) => apiFetch(`/api/jobs/${id}/advance/${dept}`, {
    method: "POST", body: JSON.stringify({ action, ...extra }),
  }),
  searchJobs: (q) => apiFetch(`/api/jobs/search?q=${encodeURIComponent(q)}`),
  stats:         ()             => apiFetch("/api/stats"),
  deptStats: () => apiFetch("/api/stats/departments"),
  pendingPrintJobs: (search = "", page = 1) =>
    apiFetch(`/api/stats/pending-print-jobs?search=${encodeURIComponent(search)}&page=${page}&page_size=15`),
  albumBreakdown: (dept, date) =>
    apiFetch(`/api/stats/album-breakdown?dept=${dept}${date ? `&date=${date}` : ""}`),
  albumBreakdownDates: (dept, year, month) =>
    apiFetch(`/api/stats/album-breakdown/dates-with-entries?dept=${dept}&year=${year}&month=${month}`),
  albumJobsList: (dept, albumType, date, page = 1) =>
    apiFetch(`/api/stats/album-jobs?dept=${dept}&album_type=${albumType}${date ? `&date=${date}` : ""}&page=${page}&page_size=15`),
  printingSection: () => apiFetch("/api/stats/printing-section"),
  printingBreakdown: () => apiFetch(`/api/stats/printing-breakdown`),
  printingJobsList: (machine, album_type, date, page) =>
    apiFetch(`/api/stats/printing-jobs?machine=${machine}&album_type=${album_type}${date ? `&date=${date}` : ""}&page=${page}&page_size=15`),
  printingJobsDates: (machine, album_type, year, month) =>
    apiFetch(`/api/stats/printing-jobs/dates-with-entries?machine=${machine}&album_type=${album_type}&year=${year}&month=${month}`),
  setReason:     (id, dept, reason) => apiFetch(`/api/jobs/${id}/delay-reason/${dept}`, {
    method: "POST", body: JSON.stringify({ reason }),
  }),
  presetReasons: (dept)         => apiFetch(`/api/delay-reasons/${dept}`),
  updatePayment: (id, payment_by) => apiFetch(`/api/jobs/${id}/payment`, {
    method: "PATCH", body: JSON.stringify({ payment_by }),
  }),
  knownPaymentNames: () => apiFetch(`/api/payment/known-names`),  analytics:     (from, to)     => apiFetch(`/api/analytics?from=${from}&to=${to}`),
  stationHistory: (dept, search = "", page = 1, date = "") =>
    apiFetch(`/api/station/${dept}/history?search=${encodeURIComponent(search)}&${date ? `date=${date}&` : ""}page=${page}&page_size=15`),
  stationHistoryDates: (dept, year, month) =>
    apiFetch(`/api/station/${dept}/history/dates-with-entries?year=${year}&month=${month}`),
  
  updateBoxPouch: (id, status) => apiFetch(`/api/jobs/${id}/box-pouch`, {
    method: "PATCH", body: JSON.stringify({ box_pouch_status: status }),
  }),
  setAlbumType: (id, album_type) => apiFetch(`/api/jobs/${id}/album-type`, {
  method: "PATCH", body: JSON.stringify({ album_type }),
  }),
  paperPrices: () => apiFetch(`/api/paper-prices`),
  paperUsageBreakdown: () => apiFetch(`/api/stats/paper-usage-breakdown`),
  updatePaperPrice: (id, unit_price) => apiFetch(`/api/paper-prices/${id}`, {
    method: "PATCH", body: JSON.stringify({ unit_price }),
  }),
  createDamage: (body) => apiFetch(`/api/damages`, { method: "POST", body: JSON.stringify(body) }),
  // damages: (department, page = 1) => apiFetch(`/api/damages?${department ? `department=${department}&` : ""}page=${page}&page_size=20`),
  updateDamage: (id, body) => apiFetch(`/api/damages/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteDamage: (id) => apiFetch(`/api/damages/${id}`, { method: "DELETE" }),
  knownDamageOperators: (department) => apiFetch(`/api/damages/known-operators?department=${department}`),
  damageStats: () => apiFetch(`/api/stats/damages`),

  paperStock: () => apiFetch(`/api/paper-stock`),
  addPaperPacket: (size) => apiFetch(`/api/paper-stock/add-packet`, {
    method: "POST", body: JSON.stringify({ size }),
  }),
  paperPacketLogs: (page = 1) => apiFetch(`/api/paper-packet-logs?page=${page}&page_size=20`),
  updatePacketLog: (id, size) => apiFetch(`/api/paper-packet-logs/${id}`, {
    method: "PATCH", body: JSON.stringify({ size }),
  }),
  deletePacketLog: (id) => apiFetch(`/api/paper-packet-logs/${id}`, { method: "DELETE" }),
  createPaperUsage: (body) => apiFetch(`/api/paper-usage`, { method: "POST", body: JSON.stringify(body) }),
  // paperUsage: (search = "", page = 1) =>
  //   apiFetch(`/api/paper-usage?search=${encodeURIComponent(search)}&page=${page}&page_size=20`),
  updatePaperUsage: (id, body) => apiFetch(`/api/paper-usage/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deletePaperUsage: (id) => apiFetch(`/api/paper-usage/${id}`, { method: "DELETE" }),
  knownPaperOperators: () => apiFetch(`/api/paper-usage/known-operators`),
  createThankYouCard: (body) => apiFetch(`/api/thankyou-cards`, { method: "POST", body: JSON.stringify(body) }),
  thankYouCards: (machine = "", date = "", page = 1) =>
    apiFetch(`/api/thankyou-cards?${machine ? `machine=${machine}&` : ""}${date ? `date=${date}&` : ""}page=${page}&page_size=15`),
  thankYouCardDates: (year, month, machine = "") =>
    apiFetch(`/api/thankyou-cards/dates-with-entries?year=${year}&month=${month}${machine ? `&machine=${machine}` : ""}`),
  thankYouCardsByMachine: () => apiFetch(`/api/stats/thankyou-cards-by-machine`),
  thankYouCardStats: () => apiFetch(`/api/stats/thankyou-cards`),
  knownThankYouNames: () => apiFetch(`/api/thankyou-cards/known-names`),
  paperStockStats: () => apiFetch(`/api/stats/paper-stock`),
  damageDates: (year, month, department) =>
  apiFetch(`/api/damages/dates-with-entries?year=${year}&month=${month}${department ? `&department=${department}` : ""}`),

  damages: (department, page = 1, date = "") =>
  apiFetch(`/api/damages?${department ? `department=${department}&` : ""}${date ? `date=${date}&` : ""}page=${page}&page_size=20`),

  paperUsageDates: (year, month) =>
  apiFetch(`/api/paper-usage/dates-with-entries?year=${year}&month=${month}`),

  paperUsage: (search = "", page = 1, date = "") =>
  apiFetch(`/api/paper-usage?search=${encodeURIComponent(search)}&${date ? `date=${date}&` : ""}page=${page}&page_size=20`),

  track: (jobNo) => apiFetch(`/api/track/${encodeURIComponent(jobNo)}`),

  adminSearchJob:    (q) => apiFetch(`/api/jobs/search?q=${encodeURIComponent(q)}`),
  adminJobTimeline:  (jobId) => apiFetch(`/api/admin/jobs/${jobId}/timeline`),
  adminFixDate:      (jobId, department, new_date) => apiFetch(`/api/admin/jobs/${jobId}/date-correction`, {
    method: "PATCH", body: JSON.stringify({ department, new_date }),
  }),
};

function parseUTC(s) {
  if (!s) return null;
  return new Date(s.endsWith("Z") ? s : s + "Z");
}

function setIfChanged(setter) {
  return (newData) => setter(prev =>
    JSON.stringify(prev) === JSON.stringify(newData) ? prev : newData
  );
}

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

function downloadQR() {
  const a = document.createElement("a");
  a.href = trackQR;
  a.download = "ilab-album-tracking-qr.png";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

// ── Appearance / Theme customization ──────────────────────────────────────────
const THEME_STORAGE_KEY = `ilab-theme:${ROLE}`;

const DEFAULT_THEME = {
  name: "dark",
  bg0: "#0a0a0a", bg1: "#111111", bg2: "#080808", bg3: "#242424",
  border: "#4d4d4d", borderStrong: "#ffffff33",
  textPri: "#f0f0f0", textSec: "#e2e1e1", textDim: "#b3b3b3",
  accent: "#f5a623",
  font: "Aptos, \"Segoe UI\", Arial, sans-serif",
  fontSize: "14",
  process:"#101501",
  cardBg: "#1c1c1eE0",
  cardInnerBg: "#000000",
  overlay: "rgba(0,0,0,.8)",

  green: "#22c55e", red: "#e53e3e", amber2: "#f59e0b",
  blue: "#3b82f6", cyan: "#06b6d4", purple: "#a855f7",

  surfaceSunken: "#000000", surfaceSunkenBorder: "#ffffff33",
  dangerBg: "#2a0000", dangerBorder: "#6a2a00", dangerText: "#ff9060",
  successBg: "#001a00", successBorder: "#1a4a1a", successText: "#6aaa6a",
  warnBg: "#1a1200", warnBorder: "#4a3800", warnText: "#f5ecd0",
  infoBg: "#0a0a1a", infoBorder: "#06b6d455", infoText: "#7fd4ff",
  dateIconInvert: "1",
  titleShadow: "var(--title-shadow)",
};

const LIGHT_THEME = {
  name: "light",
  bg0: "#cfcece", bg1: "#aaa8a8", bg2: "#e6e6e6", bg3: "#d4d4d4",
  border: "#c5c5c5", borderStrong: "#00000026",
  textPri: "#000000", textSec: "#1a1a1a", textDim: "#4a4a4a",
  accent: "#3a61b4",
  font: "Aptos, \"Segoe UI\", Arial, sans-serif",
  fontSize: "14",
  // proPipe:"#000000",

  cardBg: "#9c9898",
  cardInnerBg: "#645f5f",
  overlay: "rgba(0,0,0,.45)",
  process:"#92913d",

  green: "#049704", red: "#dc2626", amber2: "#d97706",
  blue: "#2563eb", cyan: "#0891b2", purple: "#7c3aed",

  surfaceSunken: "#e6e6e6", surfaceSunkenBorder: "#00000022",
  dangerBg: "#f79696", dangerBorder: "#f09d9d", dangerText: "#b91c1c",
  successBg: "#e8f7ec", successBorder: "#a9e6bb", successText: "#15803d",
  warnBg: "#fff6df", warnBorder: "#f0d68a", warnText: "#7a4e00",
  infoBg: "#e6f0ff", infoBorder: "#9fc4fb", infoText: "#5066a1",
  dateIconInvert: "0",
  titleShadow: "none",
};

function getContrastText(hex) {
  if (!hex) return "var(--surface-sunken)";
  let c = hex.replace("#", "");
  if (c.length === 3) c = c.split("").map(ch => ch + ch).join("");
  if (c.length !== 6) return "var(--surface-sunken)";
  const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 150 ? "#0a0a0a" : "#f5f5f5";
}

const THEME_PRESETS = [
  { name: "Default Dark", accentPreview: "#f5a623", theme: { ...DEFAULT_THEME } },
  { name: "Light",        accentPreview: "#2563eb", theme: { ...LIGHT_THEME } },
];

const FONT_OPTIONS = [
  { label: "Monospace (Classic)",   value: "'Courier New', monospace" },
  { label: "Sans Serif (Clean)",    value: "system-ui, -apple-system, sans-serif" },
  { label: "Serif (Elegant)",       value: "Georgia, 'Times New Roman', serif" },
  { label: "Rounded (Soft)",        value: "'Trebuchet MS', Verdana, sans-serif" },
  { label: "Segoe (Modern)",        value: "'Segoe UI', Tahoma, sans-serif" },
  { label: "Tahoma (Compact)",      value: "Tahoma, Geneva, sans-serif" },
  { label: "Verdana (Wide)",        value: "Verdana, Geneva, sans-serif" },
  { label: "Condensed (Technical)", value: "'Arial Narrow', Arial, sans-serif" },
  { label: "Impact (Bold Display)", value: "Impact, 'Arial Black', sans-serif" },
];

const FONT_SIZE_OPTIONS = [
  { label: "Small",  value: "13" },
  { label: "Medium (Default)", value: "14" },
  { label: "Large",  value: "15" },
  { label: "Extra Large", value: "16" },
];

function loadTheme() {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY);
    if (raw) return { ...DEFAULT_THEME, ...JSON.parse(raw) };
  } catch {}
  return { ...DEFAULT_THEME };
}

function applyThemeToDocument(theme) {
  const r = document.documentElement.style;
  r.setProperty("--bg0", theme.bg0);
  r.setProperty("--bg1", theme.bg1);
  r.setProperty("--bg2", theme.bg2);
  r.setProperty("--bg3", theme.bg3);
  r.setProperty("--border", theme.border);
  r.setProperty("--border-strong", theme.borderStrong);
  r.setProperty("--text-pri", theme.textPri);
  r.setProperty("--text-sec", theme.textSec);
  r.setProperty("--text-dim", theme.textDim);
  r.setProperty("--amber", theme.accent);
  r.setProperty("--fd", theme.font);
  r.setProperty("--process", theme.process);
  r.setProperty("--fm", theme.font);
  r.setProperty("--font-body", theme.font);
  r.setProperty("--font-size-base", `${theme.fontSize || "14"}px`);
  r.setProperty("--background", theme.bg0);
  r.setProperty("--foreground", theme.textPri);
  r.setProperty("--on-accent", getContrastText(theme.accent));
  r.setProperty("--on-surface", getContrastText(theme.bg3));

  r.setProperty("--card-bg", theme.cardBg);
  r.setProperty("--card-inner-bg", theme.cardInnerBg);
  r.setProperty("--overlay", theme.overlay);

  r.setProperty("--green", theme.green);
  r.setProperty("--red", theme.red);
  r.setProperty("--amber-2", theme.amber2);
  r.setProperty("--blue", theme.blue);
  r.setProperty("--cyan", theme.cyan);
  r.setProperty("--purple", theme.purple);
  r.setProperty("--on-green", getContrastText(theme.green));
  r.setProperty("--on-red", getContrastText(theme.red));

  r.setProperty("--surface-sunken", theme.surfaceSunken);
  r.setProperty("--surface-sunken-border", theme.surfaceSunkenBorder);
  r.setProperty("--danger-bg", theme.dangerBg);
  r.setProperty("--danger-border", theme.dangerBorder);
  r.setProperty("--danger-text", theme.dangerText);
  r.setProperty("--success-bg", theme.successBg);
  r.setProperty("--success-border", theme.successBorder);
  r.setProperty("--success-text", theme.successText);
  r.setProperty("--warn-bg", theme.warnBg);
  r.setProperty("--warn-border", theme.warnBorder);
  r.setProperty("--warn-text", theme.warnText);
  r.setProperty("--info-bg", theme.infoBg);
  r.setProperty("--info-border", theme.infoBorder);
  r.setProperty("--info-text", theme.infoText);
  r.setProperty("--date-icon-invert", theme.dateIconInvert);
  r.setProperty("--title-shadow", theme.titleShadow);
}

const AppearanceContext = createContext(null);

function AppearanceProvider({ children }) {
  const [theme, setTheme] = useState(loadTheme);
  useEffect(() => { applyThemeToDocument(theme); }, [theme]);

  const updateTheme = useCallback((patch) => {
    setTheme(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const resetTheme = useCallback(() => {
    try { localStorage.removeItem(THEME_STORAGE_KEY); } catch {}
    setTheme({ ...DEFAULT_THEME });
  }, []);

  return (
    <AppearanceContext.Provider value={{ theme, updateTheme, resetTheme }}>
      {children}
    </AppearanceContext.Provider>
  );
}

function useAppearance() {
  const ctx = useContext(AppearanceContext);
  if (!ctx) throw new Error("useAppearance must be used within AppearanceProvider");
  return ctx;
}

function ColorField({ label, value, onChange }) {
  return (
    <div>
      <label>{label}</label>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 5 }}>
        <input type="color" value={value} onChange={e => onChange(e.target.value)} style={{ width: 42, height: 36, padding: 2, margin: 0, cursor: "pointer" }} />
        <input type="text" value={value} onChange={e => onChange(e.target.value)} style={{ margin: 0 }} />
      </div>
    </div>
  );
}

function AppearanceModal({ onClose }) {
  const { theme, updateTheme, resetTheme } = useAppearance();
  const isMobile = useIsMobile();
  return (
    <div style={{
        position: "fixed", inset: 0, background: "var(--overlay)",
        display: "flex",
        alignItems: isMobile ? "flex-end" : "center",   
        justifyContent: "center", zIndex: 9000,
      }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
          background: "var(--bg1)", border: "1px solid var(--border)",
          borderRadius: isMobile ? "16px 16px 0 0" : 12,   
          padding: 24, width: "100%", maxWidth: 480,
          maxHeight: isMobile ? "92dvh" : "90vh",           
          overflowY: "auto",                               
          display: "flex", flexDirection: "column", gap: 16,
        }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Appearance</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>Customize {getDeptLabel()} View</div>
          </div>
          <button onClick={onClose} style={{ padding: "8px 12px", background: "var(--bg3)", color: "var(--on-surface)", border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 14 }}>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Live Preview</div>
          <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 800, color: "var(--amber)" }}>JOB-0001</div>
            <div style={{ fontFamily: "var(--font-body)", fontSize: "var(--font-size-base)", color: "var(--text-pri)" }}>Sample Customer Name</div>
            <div style={{ fontSize: 12, color: "var(--text-sec)" }}>Secondary text example</div>
            <button style={{ padding: "8px 14px", background: "var(--amber)", color: "var(--on-accent)", borderRadius: 6, fontWeight: 800, fontSize: 13, width: "fit-content" }}>Sample Button</button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Quick Themes</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
            {THEME_PRESETS.map(p => (
              <button key={p.name} onClick={() => updateTheme(p.theme)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8,
                background: p.theme.bg1, border: `1px solid ${p.theme.border}`, textAlign: "left",
              }}>
                <span style={{ width: 14, height: 14, borderRadius: "50%", background: p.accentPreview, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, color: p.theme.textPri }}>{p.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Custom Colors</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
            <ColorField label="Page Background" value={theme.bg0}     onChange={v => updateTheme({ bg0: v, bg1: v })} />
            <ColorField label="Card Background" value={theme.bg2}     onChange={v => updateTheme({ bg2: v, bg3: v })} />
            <ColorField label="Border Color"    value={theme.border}  onChange={v => updateTheme({ border: v })} />
            <ColorField label="Accent Color"    value={theme.accent}  onChange={v => updateTheme({ accent: v })} />
            <ColorField label="Primary Text"    value={theme.textPri} onChange={v => updateTheme({ textPri: v })} />
            <ColorField label="Secondary Text"  value={theme.textSec} onChange={v => updateTheme({ textSec: v })} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
          <div>
            <label>Font Style</label>
            <select value={theme.font} onChange={e => updateTheme({ font: e.target.value })}>
              {FONT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
          <div>
            <label>Text Size</label>
            <select value={theme.fontSize} onChange={e => updateTheme({ fontSize: e.target.value })}>
              {FONT_SIZE_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={resetTheme} style={{ flex: 1, padding: "11px 0", background: "var(--bg3)", color: "var(--on-surface)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>↺ Reset to Default</button>
          <button onClick={onClose} style={{ flex: 1, padding: "11px 0", background: "var(--amber)", color: "var(--on-accent)", borderRadius: 8, fontWeight: 800 }}>✓ Done</button>
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)", lineHeight: 1.5 }}>
          Saved for this station/device only — won't affect other departments.
        </div>
      </div>
    </div>
  );
}

function AppearanceButton({ isMobile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Appearance" style={{
        padding: isMobile ? "6px 10px" : "8px 14px",
        background: "var(--bg3)", color: "var(--text-sec)",
        border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700,
        fontSize: isMobile ? 11 : 13, display: "flex", alignItems: "center", gap: 6,
      }}>
        <Palette size={14} />
      </button>
      {open && <AppearanceModal onClose={() => setOpen(false)} />}
    </>
  );
}

const TYC_MACHINES_UI = [
  { value: "GREEN_2",     label: "Green II" },
  { value: "GREEN_3",     label: "Green III" },
  { value: "GREEN_3_NEW", label: "Green IV" },
];

function ThankYouCardModal({ onClose }) {
  const [tab, setTab] = useState("new");
  const isMobile = useIsMobile();

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9300 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24,
        width: "100%", maxWidth: 520, maxHeight: isMobile ? "92dvh" : "90vh",
        overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Thank You Cards</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>{tab === "new" ? "New Entry" : "History"}</div>
          </div>
          <button onClick={onClose} style={{ padding: "8px 12px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setTab("new")} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, background: tab === "new" ? "var(--amber)" : "var(--bg3)", color: tab === "new" ? "#000" : "var(--text-sec)" }}>+ New</button>
          <button onClick={() => setTab("history")} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: 700, borderRadius: 6, background: tab === "history" ? "var(--amber)" : "var(--bg3)", color: tab === "history" ? "#000" : "var(--text-sec)" }}>Today / History</button>
        </div>

        {tab === "new" ? <ThankYouCardForm onClose={onClose} /> : <ThankYouCardHistory />}
      </div>
    </div>
  );
}

function ThankYouCardForm({ onClose }) {
  const [jobNo, setJobNo] = useState("");
  const [customer, setCustomer]       = useState("");
  const [knownNames, setKnownNames]   = useState([]);
  const [showNewName, setShowNewName] = useState(false);
  const [coupleName, setCoupleName]   = useState("");
  const [machine, setMachine]         = useState("");
  const [size, setSize]               = useState("");
  const [quantity, setQuantity]       = useState("1");
  const [price, setPrice]             = useState("");
  const [selectedDate, setSelectedDate] = useState(() => slDateStr(new Date()));
  const [calYear, setCalYear]         = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]       = useState(new Date().getMonth() + 1);
  const [showCal, setShowCal]         = useState(false);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState(false);

  useEffect(() => { api.knownThankYouNames().then(d => setKnownNames(d.names || [])).catch(() => {}); }, []);

  const qtyNum   = Number(quantity) || 0;
  const priceNum = Number(price) || 0;
  const totalPrice = qtyNum * priceNum;
  const isToday = selectedDate === slDateStr(new Date());
  const canSubmit = customer.trim() && machine && size && qtyNum > 0 && price && !saving;

  async function submit(e) {
    e.preventDefault();
    setError("");
    if (!canSubmit) return;
    setSaving(true);
    try {
      await api.createThankYouCard({
        customer: customer.trim(),
        couple_name: coupleName.trim() || undefined,
        machine,
        size: size.trim(),
        quantity: qtyNum,
        price: priceNum,
        date: selectedDate,
        job_no: jobNo.trim() || undefined,
      });
      setSuccess(true);
      setTimeout(onClose, 1100);
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label>Job No <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
        <input value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="e.g. JOB-0012" />
      </div>
      <div>
        <label>Photographer / Studio *</label>
        {knownNames.length > 0 && !showNewName ? (
          <select value={knownNames.includes(customer) ? customer : ""} onChange={e => {
            if (e.target.value === "__new__") { setShowNewName(true); setCustomer(""); }
            else setCustomer(e.target.value);
          }}>
            <option value="">-- Select name --</option>
            {knownNames.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="__new__">+ Type a new name</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Studio name" autoFocus style={{ flex: 1 }} />
            {knownNames.length > 0 && (
              <button type="button" onClick={() => { setShowNewName(false); setCustomer(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>← Back</button>
            )}
          </div>
        )}
      </div>

      <div>
        <label>Couple Name <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
        <input value={coupleName} onChange={e => setCoupleName(e.target.value)} placeholder="Optional" />
      </div>

      <div>
        <label>Machine *</label>
        <select value={machine} onChange={e => setMachine(e.target.value)}>
          <option value="">-- Select machine --</option>
          {TYC_MACHINES_UI.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <div className="r-grid-3">
        <div><label>Size *</label>
          <select value={size} onChange={e => setSize(e.target.value)}>
            <option value="">-- Select --</option>
            {THANK_U_CARDS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div><label>Quantity *</label><input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="1" /></div>
        <div><label>Unit Price (Rs.) *</label><input type="number" min="0" value={price} onChange={e => setPrice(e.target.value)} placeholder="e.g. 250" /></div>
      </div>

      {qtyNum > 0 && priceNum > 0 && (
        <div style={{ background: "#807a7a", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".06em", fontWeight: 700 }}>Total Price</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 18, fontWeight: 900, color: "var(--text-pri)" }}>Rs. {totalPrice}</span>
        </div>
      )}

      <div>
        <label>Date</label>
        <button type="button" onClick={() => setShowCal(p => !p)} style={{
          width: "100%", textAlign: "left", padding: "9px 12px", background: "var(--bg3)", color: "var(--text-pri)",
          border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, fontSize: 14,
        }}>
          <Calendar size={14} />
          {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
          {isToday && <span style={{ fontSize: 10, color: "var(--green)", marginLeft: "auto" }}>TODAY</span>}
        </button>
        {showCal && (
          <div style={{ marginTop: 8 }}>
            <EntryCalendar year={calYear} month={calMonth}
              onYearMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
              dotDays={{}} selectedDate={selectedDate} onSelect={setSelectedDate}
              onAfterSelect={() => setShowCal(false)} accent="var(--amber)" />
          </div>
        )}
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--red)" }}>⚠ {error}</div>}
      {success && <div style={{ fontSize: 13, color: "var(--green)", fontWeight: 700, textAlign: "center" }}>✓ Saved!</div>}

      <button type="submit" disabled={!canSubmit} style={{
        padding: "13px 0", background: canSubmit ? "var(--amber)" : "var(--bg3)", color: canSubmit ? "#000" : "var(--text-dim)",
        borderRadius: 8, fontWeight: 800, fontSize: 15,
      }}>{saving ? "Saving…" : "✓ Save Card"}</button>
    </form>
  );
}

function ThankYouCardHistory() {
  const [machine, setMachine]         = useState("");
  const [selectedDate, setSelectedDate] = useState(() => slDateStr(new Date()));
  const [calYear, setCalYear]         = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]       = useState(new Date().getMonth() + 1);
  const [dotDays, setDotDays]         = useState({});
  const [data, setData]               = useState(null);
  const [page, setPage]               = useState(1);
  const [loading, setLoading]         = useState(false);

  useEffect(() => {
    api.thankYouCardDates(calYear, calMonth, machine).then(setDotDays).catch(() => setDotDays({}));
  }, [calYear, calMonth, machine]);

  useEffect(() => { setPage(1); }, [selectedDate, machine]);

  useEffect(() => {
    setLoading(true);
    api.thankYouCards(machine, selectedDate, page)
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [machine, selectedDate, page]);

  const machineLabel = { GREEN_2: "Green II", GREEN_3: "Green III", GREEN_3_NEW: "Green IV" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div>
        <label>Machine</label>
        <select value={machine} onChange={e => setMachine(e.target.value)}>
          <option value="">All Machines</option>
          {TYC_MACHINES_UI.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
        </select>
      </div>

      <EntryCalendar year={calYear} month={calMonth}
        onYearMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
        dotDays={dotDays} selectedDate={selectedDate} onSelect={setSelectedDate} accent="var(--amber)" />

      {data && (
        <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} total
          </span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 20, fontWeight: 900, color: "var(--amber)" }}>{data.total}</span>
        </div>
      )}

      {loading && <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-dim)", fontSize: 12 }}>Loading…</div>}
      {!loading && data?.cards?.length === 0 && (
        <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-dim)", fontSize: 12 }}>No thank you cards on this day.</div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data?.cards?.map(c => (
          <div key={c.id} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, padding: "8px 10px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-pri)" }}>
                {c.job_no && <span style={{ color: "var(--amber)", marginRight: 6 }}>{c.job_no}</span>}
                {c.customer}</div>
              {c.couple_name && <div style={{ fontSize: 11, color: "var(--text-sec)" }}>{c.couple_name}</div>}
              <div style={{ fontSize: 10, color: "var(--text-dim)", marginTop: 2 }}>
                {machineLabel[c.machine] || c.machine} · {c.size} · × {c.quantity}
              </div>
            </div>
            <div style={{ fontFamily: "var(--fm)", fontWeight: 800, color: "var(--amber)", flexShrink: 0 }}>Rs. {c.total_price}</div>
          </div>
        ))}
      </div>
      {data && data.pages > 1 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "5px 10px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>◀</button>
          <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{page} / {data.pages}</span>
          <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} style={{ padding: "5px 10px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>▶</button>
        </div>
      )}
    </div>
  );
}

function ThankYouCardButton({ isMobile }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)} title="Thank You Card" style={{
        padding: isMobile ? "6px 10px" : "8px 14px",
        background: "var(--bg3)", color: "var(--amber)",
        border: "1px solid var(--amber)", borderRadius: 6, fontWeight: 700,
        fontSize: isMobile ? 11 : 13, display: "flex", alignItems: "center", gap: 6,
      }}>
        {isMobile ? <Gift size={14} /> : "ThankUcard"}
      </button>
      {open && <ThankYouCardModal onClose={() => setOpen(false)} />}
    </>
  );
}

function slDateStr(date) {
  // Shift any Date into Sri Lanka's calendar day (UTC+5:30), regardless
  // of what timezone the viewing device is set to.
  const SL_OFFSET_MS = (5 * 60 + 30) * 60000;
  return new Date(date.getTime() + SL_OFFSET_MS).toISOString().slice(0, 10);
}



// ── Router ────────────────────────────────────────────────────────────────────
function getPage() {
  const p = window.location.pathname;
  if (p === "/track")     return { page: "track" };
  if (p === "/entry")     return { page: "entry" };
  if (p === "/history")   return { page: "history" };
  if (p === "/analytics") return { page: "analytics" };
  if (p === "/damages")   return { page: "damages" };
  if (p === "/papers")    return { page: "papers" };
  if (p === "/admin/date-fix") return { page: "date-fix" }; 
  const md = p.match(/^\/station\/([\w]+)\/damages$/);
  if (md) return { page: "damages", dept: md[1] };
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
  { label: "Damages",       path: "/damages",              accent: "var(--red)"    },
  { label: "Papers",        path: "/papers",               accent: "#3b82f6"       },
  { label: "Fix Dates",     path: "/admin/date-fix",       accent: "var(--red)"    },
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
  const remaining = parseUTC(completedAt).getTime() + 24 * 3600000 - Date.now();
  if (remaining <= 0) return null;
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  const isUrgent = remaining < 4 * 3600000;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
      fontFamily: "var(--fm)", background: isUrgent ? "#2a0a00" : "var(--bg3)",
      color: isUrgent ? "var(--danger-text)" : "var(--text-dim)",
      border: `1px solid ${isUrgent ? "var(--danger-border)" : "var(--border)"}`,
    }}>{h}h {m}m</span>
  );
}

// ── Delay reason modal ────────────────────────────────────────────────────────
function DelayReasonModal({ job, dept, onClose, onSaved, addToast }) {
  const [presets, setPresets] = useState([]);
  const [custom,  setCustom]  = useState("");
  const [saving,  setSaving]  = useState(false);
  const isMobile = useIsMobile();
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
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 480, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{  fontSize: 12, color: "var(--red)", letterSpacing: ".1em", textTransform: "uppercase", marginBottom: 4 }}>DELAY REASON - {deptLabel}</div>
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


// ── Payment edit modal ────────────────────────────────────────────────────────
function PaymentEditModal({ job, onClose, onSaved, addToast }) {
  const [name,       setName]      = useState(job.payment_by || "");
  const [knownNames, setKnown]     = useState([]);
  const [showNew,    setShowNew]   = useState(!job.payment_by);
  const [saving,     setSaving]    = useState(false);
  const isMobile = useIsMobile(); 

  useEffect(() => {
    api.knownPaymentNames().then(d => setKnown(d.names || [])).catch(() => {});
  }, []);

  function handleName(e) {
    setName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()));
  }

  async function save() {
    const finalName = name.trim();
    if (!finalName) return;
    setSaving(true);
    try {
      await api.updatePayment(job.id, finalName);
      addToast?.(`✓ Payment recorded for #${job.job_no}`, "success");
      onSaved?.(finalName.replace(/\b\w/g, c => c.toUpperCase()));
      onClose();
    } catch (err) { addToast?.(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9100 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 420, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Payment Taken By</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>{job.job_no}</div>
          <div style={{ fontSize: 14, color: "var(--text-sec)" }}>{job.customer}</div>
        </div>
        <div>
          <label>Payment taken by *</label>
          {knownNames.length > 0 && !showNew ? (
            <select
              value={knownNames.includes(name) ? name : ""}
              onChange={e => {
                if (e.target.value === "__new__") { setShowNew(true); setName(""); }
                else setName(e.target.value);
              }}
              style={{ margin: 0 }}
            >
              <option value="">-- Select name --</option>
              {knownNames.map(n => <option key={n} value={n}>{n}</option>)}
              <option value="__new__">+ Type a new name</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={name} onChange={handleName} placeholder="Enter name" autoFocus style={{ flex: 1 }} />
              {knownNames.length > 0 && (
                <button onClick={() => { setShowNew(false); setName(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>← Back</button>
              )}
            </div>
          )}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving || !name.trim()} style={{ flex: 1, padding: "12px 0", background: name.trim() ? "var(--amber)" : "var(--bg3)", color: name.trim() ? "#000" : "var(--text-dim)", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>
            {saving ? "Saving…" : "✓ Save Payment"}
          </button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Payment field (display + edit — ENTRY role only) ────────────────────────
function PaymentField({ job, addToast }) {
  const [editing, setEditing] = useState(false);
  const [local,   setLocal]   = useState(job.payment_by || "");

  useEffect(() => { setLocal(job.payment_by || ""); }, [job.payment_by]);

  const hasPayment = !!local;

  if (ROLE !== "ENTRY") {
    if (!hasPayment) return null;
    return <Chip label="Payment" value={local} accent="#16a34a" />;
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Chip label="Payment" value={hasPayment ? local : "Not Taken"} accent={hasPayment ? "#16a34a" : "#e53e3e"} />
      <button onClick={() => setEditing(true)} style={{
        padding: "3px 12px", fontSize: 12, fontWeight: 700, borderRadius: 5,
        background: hasPayment ? "var(--amber)" : "#035702", 
        color:hasPayment? "#ff0000":"var(--text-pri)",
        border: `1px solid ${hasPayment ? "var(--border)" : "#00ff3c"}`,
      }}>{hasPayment ? "EDIT PAYMENT" : "ADD PAYMENT"}</button>
      {editing && (
        <PaymentEditModal
          job={job}
          onClose={() => setEditing(false)}
          onSaved={setLocal}
          addToast={addToast}
        />
      )}
    </div>
  );
}

function BoxPouchField({ job, addToast }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(job.box_pouch_status || "");
  useEffect(() => { setLocal(job.box_pouch_status || ""); }, [job.box_pouch_status]);
  if (!local) return null;
  const canEdit = ROLE === "BINDING";   // only the binding station can edit this
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Chip label="Box/Pouch" value={boxPouchLabel(local)} accent={boxPouchAccent(local)} />
      {canEdit && (
        <button onClick={() => setEditing(true)} style={{
          padding: "5px 12px", fontSize: 12, fontWeight: 700, borderRadius: 5,
          background: "var(--amber)", color: "var(--red)", border: "1px solid var(--border)",
        }}>EDIT</button>
      )}
      {editing && (
        <BoxPouchEditModal job={{ ...job, box_pouch_status: local }} onClose={() => setEditing(false)} onSaved={setLocal} addToast={addToast} />
      )}
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

function GlobalSearchBar() {
  const [query, setQuery]       = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [open, setOpen]         = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [previewJob, setPreviewJob] = useState(null);   // ← compact modal
  const [viewJob, setViewJob]       = useState(null);   // ← full modal (opened from preview)
  const wrapRef = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    if (!debounced) { setResults([]); setOpen(false); return; }
    setLoading(true);
    api.searchJobs(debounced)
      .then(d => { setResults(d.jobs || []); setOpen(true); })
      .catch(() => setResults([]))
      .finally(() => setLoading(false));
  }, [debounced]);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function pick(job) {
    setPreviewJob(job);
    setOpen(false);
    setMobileOpen(false);
    setQuery("");
  }

  function statusOf(job) {
    if (job.is_fully_completed) return { label: "Completed", color: "var(--green)" };
    const anyDelayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
    if (anyDelayed) return { label: "Delayed", color: "var(--red)" };
    return { label: "In Progress", color: "var(--amber)" };
  }

  const box = (
    <div ref={wrapRef} style={{ position: "relative", width: isMobile ? "100%" : 240 }}>
      <div style={{ position: "relative" }}>
        <Search size={14} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--text-dim)" }} />
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search job no / customer…"
          style={{ margin: 0, paddingLeft: 30, fontSize: 13, padding: "7px 10px 7px 30px" }}
        />
      </div>

      {open && (
        <div className="si" style={{
          position: "absolute", top: "calc(100% + 6px)",
          left: isMobile ? 0 : "auto", right: 0,
          width: isMobile ? "100%" : 320, maxWidth: "94vw",
          background: "var(--bg1)", border: "1px solid var(--amber)", borderRadius: 8,
          boxShadow: "0 8px 30px rgba(0,0,0,.6)", zIndex: 9000,
          maxHeight: 360, overflowY: "auto", padding: 6,
        }}>
          {loading && <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>Searching…</div>}
          {!loading && results.length === 0 && (
            <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--text-dim)" }}>No jobs found.</div>
          )}
          {!loading && results.map(job => {
            const st = statusOf(job);
            return (
              <button key={job.id} onClick={() => pick(job)} style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                gap: 8, padding: "8px 10px", background: "transparent", borderRadius: 6, textAlign: "left",
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 13, color: "var(--amber)", fontWeight: 800 }}>{job.job_no}</div>
                  <div style={{ fontSize: 12, color: "var(--text-sec)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.customer}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 20, flexShrink: 0,
                  background: st.color + "22", color: st.color, border: `1px solid ${st.color}55`,
                }}>{st.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <>
      {isMobile ? (
        mobileOpen ? (
          <div style={{ position: "fixed", top: 60, left: 0, right: 0, padding: "8px 10px", background: "var(--bg1)", borderBottom: "1px solid var(--border)", zIndex: 200, display: "flex", gap: 6 }}>
            <div style={{ flex: 1 }}>{box}</div>
            <button onClick={() => { setMobileOpen(false); setQuery(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6 }}>✕</button>
          </div>
        ) : (
          <button onClick={() => setMobileOpen(true)} title="Search jobs" style={{
            padding: "6px 10px", background: "var(--bg3)", color: "var(--text-sec)",
            border: "1px solid var(--border)", borderRadius: 6,
          }}><Search size={14} /></button>
        )
      ) : box}

      {previewJob && (
        <CompactJobPreviewModal
          job={previewJob}
          onClose={() => setPreviewJob(null)}
          onViewFull={() => { setViewJob(previewJob); setPreviewJob(null); }}
        />
      )}
      {viewJob && <JobCardViewModal job={viewJob} onClose={() => setViewJob(null)} addToast={() => {}} />}
    </>
  );
}
 // ── Search bar ────────────────────────────────────────────────────────────────
function SearchBar({ value, onChange, placeholder = "Search Job No / Studio / Couple…" }) {
  return (
    <div style={{ position: "relative", marginBottom: 12 }}>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: "100%", paddingLeft: 34, boxSizing: "border-box" }}
      />
      <span style={{ position: "absolute", left: 10, top: "55%", transform: "translateY(-50%)", color: "var(--text-dim)", fontSize: 14 }}><Search size={18} /></span>
      {value && (
        <button onClick={() => onChange("")} style={{
          position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
          background: "transparent", border: "none", color: "var(--text-dim)",
          fontSize: 13, minHeight: "unset", padding: "4px 8px", cursor: "pointer",
        }}>✕</button>
      )}
    </div>
  );
}

function matchesSearch(job, term) {
  if (!term || !term.trim()) return true;
  const t = term.trim().toLowerCase();
  return (
    job.job_no?.toLowerCase().includes(t) ||
    job.customer?.toLowerCase().includes(t) ||
    job.couple_name?.toLowerCase().includes(t)
  );
}

// ── Compact row for completed/dispatched list ───────────────────────────────────
function CompactHistoryRow({ job, onView }) {
  return (
    <button onClick={() => onView(job)} style={{
      display: "flex", alignItems: "center", gap: 10, width: "100%",
      background: "var(--bg2)", border: "1px solid var(--border)",
      borderRadius: 6, padding: "8px 10px", textAlign: "left", cursor: "pointer",
    }}>
      <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "var(--amber)", fontWeight: 800, minWidth: 62, flexShrink: 0 }}>
        {job.job_no}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text-pri)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {job.customer}
        </div>
        {job.couple_name && (
          <div style={{ fontSize: 11, color: "var(--text-sec)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {job.couple_name}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
        {job.print_size  && <Chip label="Size"  value={job.print_size}  accent="#3b82f6" />}
        {job.print_pages && <Chip label="Pages" value={job.print_pages} accent="#3b82f6" />}
      </div>
    </button>
  );
}

function CompactJobPreviewModal({ job, onClose, onViewFull }) {
  const isMobile = useIsMobile();
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  const days = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);

  const stageList = [
    { label: "Print",  field: "status_printing" },
    { label: "Laser",  field: "status_laser_cutting" },
    { label: "Lam",    field: "status_laminating" },
    { label: "Bind",   field: "status_binding" },
  ];

  function stageColor(v) {
    if (v === "COMPLETED")   return "#22c55e";
    if (v === "IN_PROGRESS") return "#f5a623";
    if (v === "SKIPPED")     return "#666";
    return "#444";
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--overlay)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center",
      zIndex: 9200, padding: isMobile ? 0 : 16,
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: isMobile ? "16px 16px 0 0" : 12,
        padding: 18, width: "100%", maxWidth: 380,
        maxHeight: isMobile ? "80dvh" : "85vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 12,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
              <span style={{ fontFamily: "var(--fm)", fontSize: 17, fontWeight: 800, color: "var(--amber)" }}>{job.job_no}</span>
              {job.priority === "URGENT" && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--red)", color: "#000", fontWeight: 800 }}>URGENT</span>}
              {delayed && <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: "var(--danger-bg)", color: "var(--red)", fontWeight: 800, border: "1px solid var(--red)" }}>DELAYED</span>}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-pri)", marginTop: 2 }}>{job.customer}</div>
            {job.couple_name && <div style={{ fontSize: 12, color: "var(--text-sec)" }}>{job.couple_name}</div>}
          </div>
          <button onClick={onClose} style={{ padding: "5px 9px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, flexShrink: 0 }}>✕</button>
        </div>

        <div style={{
          background: "var(--bg3)", borderRadius: 6, padding: "8px 12px",
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>Delivery</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: days < 2 ? "var(--red)" : "var(--text-pri)" }}>
            {new Date(job.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
            {" · "}{days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "Today" : `${days}d left`}
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
          {stageList.map(s => (
            <div key={s.label} style={{
              background: "var(--bg2)", border: `1px solid ${stageColor(job[s.field])}55`,
              borderTop: `2px solid ${stageColor(job[s.field])}`,
              borderRadius: 6, padding: "6px 4px", textAlign: "center",
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--text-sec)", textTransform: "uppercase" }}>{s.label}</div>
              <div style={{ fontSize: 10, fontWeight: 800, color: stageColor(job[s.field]), marginTop: 2 }}>
                {job[s.field] === "IN_PROGRESS" ? "Active" : job[s.field] === "COMPLETED" ? "Done" : job[s.field] === "SKIPPED" ? "N/A" : "Pending"}
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
          {job.print_size  && <Chip label="Size"  value={job.print_size}  accent="#3b82f6" />}
          {job.album_type  && <AlbumTypeBadge type={job.album_type} />}
          {job.payment_by  && <Chip label="Payment" value={job.payment_by} accent="#16a34a" />}
        </div>

        <button onClick={onViewFull} style={{
          padding: "11px 0", background: "var(--amber)", color: "#000",
          borderRadius: 8, fontWeight: 800, fontSize: 14,
        }}>View Full Job Card</button>
      </div>
    </div>
  );
}

// ── Full job card viewer modal (click a compact row to see everything) ──────────
function JobCardViewModal({ job, onClose, addToast }) {
  const isMobile = useIsMobile();
  return (
    <div style={{
      position: "fixed", inset: 0, background: "var(--overlay)",
      display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "center",
      zIndex: 9500, overflowY: "auto",
      padding: isMobile ? 0 : "24px 16px",
    }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%",
        maxWidth: isMobile ? "100%" : 640,
        minHeight: isMobile ? "100vh" : "auto",
        position: "relative",
        background: isMobile ? "var(--bg0)" : "transparent",
        padding: isMobile ? "0 0 40px" : 0,
      }}>
        <button onClick={onClose} style={{
          position: isMobile ? "sticky" : "absolute",
          top: 0, right: isMobile ? 0 : -6,
          marginLeft: isMobile ? "auto" : 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          gap: 6, width: isMobile ? "100%" : 30, height: isMobile ? "auto" : 30,
          padding: isMobile ? "12px 14px" : 0,
          background: "var(--red)", color:"var(--text-pri)",
          border: "none", borderRadius: isMobile ? 0 : "50%",
          fontWeight: 800, zIndex: 5, cursor: "pointer",
        }}>✕{isMobile && " Close"}</button>
        <div style={{ padding: isMobile ? "10px 10px 0" : 0 }}>
         <JobCardFull job={job} showExpiry={false} addToast={addToast} />
        </div>
      </div>
    </div>
  );
}

// ── Completed / Dispatched dropdown (lives in the header topRight space) ────────
function DeptCompletedDropdown({ deptKey, title = "Dispatched", accent = "var(--amber)", mrb="0px", addToast, showBreakdown = false }) {
  const [open,            setOpen]            = useState(false);
  const [search,          setSearch]          = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page,            setPage]            = useState(1);
  const [data,            setData]            = useState(null);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [viewJob,         setViewJob]         = useState(null);
  const wrapRef  = useRef(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

   useEffect(() => {
    api.stationHistory(deptKey, "", 1)
      .then(d => setData(prev => prev ?? d))
      .catch(() => {});
  }, [deptKey]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setError("");
    api.stationHistory(deptKey, debouncedSearch, page)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { setError(err.message || "Failed to load"); setLoading(false); });
  }, [deptKey, debouncedSearch, page, open]);

  useEffect(() => {
    function handler(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", width: isMobile ? "100%" : "auto" }}>
     <button onClick={() => setOpen(p => !p)} style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: isMobile ? "6px 10px" : "8px 14px",
        background: "var(--bg3)", color: accent,
        marginBottom:mrb,
        border: `1px solid ${accent}`, borderRadius: 6, fontWeight: 700, cursor: "pointer",
        fontSize: isMobile ? 11 : 13,
      }}>
        {isMobile ? <Calendar size={14} /> : title}{data ? ` (${data.total})` : ""}
      </button>

      {open && (
        <div className="si" style={{
          position: isMobile ? "fixed" : "absolute",
          top: isMobile ? 70 : "calc(100% + 8px)",
          left: isMobile ? "3vw" : "auto",
          right: isMobile ? "3vw" : 0,
          zIndex: 500,
          width: isMobile ? "94vw" : (showBreakdown ? 420 : 380),
          maxWidth: "94vw",
          background: "var(--bg1)", border: `1px solid ${accent}`, borderRadius: 10,
          boxShadow: "0 8px 30px rgba(0,0,0,.6)", padding: 12,
          display: "flex", flexDirection: "column", gap: 10,
          maxHeight: "80vh", overflowY: "auto",
        }}>
          {/* ── NEW: Album Type Breakdown, only inside this dropdown ── */}
          {showBreakdown && (
            <AlbumTypeBreakdownPanel dept={deptKey} accent={accent} />
          )}

          <SearchBar value={search} onChange={setSearch} placeholder="Job No / Studio / Couple…" />

          {error && <div style={{ fontSize: 12, color: "var(--red)", padding: "4px 0" }}>⚠ {error}</div>}
          {loading && <div style={{ textAlign: "center", padding: "16px 0", color: "var(--text-dim)", fontSize: 12, letterSpacing: ".08em" }}>LOADING…</div>}
          {!loading && !error && data?.jobs?.length === 0 && (
            <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-dim)", fontSize: 12, letterSpacing: ".06em" }}>
              NO {search ? "MATCHING " : ""}JOBS
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {data?.jobs?.map(job => (
              <CompactHistoryRow key={job.id} job={job} onView={setViewJob} />
            ))}
          </div>

          {data && data.pages > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "5px 10px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>◀</button>
              <span style={{ fontSize: 12, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{page} / {data.pages}</span>
              <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} style={{ padding: "5px 10px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 12, fontWeight: 700 }}>▶</button>
            </div>
          )}
        </div>
      )}

      {viewJob && <JobCardViewModal job={viewJob} onClose={() => setViewJob(null)} addToast={addToast} />}
    </div>
  );
}

function useLowStockBlink() {
  const [low, setLow] = useState(false);
  useEffect(() => {
    if (ROLE !== "PRINTING" && !IS_ADMIN) return;
    const check = () => api.paperStockStats().then(d => {
      setLow((d.low_stock_sizes || []).length > 0);
    }).catch(() => {});
    check();
    const t = setInterval(check, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);
  return low;
}

function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) return null;

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      title="Scroll to top"
      style={{
        position: "fixed",
        bottom: isMobile ? 18 : 26,
        right: isMobile ? 14 : 24,
        width: isMobile ? 42 : 48,
        height: isMobile ? 42 : 48,
        borderRadius: "50%",
        background: "var(--bg3)",
        color: "var(--amber)",
        border: "1px solid var(--border-strong)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,.4)",
        zIndex: 8000,
        cursor: "pointer",
      }}
    >
      <ArrowUp size={isMobile ? 18 : 20} />
    </button>
  );
}

const TRACK_STAGE_LABELS = { PENDING: "Pending", IN_PROGRESS: "In Progress", COMPLETED: "Done", SKIPPED: "Not Needed" };
const TRACK_STAGE_COLORS = { PENDING: "#888", IN_PROGRESS: "#f5a623", COMPLETED: "#22c55e", SKIPPED: "#555" };

function TrackPage() {
  const [jobNo, setJobNo] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const isMobile = useIsMobile();

  async function search(e) {
    e?.preventDefault();
    const q = jobNo.trim();
    if (!q) return;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await api.track(q);
      setResult(res);
    } catch (err) {
      setError(err.message || "Album not found.");
    } finally {
      setLoading(false);
    }
  }

  const completedCount = result?.stages?.filter(s => s.status === "COMPLETED" || s.status === "SKIPPED").length || 0;
  const totalStages = result?.stages?.length || 4;
  const progressPct = result ? Math.round((completedCount / totalStages) * 100) : 0;

  return (
    <div style={{
      minHeight: "100vh", background: "#0a0a0a", color: "#f0f0f0",
      display: "flex", flexDirection: "column", alignItems: "center",
      padding: isMobile ? "32px 16px" : "60px 20px",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <img src={logo} alt="Logo" style={{ height: 64, borderRadius: 50, marginBottom: 16 }} />
      <div style={{ fontSize: isMobile ? 20 : 24, fontWeight: 800, color: "#f5a623", marginBottom: 4, textAlign: "center" }}>
        Track Your Album
      </div>
      <div style={{ fontSize: 13, color: "#999", marginBottom: 28, textAlign: "center" }}>
        Enter your Job No to see production status
      </div>

      <form onSubmit={search} style={{ width: "100%", maxWidth: 420, display: "flex", gap: 8, marginBottom: 24 }}>
        <input
          value={jobNo}
          onChange={e => setJobNo(e.target.value)}
          placeholder="Ex. 0001"
          autoFocus
          style={{
            flex: 1, margin: 0, padding: "14px 16px", fontSize: 16,
            background: "#1a1a1a", border: "1px solid #333", borderRadius: 8, color: "#fff",
          }}
        />
        <button type="submit" disabled={loading || !jobNo.trim()} style={{
          padding: "14px 22px", background: loading ? "#333" : "#f5a623",
          color: loading ? "#888" : "#000", borderRadius: 8, fontWeight: 800, fontSize: 15,
        }}>{loading ? "…" : "Search"}</button>
      </form>

      {error && (
        <div style={{
          width: "100%", maxWidth: 420, background: "#2a0000", border: "1px solid #6a2a00",
          color: "#ff9060", borderRadius: 8, padding: "14px 16px", fontSize: 14, textAlign: "center",
        }}>
          ⚠ {error}
        </div>
      )}

      {result && (
        <div style={{
          width: "100%", maxWidth: 420, background: "#1a1a1a", border: "1px solid #333",
          borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16,
        }}>
          <div>
            <div style={{ fontSize: 22, fontWeight: 900, color: "#f5a623", fontFamily: "monospace" }}>{result.job_no}</div>
            {result.couple_name && <div style={{ fontSize: 15, color: "#e0e0e0", marginTop: 2 }}>{result.couple_name}</div>}
            <div style={{ fontSize: 12, color: "#999", marginTop: 6 }}>
              Expected Delivery: {new Date(result.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "#999", marginBottom: 6 }}>
              <span>Progress</span>
              <span>{progressPct}%</span>
            </div>
            <div style={{ width: "100%", height: 8, background: "#0a0a0a", borderRadius: 4, overflow: "hidden" }}>
              <div style={{
                width: `${progressPct}%`, height: "100%",
                background: result.is_fully_completed ? "#22c55e" : "#f5a623",
                transition: "width .4s ease",
              }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {result.stages.map((s, i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                background: "#0a0a0a", border: "1px solid #2a2a2a", borderRadius: 6, padding: "10px 14px",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#e0e0e0" }}>{s.label}</span>
                <span style={{
                  fontSize: 11, fontWeight: 800, padding: "3px 10px", borderRadius: 20,
                  background: TRACK_STAGE_COLORS[s.status] + "22",
                  color: TRACK_STAGE_COLORS[s.status],
                  border: `1px solid ${TRACK_STAGE_COLORS[s.status]}55`,
                }}>{TRACK_STAGE_LABELS[s.status] || s.status}</span>
              </div>
            ))}
          </div>

          {result.is_fully_completed && (
            <div style={{
              textAlign: "center", padding: "10px 0", background: "#001a00",
              border: "1px solid #1a4a1a", color: "#6aaa6a", borderRadius: 6, fontWeight: 800, fontSize: 13,
            }}>
              ✓ Your album is ready!
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 32, fontSize: 11, color: "#eeecec" }}>i Lab Gampaha</div>
    </div>
  );
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
  const onDamages   = path === "/damages" || /^\/station\/[\w]+\/damages$/.test(path);
  const onPapers    = path === "/papers";  
  const lowStock    = useLowStockBlink();
 
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg0)" }}>
      <header style={{
        background: "var(--bg1)", borderBottom: "1px solid var(--border)",
        padding: isMobile ? "8px 10px" : "0 20px",
        minHeight: 60,
        display: "flex", flexWrap: "wrap", alignItems: "center",
        rowGap: 8, gap: isMobile ? 8 : 14,
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
 
       <div style={{
          display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          flexWrap: "wrap", justifyContent: "flex-end",
          width: isMobile ? "100%" : "auto",
          order: isMobile ? 3 : 0,
        }}>
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
              background: "var(--bg3)", color: "var(--text-sec)",
              border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>{isMobile ? <Calendar size={14}/> : "History"}</button>
          )}
 
          {!IS_ADMIN && !onHistory && (
            <button onClick={() => navigate("/history")} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--bg3)", color:"var(--text-pri)",
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

          {/* ── ADD: Damages back button ── */}
          {!IS_ADMIN && onDamages && (
            <button onClick={() => navigate(getDeptHomePath())} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--amber)", color: "#000",
              border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>← {getDeptLabel()}</button>
          )}

          {/* ── ADD: Damages entry button (only for the 3 relevant stations) ── */}
          {!IS_ADMIN && !onDamages && DAMAGE_DEPTS.includes(ROLE) && (
            <button onClick={() => navigate(`/station/${ROLE.toLowerCase()}/damages`)} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--danger-bg)", color: "var(--red)",
              border: "1px solid var(--red)", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>{isMobile ? "⚠" : "⚠ Damages"}</button>
          )}

          {/* ── ADD: Papers entry button (Printing station only) ── */}
          {!IS_ADMIN && !onPapers && ROLE === "PRINTING" && (
            <button onClick={() => navigate("/papers")} className={lowStock ? "blink" : ""} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: lowStock ? "var(--danger-bg)" : "var(--info-bg)",
              color: lowStock ? "var(--red)" : "var(--blue)",
              border: `1px solid ${lowStock ? "var(--red)" : "var(--blue)"}`,
              borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>{isMobile ? "📄" : lowStock ? "Papers (Low!)" : "Papers"}</button>
          )}

          {/* ── ADD: Papers back button ── */}
          {!IS_ADMIN && onPapers && (
            <button onClick={() => navigate(getDeptHomePath())} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--amber)", color: "#000",
              border: "none", borderRadius: 6, fontWeight: 700, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
            }}>← {getDeptLabel()}</button>
          )}

        <GlobalSearchBar />
        <button onClick={downloadQR} title="Download Album Tracking QR" style={{
        padding: isMobile ? "6px 10px" : "8px 14px",
        background: "var(--bg3)", color: "var(--cyan)",
        border: "1px solid var(--cyan)", borderRadius: 6, fontWeight: 700, cursor: "pointer",
        fontSize: isMobile ? 11 : 13, display: "flex", alignItems: "center", gap: 6,
      }}>
        <Download size={14} />
      </button>
        {ROLE === "PRINTING" && !IS_ADMIN && (
         <ThankYouCardButton isMobile={isMobile} />
      )}
        <AppearanceButton isMobile={isMobile} />
        {topRight}        
            </div>
        </header>
      <main className="r-main-pad" style={{ flex: 1, padding: 20, maxWidth: 1400, width: "100%", margin: "0 auto", boxSizing: "border-box" }}>
        {children}
      </main>
        <footer style={{
            borderTop: "1px solid var(--border)",
            background: "var(--bg1)",
            padding: "10px 20px",
            textAlign: "center",
            fontSize: 11,
            color: "var(--text-dim)",
            letterSpacing: ".08em",
            fontFamily: "Inter, sans-serif",
            fontWeight: 600,
          }}>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99,
              background: "var(--bg3)", border: "1px solid var(--border)",
              color: "var(--text-dim)", letterSpacing: ".04em",
            }}>v1.1</span>
            <span>{" "}2026{" "}</span>
            
            <span style={{ color: "var(--amber)", fontWeight: 700 }}>
              Yasith Wijesuriya
            </span>
            {" "}— All rights reserved
        </footer>
        <ScrollToTopButton />
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

// // ── STEPS config ──────────────────────────────────────────────────────────────
// const STEPS = [
//   { label: "PRINT", field: "status_printing",      color: "#0058e6", dept: "PRINTING" },
//   { label: "LASER", field: "status_laser_cutting",  color: "#8100fa", dept: "LASER_CUTTING"},
//   { label: "LAMINATING",   field: "status_laminating",     color: "#00d9ff", dept: "LAMINATING"},
//   { label: "BIND",  field: "status_binding",        color: "#00ff5e", dept: "BINDING"},
// ];

function boxPouchLabel(status) {
  if (status === "COMPLETE")   return "Complete";
  if (status === "NOT_NEEDED") return "Not Needed";
  return "Processing";
}
function boxPouchAccent(status) {
  if (status === "COMPLETE")   return "#22c55e";
  if (status === "NOT_NEEDED") return "#888";
  return "#f59e0b";
}
function EntryCalendar({ year, month, onYearMonth, dotDays, selectedDate, onSelect, accent = "var(--amber)", onAfterSelect }) {
  const DAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const daysInMonth = new Date(year, month, 0).getDate();
  const startDay    = new Date(year, month - 1, 1).getDay();
  const cells = [];
  for (let i = 0; i < startDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  function selectDay(d) {
    const mm = String(month).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    onSelect(`${year}-${mm}-${dd}`);
    onAfterSelect?.();
  }

  const selDay = selectedDate.startsWith(`${year}-${String(month).padStart(2,"0")}`)
    ? parseInt(selectedDate.slice(8)) : -1;

  return (
    <div style={{ background: "var(--bg3)", borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <button onClick={() => { if (month === 1) onYearMonth(year - 1, 12); else onYearMonth(year, month - 1); }} style={{ color: "var(--text-sec)", fontSize: 16, padding: "0 6px" }}>◀</button>
        <span style={{ fontSize: 13, fontWeight: 700, color: accent, fontFamily: "var(--fm)" }}>{monthNames[month-1]} {year}</span>
        <button onClick={() => { if (month === 12) onYearMonth(year + 1, 1); else onYearMonth(year, month + 1); }} style={{ color: "var(--text-sec)", fontSize: 16, padding: "0 6px" }}>▶</button>
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
              background: isActive ? accent : "transparent",
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
      <button onClick={() => { const t = new Date(); onYearMonth(t.getFullYear(), t.getMonth()+1); onSelect(slDateStr(t)); onAfterSelect?.(); }}
        style={{ marginTop: 8, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 700, color: accent, background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--border)" }}>Today</button>
    </div>
  );
}

// ── Chip ──────────────────────────────────────────────────────────────────────
function Chip({ label, value, accent = "#555" }) {
  if (!value) return null;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 0,
      fontSize: 12, borderRadius: 6, overflow: "hidden",
      border: `1px solid ${accent}33`, borderLeft: `3px solid ${accent}`,
      alignSelf: "flex-start",
    }}>
      <span style={{
        padding: "4px 7px", background: "var(--surface-sunken)",
        color: "var(--text-dim)", fontSize: 11, fontWeight: 600,
        textTransform: "uppercase", letterSpacing: ".07em",
        borderRight: `1px solid ${accent}33`,
      }}>{label}</span>
      <span style={{
        padding: "4px 9px", background: "var(--surface-sunken)",
        color:"var(--text-pri)", fontWeight: 700, fontSize: 12,
      }}>{value}</span>
    </span>
  );
}



function AlbumTypeBadge({ type }) {
  if (!type) return null;
  if (type === "NORMAL") {
    return (
      <span style={{
        fontSize: 11, padding: "3px 9px", borderRadius: 4, fontWeight: 800,
        letterSpacing: ".06em", textTransform: "uppercase",
        background: "#0d3b2a", color: "#7fffb0",
        border: "1px solid #16a34a",
      }}>
        Magazine Album
      </span>
    );
  }
  const isStory = type === "STORY";
  return (
    <span style={{
      fontSize: 11, padding: "3px 9px", borderRadius: 4, fontWeight: 800,
      letterSpacing: ".06em", textTransform: "uppercase",
      background: isStory ? "#3b1d6b" : "#0d3b5c",
      color: isStory ? "#c9a6ff" : "#7fd4ff",
      border: `1px solid ${isStory ? "#7c3aed" : "#0ea5e9"}`,
    }}>
      {isStory ? "Story Album" : "Rebind Album"}
    </span>
  );
}

// ── Special note block ────────────────────────────────────────────────────────
function SpecialNote({ note }) {
  if (!note) return null;
  return (
    <div style={{
      background: "var(--warn-bg)", border: "1px solid var(--warn-border)",
      borderLeft: "4px solid var(--amber)", borderRadius: 6, overflow: "hidden",
    }}>
      <div style={{ background: "var(--warn-bg)", padding: "6px 12px", borderBottom: "1px solid var(--warn-border)", display: "flex", alignItems: "center", gap: 7 }}>
        <Speech size={14}/>
        <span style={{ fontSize: 13, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".12em", fontWeight: 800 }}>Special Instructions</span>
      </div>
      <div style={{ padding: "10px 14px", fontSize: 12, color: "var(--text-pri)", lineHeight: 1.7, fontWeight: 700,textTransform:"uppercase" }}>{note}</div>
    </div>
  );
}

// ── Operator tag ──────────────────────────────────────────────────────────────
function OperatorTag({ log, dept }) {
  if (!log?.operator_name) return null;
  const showUnder    = dept === "PRINTING" && log.under_whom;
  const showMachine   = dept === "PRINTING" && log.machine;
  const isLaminating  = dept === "LAMINATING";
  const machineLabel = { GREEN_2: "Green 2", GREEN_3: "Green 3", EPSON: "Epson", GREEN_3_NEW: "Green IV" }[log.machine] || log.machine;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 4, flexWrap: "wrap", marginTop: 3 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: isLaminating ? "var(--info-bg)" : "var(--info-bg)", border: `1px solid ${isLaminating ? "#06b6d4" : "var(--border-strong)"}`, color: "var(--text-pri)", letterSpacing: ".08em" }}>
        {isLaminating ? <span style={{color: "var(--red)"}}>ACCU. BY </span> : "👤"}{log.operator_name}
      </span>
      {showUnder && (
        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "var(--info-bg)", border: "1px solid var(--border-strong)", color: "var(--text-pri)", letterSpacing: ".08em" }}>
          <span style={{ color: "var(--red)" }}>SUPERVISED </span> {log.under_whom}
        </span>
      )}
      {showMachine && (
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--info-bg)", border: "1px solid var(--border-strong)", color: "var(--text-pri)", letterSpacing: ".08em" }}>
          🖨 {machineLabel}
        </span>
      )}
    </div>
  );
}




// ── Stage row ─────────────────────────────────────────────────────────────────
function StageRow({ job }) {
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  return (
    <div style={{
      background: "var(--bg1)", borderRadius: 6, overflow: "hidden",
      border: `1px solid ${delayed ? "var(--red)" : "var(--text-pri)"}`,
    }}>
      <div style={{ padding: "6px 12px", borderBottom: "1px solid #ffffff", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 800 }}>Production Pipeline</span>
        {delayed && <span className="blink" style={{ fontSize: 11, color: "var(--red)", fontWeight: 700 }}>⚠ DELAYED</span>}
        {job.is_fully_completed && <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>✓ ALL DONE</span>}
      </div>
      {/* 2-col on mobile, 4-col on desktop */}
      <div className="r-stage-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {STEPS.map((st, i) => {
          const sv           = job[st.field];
          const completedLog = job.logs?.find(l => l.department === st.dept && l.exited_at);
          const activeLog    = job.logs?.find(l => l.department === st.dept && !l.exited_at);
          const reason       = activeLog?.delay_reason || completedLog?.delay_reason;
          const isDelayed    = activeLog?.is_delayed || completedLog?.is_delayed;
          const log = activeLog || completedLog;
          let bg, textClr, icon, statusLabel,fontSize;
          if      (sv === "COMPLETED")   { bg = st.color + "30"; textClr ="var(--text-pri)"; statusLabel = "Done";}
          else if (sv === "IN_PROGRESS") { bg = "var(--process)";       textClr = "var(--amber)";  fontSize = "10px";   statusLabel = "IN PROGRESS. . ."; }
          else if (sv === "SKIPPED")     { bg = "transparent";   textClr = "var(--text-pri)"; fontSize = "10px"; statusLabel = "Skipped"; }
          else                           { bg = "transparent";   textClr = "var(--text-pri)";fontSize = "10px";  statusLabel = "Pending"; }
          return (
            <div key={st.label} style={{
              fontWeight: 700,
              letterSpacing: ".04em",
              padding: "10px 12px", background: bg,
              borderRight: i < 3 ? "1px solid var(--text-pri)" : "none",
              display: "flex", flexDirection: "column", gap: 4,
              borderTop: sv === "IN_PROGRESS" ? `2px solid ${st.color}` : "2px solid transparent",
              
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span style={{ fontSize: 14, fontWeight: 800, color:"var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em" }}>{icon} {st.label}</span>
                {sv === "COMPLETED" && (
                  <span style={{  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-pri)", fontWeight: 900 }}>DONE <span><ArrowRight size={14}/></span></span>
                )}
              </div>
              <span style={{ fontSize: 11, color: textClr, opacity: 0.75 }}>{statusLabel}</span>
              
              {sv === "IN_PROGRESS" && <span style={{ fontSize: 11, color: "var(--text-pri)", fontWeight: 600 }}>RUNNING..</span>}
              {reason && (
                  <div style={{ fontSize: 11, color: isDelayed ? "var(--text-pri)" : "var(--text-dim)", background: isDelayed ? "rgba(255,100,0,.08)" : "rgba(255,255,255,.03)", borderRadius: 3, padding: "3px 6px", lineHeight: 1.4, borderLeft: `2px solid ${isDelayed ? "#ff6030" : "var(--border)"}` }}>
                    {reason}
                  </div>
                )}
               <OperatorTag log={activeLog || completedLog} dept={st.dept} />

{log && (log.entered_at || log.exited_at || log.duration_minutes) && (
  <div style={{
    marginTop: 6,
    background: "var(--bg0)",
    border: "1px #ffffff solid",
    borderRadius: 6,
    overflow: "hidden",
  }}>
    <div style={{
      padding: "4px 8px",
      background: "rgba(255,255,255,.04)",
      borderBottom: "1px solid var(--border)",
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: ".11em",
      textTransform: "uppercase",
      color: "var(--red)",
    }}>
      Time Log
    </div>

    <div style={{ padding: "6px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      {log.entered_at && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-sec)" }}>
            Start
          </span>
          <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-pri)" }}>
            {parseUTC(log.entered_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {log.exited_at && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "var(--text-sec)" }}>
            End
          </span>
          <span style={{  fontSize: 11, fontWeight: 700, color: "var(--text-pri)" }}>
            {parseUTC(log.exited_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
      )}

      {log.duration_minutes && (
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginTop: 2, paddingTop: 4, borderTop: "1px dashed var(--border)",
        }}>
          <span style={{ fontSize: 11, color: "var(--green)", fontWeight: 700 }}>Duration</span>
          <span style={{
             fontSize: 11, fontWeight: 800,
            color: log.is_delayed ? "var(--red)" : "var(--green)",letterSpacing: ".04em", textTransform: "uppercase",
          }}>
            {log.duration_minutes} min
          </span>
        </div>
      )}
    </div>
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
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
  
        {/* Section title */}
        <div
          style={{
            fontSize: 11,
            color: "var(--text-pri)",
            textTransform: "uppercase",
            letterSpacing: ".16em",
            fontWeight: 700,
            paddingLeft: 2,
          }}
        >
          Delay Log
        </div>

        {delayed.map((l) => (
          <div
            key={l.id}
            style={{
              background: "linear-gradient(180deg, #353538 0%, var(--surface-sunken) 100%)",
              borderRadius: 10,
              padding: "12px 12px",
              border: "1px solid #ffffff",
              boxShadow: "0 1px 2px rgba(0,0,0,0.35)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >

            {/* TOP ROW */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

              <span
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: deptColor[l.department] || "#EF4444",
                }}
              >
                {deptLabel[l.department] || l.department}
              </span>

          

              {l.duration_minutes && (
                <span
                  style={{
                    marginLeft: "auto",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 11,
                    color: "var(--text-dim)",
                    fontWeight: 500,
                    background: "var(--surface-sunken)",
                    padding: "3px 8px",
                    borderRadius: 999,
                    border: "1px solid var(--border-strong)",
                  }}
                >
                  <Timer size={12} />
                  {l.duration_minutes}m
                </span>
              )}
            </div>

            {/* REASON */}
            <div
              style={{
                fontSize: 13,
                fontWeight: 500,
              
              }}
            >
              <span style={{ color: "var(--text-pri)" ,display: "inline-flex", alignItems: "center", gap: 4,textTransform: "uppercase" }}>
                {l.delay_reason}

                  {l.delay_reason_at && (
                <span
                  style={{
                    fontSize: 9,
                    color: "var(--text-pri)",
                    marginTop:"5px",  
                    fontWeight: 600,
                  }}
                >
                  {parseUTC(l.delay_reason_at).toLocaleTimeString("en-GB", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              )}
                </span>
            </div>

            {/* BOTTOM META */}
            {l.operator_name && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  flexWrap: "wrap",
                  marginTop: 2,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    padding: "4px 10px",
                    borderRadius: 999,
                    background: "var(--surface-sunken)",
                    border: "1px solid var(--border-strong)",
                    color: "var(--text-sec)",
                  }}
                >
                  👤 {l.operator_name}
                </span>

                {l.under_whom && l.department === "PRINTING" && (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 500,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "var(--surface-sunken)",
                      border: "1px solid var(--border-strong)",
                      color: "var(--text-sec)",
                    }}
                  >
                    <span style={{color:"var(--red)"}}>SUPERVISED</span> {l.under_whom}
                  </span>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
  );
}

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
          {job.priority === "URGENT" && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--red)", color: "#000", fontWeight: 800 }}>URGENT</span>}
          <AlbumTypeBadge type={job.album_type} />
          {delayed && <span className="blink" style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--danger-bg)", color: "var(--red)", fontWeight: 800, border: "1px solid var(--red)" }}>LATE</span>}
        </div>
        <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
          <div style={{ fontSize: 13, fontFamily: "var(--fm)", fontWeight: 700, color: days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--text-sec)" }}>
            {new Date(job.dele_date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
          </div>
          <div style={{ fontSize: 11, color: days < 2 ? "var(--red)" : "var(--text-dim)" }}>
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
        {job.payment_by && <Chip label="Payment" value={job.payment_by} accent="#16a34a" />}
        {job.box_pouch_status && (
          <Chip label="Box/Pouch" value={job.box_pouch_status === "COMPLETE" ? "Complete" : "Processing"} accent={job.box_pouch_status === "COMPLETE" ? "#22c55e" : "#f59e0b"} />
        )}
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
  const load = () => api.jobs().then(setIfChanged(setJobs)).catch(() => {});
  load();
  const t = setInterval(load, POLL_INTERVAL_MS);
  return () => clearInterval(t);
}, []);
  const active = jobs.filter(j => !j.is_fully_completed);
  return (
    <div style={{ marginTop: 28 }}>
      <button onClick={() => setOpen(p => !p)} style={{ background: "var(--bg0)", color: "var(--text-pri)", border: "1px solid var(--amber)", borderRadius: 8, padding: "7px 14px", fontSize: 14, fontWeight: 700, display: "flex", alignItems: "center", gap: 8, marginBottom: 8 ,letterSpacing: ".04em"}}>
        <span className="blink" style={{ color: "var(--green)", fontSize: 11 }}>●</span>
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
function JobCardFull({ job, actionLabel, onAction, acting, actionBlocked = false, showExpiry = false, onAddReason, reasonDept, addToast = () => {} }) {
  const isMobile = useIsMobile();
  const delayed = job.logs?.some(l => l.is_delayed && !l.exited_at);
  const days    = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);
  return (
    <div 
    className={delayed ? "delayed-card" : ""}
    style={{
      background: "var(--card-bg)",
      border: `4px solid ${delayed ? "var(--red)" : job.priority === "URGENT" ? "var(--red)" : "none"}`,
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
              <AlbumTypeBadge type={job.album_type} /> 
              {delayed && (
                <span className="blink" style={{ fontSize: 11, padding: "3px 9px", borderRadius: 4, background: "var(--danger-bg)", color: "var(--red)", fontWeight: 800, border: "1px solid var(--red)" }}>⏱ DELAYED</span>
              )}
              {showExpiry && job.completed_at && <ExpiryBadge completedAt={job.completed_at} />}
            </div>
            <div style={{ fontSize: isMobile ? 17 : 16, fontWeight: 700, color: "var(--text-pri)", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis" }}>{job.customer}</div>
            {job.couple_name && <div style={{ fontSize: 13, color: "var(--text-sec)", marginTop: 2 }}>{job.couple_name}</div>}
            {job.order_no    && <div style={{ fontSize: 11, color: "var(--text-pri)", marginTop: 2 }}>Order: {job.order_no}</div>}
          </div>
          {/* Delivery date box */}
          <div className="r-job-date-box" style={{
            textAlign: "center", flexShrink: 0,
            background: days < 2 ? "var(--danger-bg)" : days < 5 ? "#1a1200" : "var(--bg3)",
            border: `1px solid ${days < 2 ? "var(--red)" : days < 5 ? "var(--amber)" : "var(--border)"}`,
            borderRadius: 8, padding: "10px 14px", minWidth: 80,
          }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 4 }}>Delivery</div>
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
        <PaymentField job={job} addToast={addToast} />
        <BoxPouchField job={job} addToast={addToast} />
        <SpecialNote note={job.special_note} />
        <StageRow job={job} />
        <DelayReasonsList logs={job.logs} />
 
          {actionLabel && onAction && (() => {
            const isDone    = actionLabel.toLowerCase().includes("done") ||
                              actionLabel.toLowerCase().includes("complete") ||
                              actionLabel.toLowerCase().includes("bound");
            // blocked = delay reason missing, shown in red-orange
            const bg        = acting        ? "var(--bg3)"
                            : actionBlocked ? "#e58787"
                            : isDone        ? "#16a34a"
                            :                 "var(--amber)";
            const clr       = acting        ? "var(--text-dim)"
                            : actionBlocked ? "var(--text-pri)"
                            :                 "#000";
            const border    = actionBlocked ? "1px solid #a3a3a3" : "none";
            const shadow    = actionBlocked ? "0 2px 12px rgba(229,62,62,.25)"
                            : isDone        ? "0 2px 12px rgba(22,163,74,.35)"
                            :                 "0 2px 12px rgba(245,166,35,.22)";
            return (
              <button onClick={() => onAction(job)} disabled={acting} style={{
                padding: "13px 20px", background: bg, color: clr,
                border, borderRadius: 8, fontSize: 16, fontWeight: 800,
                letterSpacing: ".08em", boxShadow: shadow, width: "100%",
              }}>
                {acting ? "Working..." : actionLabel}
              </button>
            );
          })()}
 
        {onAddReason && (() => {
          const thisLog = job.logs?.find(l => l.department === reasonDept && !l.exited_at && l.is_delayed);
          if (!thisLog) return null;
          return (
            <button onClick={() => onAddReason(job)} style={{
              padding: "9px 16px", borderRadius: 6, fontSize: 13, fontWeight: 900,
              background: thisLog.delay_reason? "var(--surface-sunken)" : "#035702", 
              color: "var(--text-pri)",
              border: "1px solid #00ff3c", letterSpacing: ".05em",
            }}>
              {thisLog.delay_reason ? "EDIT DELAY REASON" : "ADD DELAY REASON"}
            </button>
          );
        })()}
      </div>
    </div>
  );
}

// ── Shared field sections (used in both create & edit forms) ────────
function JobFields({ job }) {
  const [laserEnabled, setLaserEnabled] = useState(
  !!job?.laser_cover_type
);

  return (
    <>
      <div className="r-grid-entry">
        {/* ───────────────── PRINTING ───────────────── */}
        <Sec title="1 – Printing" accent="var(--blue)">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            <div>
              <label>Print Size</label>
              <input
                name="print_size"
                placeholder="12×30"
                defaultValue={job?.print_size || ""}
              />
            </div>

            <div>
              <label>Number of Pages</label>
              <input
                name="print_pages"
                placeholder="40"
                defaultValue={job?.print_pages || ""}
              />
            </div>
          </div>
        </Sec>

        {/* ───────────────── LASER CUTTING ───────────────── */}
        <Sec title="2 – Laser Cutting" accent="var(--purple)">
          <div style={{ marginBottom: 12 }}>
            <label>Laser Cutting Required?</label>

            <select
              value={laserEnabled ? "YES" : "NO"}
                onChange={(e) => {
                  const enabled = e.target.value === "YES";
                  setLaserEnabled(enabled);

                  if (!enabled) {
                    const input = document.querySelector(
                      'input[name="laser_cover_type"]'
                    );
                    if (input) input.value = "";
                  }
                }}
              >
                <option value="NO">No</option>
                <option value="YES">Yes</option>
            </select>
          </div>

          <div
            style={{
                  display: laserEnabled ? "block" : "none",
                }}
              >
                <div>
                  <label>Cover Type / Description</label>
                  <input
                    name="laser_cover_type"
                    placeholder="Wood / Acrylic"
                    defaultValue={job?.laser_cover_type || ""}
                  />
                </div>

                <div
                  style={{
                    fontSize: 11,
                    color: "var(--text-dim)",
                    marginTop: 7,
                  }}
                >
                  ℹ Filling this activates the Laser track.
                </div>
          </div>
        </Sec>

        {/* ───────────────── LAMINATING ───────────────── */}
        <Sec title="3 – Laminating" accent="var(--cyan)">
          <div>
            <label>Laminate Type</label>
            <input
              name="laminate_type"
              placeholder="Silky / Gloss / Matt"
              defaultValue={job?.laminate_type || ""}
            />
          </div>
        </Sec>

        {/* ───────────────── BINDING ───────────────── */}
        <Sec title="4 – Binding" accent="var(--green)">
          <div>
            <label>Rexing No / Type</label>
            <input
              name="bind_rexing_no"
              placeholder="SF10"
              defaultValue={job?.bind_rexing_no || ""}
            />
          </div>
        </Sec>

        {/* ───────────────── BOX ───────────────── */}
        <Sec title="5 – Box" accent="#f59e0b">
          <div>
            <label>Box Type</label>
            <input
              name="box_type"
              placeholder="SF10 - 12x24"
              defaultValue={job?.box_type || ""}
            />
          </div>
        </Sec>

        {/* ───────────────── DELIVERY ───────────────── */}
        <Sec title="Delivery Type" accent="#ff009d">
          <div>
            <label>Delivery Type</label>

            <select
              name="delivery_type"
              defaultValue={job?.delivery_type || "PRONTO"}
            >
              <option value="PRONTO">PRONTO</option>
              <option value="CUSTOMER">CUSTOMER</option>
              <option value="PICKME">PICKME</option>
              <option value="BUS">BUS</option>
            </select>
          </div>
        </Sec>
      </div>

      <Sec title="Special Instructions">
        <div>
          <label>Notes for all departments</label>

          <textarea
            name="special_note"
            placeholder="Any special instructions…"
            defaultValue={job?.special_note || ""}
          />
        </div>
      </Sec>
    </>
  );
}
function AlbumTypeModal({ job, onConfirm }) {
  const [choice, setChoice] = useState("NORMAL");
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile(); 
  async function confirm() {
    setSaving(true);
    try { await onConfirm(choice); } finally { setSaving(false); }
  }
  return (
     <div style={{
      position: "fixed", inset: 0, background: "var(--overlay)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center",
      justifyContent: "center", zIndex: 9300,
      }}>
      <div style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: isMobile ? "16px 16px 0 0" : 12,
        padding: 28, width: "100%", maxWidth: 420,
        maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>One last thing</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>{job.job_no}</div>
          <div style={{ fontSize: 14, color: "var(--text-sec)" }}>{job.customer}</div>
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-pri)" }}>What type of album is this?</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {ALBUM_TYPES.map(opt => (
            <label key={opt.value} style={{
              display: "flex", alignItems: "center", gap: 10, padding: "12px 14px",
              background: choice === opt.value ? "var(--bg3)" : "transparent",
              border: `1px solid ${choice === opt.value ? "var(--amber)" : "var(--border)"}`,
              borderRadius: 8, cursor: "pointer",
            }}>
              <input type="radio" name="album_type" value={opt.value}
                checked={choice === opt.value}
                onChange={() => setChoice(opt.value)}
                style={{ width: 16, height: 16, margin: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-pri)" }}>
                {opt.value === "STORY" ? " " : opt.value === "REBIND" ? " " : ""}{opt.label}
              </span>
            </label>
          ))}
        </div>
        <button onClick={confirm} disabled={saving} style={{ padding: "13px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>
          {saving ? "Saving…" : "✓ Confirm"}
        </button>
      </div>
    </div>
  );
}

// ── Entry page ────────────────────────────────────────────────────────────────
function EntryPage() {
  const { toasts, add } = useToast();
  const [busy,       setBusy]       = useState(false);
  const [jobs,       setJobs]       = useState([]);
  const [editJob,    setEditJob]    = useState(null);
  const [deleteJob,  setDeleteJob]  = useState(null);
  const [printJob,   setPrintJob]   = useState(null);
  const [albumTypeJob, setAlbumTypeJob] = useState(null);
  const [paymentJob, setPaymentJob] = useState(null);
  const [todayCount, setTodayCount] = useState(null);
  const [paymentBy, setPaymentBy]           = useState("");
  const [knownPayments, setKnownPayments]   = useState([]);
  const [showNewPayment, setShowNewPayment] = useState(false);
  const [search, setSearch] = useState("");
  const [now,        setNow]        = useState(Date.now());
  const formRef = useRef(null);
  const editRef = useRef(null);
  const isMobile = useIsMobile();
  const LOCK_MS = 240_000;
 
  // ── UTC-safe helper — SQLite omits "Z", JS then parses as LOCAL time ────────
  function parseCreated(job) {
    const s = job.created_at;
    return new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  }
 
  const reload = useCallback(async () => {
  try {
    const jobList = await api.jobs(false);
    setIfChanged(setJobs)(jobList);
  } catch {}
  try {
    const ds = await api.deptStats();
    setTodayCount(prev => {
      const next = ds?.daily?.ENTRY ?? 0;
      return prev === next ? prev : next;
    });
  } catch {}
  try {
    const pn = await api.knownPaymentNames();
    setIfChanged(setKnownPayments)(pn?.names || []);
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
      const created = await api.createJob({    // ← capture the result
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
        payment_by:       paymentBy.trim()           || "",
      });
      add(`✓ Job #${job_no} created.`, "success");
      formRef.current?.reset();
      setPaymentBy("");
      setShowNewPayment(false);
      reload();
      setAlbumTypeJob(created);   // ← ADD: triggers the modal
    } catch (err) { add(err.message, "error"); }
    finally { setBusy(false); }
  }

  async function handleAlbumTypeConfirm(type) {
    try {
      await api.setAlbumType(albumTypeJob.id, type);
      add(`✓ Marked as ${ALBUM_TYPES.find(a => a.value === type)?.label}`, "success");
    } catch (err) { add(err.message, "error"); }
    finally { setAlbumTypeJob(null); reload(); }
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
            background: "var(--success-bg)", border: "1px solid var(--success-border)",
            borderRadius: 8, padding: isMobile ? "2px 8px 2px 6px" : "2px 10px 2px 8px",
          }}>
            <span style={{
              fontFamily: "var(--fd)", fontSize: isMobile ? 28 : 38,
              fontWeight: 900, lineHeight: 1,
              color: todayCount > 0 ? "var(--green)" : "var(--text-dim)",
              minWidth: "1.6em", display: "inline-block", textAlign: "right", 
            }}>{todayCount ?? "—"}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 9 : 11, fontWeight: 800, color: "var(--green)", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>ISSUED</span>
              <span style={{ fontSize: isMobile ? 7 : 9, fontWeight: 600, color: "var(--success-text)", textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1 }}>TODAY</span>
            </div>
          </div>
        </div>
      }>
      <DeptCompletedDropdown deptKey="ENTRY" title="Dispatched Today" accent="var(--amber)" mrb="10px" addToast={add} showBreakdown={true} />
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

          <Sec title="Payment (Optional)" accent="#16a34a">
            <div>
              <label>Payment Taken By <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(leave blank if not paid yet)</span></label>
              {knownPayments.length > 0 && !showNewPayment ? (
                <select
                  value={paymentBy}
                  onChange={e => {
                    if (e.target.value === "__new__") { setShowNewPayment(true); setPaymentBy(""); }
                    else setPaymentBy(e.target.value);
                  }}
                  style={{ margin: 0 }}
                >
                  <option value="">-- Not taken yet --</option>
                  {knownPayments.map(n => <option key={n} value={n}>{n}</option>)}
                  <option value="__new__">+ Type a new name</option>
                </select>
              ) : (
                <div style={{ display: "flex", gap: 6 }}>
                  <input
                    value={paymentBy}
                    onChange={e => setPaymentBy(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))}
                    placeholder="Leave blank if not paid yet"
                  />
                  {knownPayments.length > 0 && (
                    <button type="button" onClick={() => { setShowNewPayment(false); setPaymentBy(""); }}
                      style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>
                      ← Back
                    </button>
                  )}
                </div>
              )}
            </div>
          </Sec>

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
            RECENT JOB CARDS - EDIT / DELETE
          </div>

          <SearchBar value={search} onChange={setSearch} placeholder="Search recent job cards…" />
 
          {editableJobs.filter(j => matchesSearch(j, search)).length === 0 ? (
            <div style={{
              textAlign: "center", padding: "32px 0",
              color: "var(--text-dim)", fontFamily: "var(--fd)", letterSpacing: ".06em",
            }}>
              {search ? "NO MATCHING JOBS" : "NO EDITABLE JOBS"}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {editableJobs.filter(j => matchesSearch(j, search)).map(job => {
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
                          <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 3, background: "var(--red)", color: "#000", fontWeight: 800 }}><Flame  size ={18} color={"#ffa600"}/> URGENT</span>
                        )}
                       <span style={{ fontSize: 13, color: "var(--text-pri)", fontWeight: 600 }}>{job.customer}</span>
                        {job.couple_name && (
                          <span style={{ fontSize: 11, color: "var(--text-sec)" }}>{job.couple_name}</span>
                        )}
                        {job.payment_by && (
                          <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "#062", color:"var(--text-pri)", fontWeight: 700 }}>💰 {job.payment_by}</span>
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
                        background: secs <= 15 ? "var(--danger-bg)" : "#1a1200",
                        color: secs <= 15 ? "var(--red)" : "var(--amber)",
                        border: `1px solid ${secs <= 15 ? "var(--red)" : "var(--warn-border)"}`,
                        animation: secs <= 15 ? "blink 1s step-start infinite" : "none",
                      }}>{secs}s</div>
 
                      {/* Edit */}
                      <button onClick={() => setEditJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "var(--bg3)", color: "var(--amber)", border: "1px solid var(--amber)",
                      }}><Pen size={14} /></button>
 
                      {/* Print ← NEW */}
                      {/* Print ← NEW */}
                      <button onClick={() => setPrintJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "var(--bg3)", color: "var(--cyan)", border: "1px solid var(--cyan)",
                      }}><Printer size={14} /></button>

                      <button onClick={() => setPaymentJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: job.payment_by ? "var(--bg3)" : "#035702",
                        color: job.payment_by ? "#16a34a" : "#fff",
                        border: `1px solid ${job.payment_by ? "#16a34a" : "#00ff3c"}`,
                      }}>💰</button>
 
 
                      {/* Delete */}
                      <button onClick={() => setDeleteJob(job)} style={{
                        padding: "7px 14px", fontSize: 12, fontWeight: 700, borderRadius: 5,
                        background: "var(--danger-bg)", color: "var(--red)", border: "1px solid var(--red)",
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
          position: "fixed", inset: 0, background: "var(--overlay)",
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
                      background: secs <= 15 ? "var(--danger-bg)" : "#1a1200",
                      color: secs <= 15 ? "var(--red)" : "var(--amber)",
                      border: `1px solid ${secs <= 15 ? "var(--red)" : "var(--warn-border)"}`,
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
                <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>Job No (cannot change)</div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-pri)", fontFamily: "var(--fm)" }}>{editJob.job_no}</div>
              </div>
              <div style={{ background: "var(--bg3)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px" }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 3 }}>Photographer / Studio (cannot change)</div>
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
          position: "fixed", inset: 0, background: "var(--overlay)",
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
                      background: secs <= 15 ? "var(--danger-bg)" : "#1a1200",
                      color: secs <= 15 ? "var(--red)" : "var(--amber)",
                      border: `1px solid ${secs <= 15 ? "var(--red)" : "var(--warn-border)"}`,
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
                flex: 1, padding: "12px 0", background: "var(--red)", color:"var(--text-pri)",
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
      
      {albumTypeJob && (
        <AlbumTypeModal job={albumTypeJob} onConfirm={handleAlbumTypeConfirm} />
      )}

      {/* ── Payment modal ← NEW ── */}
      {paymentJob && (
        <PaymentEditModal
          job={paymentJob}
          onClose={() => setPaymentJob(null)}
          onSaved={() => { setPaymentJob(null); reload(); }}
          addToast={add}
        />
      )}
      <ToastStack toasts={toasts} />
    </>
  );
}

// ── Station config ────────────────────────────────────────────────────────────
const STATION_CFG = {
  printing: {
    label: "PRINTING", dept: "PRINTING", accent: "var(--blue)",
    getAction(job) {
      if (job.status_printing === "PENDING")     return { action: "start",    label: " START PRINTING" };
      if (job.status_printing === "IN_PROGRESS") return { action: "complete", label: " MARK PRINTED - DONE" };
      return null;
    },
  },
  laminating: {
    label: "LAMINATING", dept: "LAMINATING", accent: "var(--cyan)",
    getAction(job) {
      if (job.status_laminating === "PENDING")     return { action: "start",    label: " START LAMINATING" };
      if (job.status_laminating === "IN_PROGRESS") return { action: "complete", label: " MARK LAMINATED - DONE" };
      return null;
    },
  },
  laser_cutting: {
    label: "LASER CUTTING", dept: "LASER_CUTTING", accent: "var(--purple)",
    getAction(job) {
      if (job.status_laser_cutting === "SKIPPED")     return null;
      if (job.status_laser_cutting === "PENDING")     return { action: "start",    label: " START LASER CUT" };
      if (job.status_laser_cutting === "IN_PROGRESS") return { action: "complete", label: " MARK CUT DONE" };
      return null;
    },
  },
  binding: {
    label: "BINDING", dept: "BINDING", accent: "var(--green)",
    getAction(job) {
      if (!job.binding_unlocked)                return null;
      if (job.status_binding === "PENDING")     return { action: "start",    label: "START BINDING" };
      if (job.status_binding === "IN_PROGRESS") return { action: "complete", label: "MARK BOUND - JOB COMPLETE" };
      return null;
    },
  },
};

// ── Station page ──────────────────────────────────────────────────────────────
// ── Station page ──────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════════════════════
// NEW PRODUCTION DASHBOARD FEATURES
// Drop these four components into your App.jsx (anywhere before DashboardPage),
// then replace your DashboardPage with the one at the bottom of this file.
// ═══════════════════════════════════════════════════════════════════════════════

// ── 1. BOTTLENECK RADAR ───────────────────────────────────────────────────────
// Shows per-department delayed + active counts. Worst offender floats to top.
// Uses only the `active` jobs array already fetched by DashboardPage.

// ── Single source of truth for department colors ─────────────────────────────
const DEPTS = [
  { key: "PRINTING",      label: "PRINT",    dashLabel: "Printing",    field: "status_printing",      accentVar: "var(--blue)"   },
  { key: "LASER_CUTTING", label: "LASER",    dashLabel: "Laser Cut",   field: "status_laser_cutting", accentVar: "var(--purple)" },
  { key: "LAMINATING",    label: "LAMINATING",dashLabel: "Laminating", field: "status_laminating",    accentVar: "var(--cyan)"   },
  { key: "BINDING",       label: "BIND",     dashLabel: "Binding",     field: "status_binding",       accentVar: "var(--green)"  },
];

const STEPS     = DEPTS.map(d => ({ label: d.label, field: d.field, color: d.accentVar, dept: d.key }));
const DEPT_META = DEPTS.map(d => ({ key: d.key, label: d.dashLabel, accent: d.accentVar, field: d.field }));

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
      background: "var(--card-bg)",
      border: `1px solid ${hasBottleneck && worstDept.delayed > 0 ? "var(--red)" : "var(--border)"}`,
      borderRadius: 10, padding: "14px 16px", boxShadow: "0 8px 30px rgba(0,0,0,0.20)"
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-pri)", textShadow: 'var(--title-shadow)' }}>Bottleneck Radar</span>
        </div>
        {hasBottleneck && worstDept.delayed > 0 ? (
          <span className="blink" style={{ fontSize: 9,display:"flex", fontWeight: 600, gap:"2px",padding: "2px 7px", borderRadius: 4, background: "#ff0000", color: "var(--text-pri)", border: "1px solid #ffffff",letterSpacing:"0.08em" }}>
             <TriangleAlert size={12}/>{worstDept.label.toUpperCase()}
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
            background: "var(--surface-sunken)",
            border: `1px solid ${dept.delayed > 0 ? "var(--red)" : "#787777"}`,
            boxShadow: '3px 4px 5px #181717',
            borderLeft: `3px solid ${dept.delayed > 0 ? "var(--red)" : dept.accent}`,
            borderRadius: 5, padding: "8px 10px",
            opacity: dept.total === 0 && dept.delayed === 0 ? 0.4 : 1,
          }}>
            {/* TOP ROW: label + counts, never wrap */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 6, flexWrap: isMobile ? "wrap" : "nowrap", minWidth: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: dept.accent, textTransform: "uppercase", letterSpacing: ".07em", whiteSpace: "nowrap", flexShrink: 0 }}>
                {dept.label}
              </span>
              <div style={{ display: "flex", gap: 4, flexShrink: 0, flexWrap: "nowrap", alignItems: "center" }}>
                {dept.inProgress > 0 && (
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#d7a40b", color: "var(--surface-sunken)", border: "1px solid #ffffff", whiteSpace: "nowrap" }}>RUNNING : {dept.inProgress}</span>
                )}
                {dept.pending > 0 && (
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "var(--bg3)", color: "var(--text-pri)",border: "1px solid #ffffff", whiteSpace: "nowrap" }}>PENDING : {dept.pending}</span>
                )}
                {dept.delayed > 0 && (
                  <span style={{ fontSize: isMobile ? 10 : 11, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: "#a12d2d", color: "var(--surface-sunken)", border: "1px solid #ffffff", whiteSpace: "nowrap" }}>DELAYED : {dept.delayed}</span>
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
        background: "var(--card-bg)",
        // border: `1px solid ${ringColor}55`,
        borderRadius: 10,
        padding: "14px 16px",
        border: "1px solid var(--border)", 
        boxShadow: "0 8px 30px rgba(0,0,0,0.20)"


        
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
            textShadow: "var(--title-shadow)",
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
                textShadow: "var(--title-shadow)",
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
                background:"var(--bg2)",
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
            ? "#72520d"
            : "var(--danger-bg)",
      
        color: ringColor,
        border: `1px solid ${ringColor}55`,
        textTransform: "uppercase",
        letterSpacing: ".05em",

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
              : "Pay Attention!"}
          </div>
        </div>
      </div>
    </div>
  );
}

function AlbumCountPanel() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
  const load = () =>
    apiFetch(`/api/stats/albums?year=${year}&month=${month}`)
      .then(setIfChanged(setData)).catch(() => {});
  load();
  const t = setInterval(load, 10_000);
  return () => clearInterval(t);
}, [year, month]);

  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "14px 16px",
      gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14, flexWrap: "wrap", gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000,
          letterSpacing: ".1em", textTransform: "uppercase",
          color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Albums Produced
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={month}
            onChange={e => setMonth(+e.target.value)}
            style={{ width: "auto", margin: 0, fontSize: 12, padding: "5px 8px" }}>
            {Array.from({ length: 12 }, (_, i) =>
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleDateString("en-GB", { month: "short" })}
              </option>
            )}
          </select>
          <select
            value={year}
            onChange={e => setYear(+e.target.value)}
            style={{ width: "auto", margin: 0, fontSize: 12, padding: "5px 8px" }}>
            {[now.getFullYear(), now.getFullYear() - 1].map(y =>
              <option key={y} value={y}>{y}</option>
            )}
          </select>
        </div>
      </div>

      {/* Count display */}
      {data ? (
        <div style={{
          background:"var(--bg2)",
          border: "1px solid var(--green)33",
          borderTop: "3px solid var(--green)",
          borderRadius: 8,
          padding: isMobile ? "20px 16px" : "24px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
        }}>
          {/* Left side */}
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{
              width: isMobile ? 48 : 56, height: isMobile ? 48 : 56,
              borderRadius: 10,
              background: "var(--green)" + "22",
              border: "1px solid var(--green)" + "44",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}>
              <BookOpen size={isMobile ? 22 : 26} color="var(--green)" />
            </div>
            <div>
              <div style={{
                fontSize: isMobile ? 13 : 14,
                fontWeight: 700,
                color: "var(--text-pri)",
              }}>
                Total Albums Completed
              </div>
              <div style={{
                fontSize: 12,
                color: "var(--text-pri)",
                marginTop: 3,
              }}>
                {monthLabel}
              </div>
            </div>
          </div>

          {/* Right side — big number */}
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "flex-end",
          }}>
            <span style={{
              fontFamily: "var(--fd)",
              fontSize: isMobile ? 35 : 30,
              fontWeight: 900,
              lineHeight: 1,
              color: data.total > 0 ? "var(--green)" : "var(--text-dim)",
              textShadow: "var(--title-shadow)",
            }}>
              {data.total}
            </span>
            <span style={{
              fontSize: 11,
              color: "var(--text-pri)",
              textTransform: "uppercase",
              letterSpacing: ".1em",
              marginTop: 2,
            }}>
              {data.total === 1 ? "album" : "albums"}
            </span>
          </div>
        </div>
      ) : (
        <div style={{
          textAlign: "center", padding: "24px 0",
          color: "var(--text-dim)", fontFamily: "var(--fd)",
          fontSize: 13, letterSpacing: ".08em",
        }}>
          LOADING…
        </div>
      )}
    </div>
  );
}

function OperatorStatsPanel() {
  const now = new Date();
  const [year,  setYear]  = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data,  setData]  = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
  const load = () =>
    apiFetch(`/api/stats/operators?year=${year}&month=${month}`)
      .then(setIfChanged(setData)).catch(() => {});
  load();
  const t = setInterval(load, 10_000);
  return () => clearInterval(t);
}, [year, month]);

  const monthLabel = new Date(year, month - 1, 1)
    .toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  function Section({ icon, label, accent, rows }) {
    return (
      <div style={{
        background:"var(--bg2)",
        border: `1px solid ${accent}50`,
        borderTop: `3px solid ${accent}`,
        borderRadius: 8,
        padding: "12px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 0,
      }}>
        {/* Section header */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          marginBottom: 10,
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            {icon}
          </div>
          <div>
            <div style={{
              fontSize: 11, fontWeight: 800, color: accent,
              textTransform: "uppercase", letterSpacing: ".1em", lineHeight: 1,
            }}>{label}</div>
            <div style={{
              fontSize: 12, color: "var(--text-pri)",
              marginTop: 2, letterSpacing: ".04em",
            }}>{monthLabel}</div>
          </div>
          <div style={{ marginLeft: "auto" }}>
            <span style={{
              fontFamily: "var(--fd)", fontSize: 11, fontWeight: 700,
              color: rows.length > 0 ? accent : "var(--text-dim)",
              background: accent + "11",
              border: `1px solid ${accent}33`,
              borderRadius: 4, padding: "2px 8px",
            }}>
              {rows.length} operator{rows.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {/* Rows */}
        {rows.length === 0 ? (
          <div style={{
            textAlign: "center", padding: "16px 0",
            color: "var(--text-dim)", fontSize: 12,
            fontFamily: "var(--fd)", letterSpacing: ".06em",
          }}>
            NO DATA
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.sort((a, b) => b.count - a.count).map((r, i) => {
              const isTop = i === 0 && rows.length > 1;
              return (
                <div key={i} style={{
                  display: "flex", alignItems: "center",
                  justifyContent: "space-between",
                  background: isTop ? accent + "11" : "var(--bg2)",
                  border: `1px solid ${isTop ? accent + "44" : "var(--border)"}`,
                  borderLeft: `3px solid ${isTop ? accent : "var(--border)"}`,
                  borderRadius: 6,
                  padding: "8px 10px",
                  gap: 8,
                }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontSize: isMobile ? 13 : 14,
                      fontWeight: 700,
                      color: "var(--text-pri)",
                      display: "flex", alignItems: "center", gap: 6,
                      flexWrap: "wrap",
                    }}>
                      {r.operator_name}
                      {isTop && (
                        <span style={{
                          fontSize: 9, fontWeight: 800,
                          padding: "1px 6px", borderRadius: 3,
                          background: accent, color: "#000",
                          textTransform: "uppercase", letterSpacing: ".06em",
                        }}>TOP</span>
                      )}
                    </div>
                    {r.under_whom && (
                      <div style={{
                        fontSize: 11, color: "var(--text-dim)",
                        marginTop: 2, display: "flex", alignItems: "center", gap: 4,
                      }}>
                        <span style={{ color: "var(--text-dim)" }}>under</span>
                        <span style={{ color: "var(--text-sec)", fontWeight: 600 }}>
                          {r.under_whom}
                        </span>
                      </div>
                    )}
                  </div>
                  <div style={{
                    flexShrink: 0, textAlign: "right",
                    display: "flex", flexDirection: "column", alignItems: "flex-end",
                  }}>
                    <span style={{
                      fontFamily: "var(--fd)",
                      fontSize: isMobile ? 24 : 28,
                      fontWeight: 900, lineHeight: 1,
                      color: accent,
                      textShadow: "var(--title-shadow)",
                    }}>{r.count}</span>
                    <span style={{
                      fontSize: 12, color: "var(--text-pri)",
                      textTransform: "uppercase", letterSpacing: ".06em",
                    }}>job{r.count !== 1 ? "s" : ""}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      background: "var(--card-bg)",
      border: "1px solid var(--border)",
      borderRadius: 10,
      padding: "14px 16px",
      gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      {/* Panel header */}
      <div style={{
        display: "flex", alignItems: "center",
        justifyContent: "space-between",
        marginBottom: 14, flexWrap: "wrap", gap: 8,
      }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000,
          letterSpacing: ".1em", textTransform: "uppercase",
          color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Operator Activity
        </span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <select
            value={month}
            onChange={e => setMonth(+e.target.value)}
            style={{ width: "auto", margin: 0, fontSize: 12, padding: "5px 8px" }}>
            {Array.from({ length: 12 }, (_, i) =>
              <option key={i + 1} value={i + 1}>
                {new Date(2000, i).toLocaleDateString("en-GB", { month: "short" })}
              </option>
            )}
          </select>
          <select
            value={year}
            onChange={e => setYear(+e.target.value)}
            style={{ width: "auto", margin: 0, fontSize: 12, padding: "5px 8px" }}>
            {[now.getFullYear(), now.getFullYear() - 1].map(y =>
              <option key={y} value={y}>{y}</option>
            )}
          </select>
        </div>
      </div>

      {/* Two columns — stacks to 1 col on mobile */}
      {data && (
        <div style={{
          display: "grid",
          gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
          gap: 12,
        }}>
          <Section
            icon={<Printer size={16} color="#0c64f1" />}
            label="Printing"
            accent="#0c64f1"
            rows={data.PRINTING}
          />
          <Section
            icon={<Scissors size={16} color="#8616f0" />}
            label="Laser Cutting"
            accent="#8616f0"
            rows={data.LASER_CUTTING}
          />
        </div>
      )}

      {!data && (
        <div style={{
          textAlign: "center", padding: "24px 0",
          color: "var(--text-dim)", fontFamily: "var(--fd)",
          fontSize: 13, letterSpacing: ".08em",
        }}>
          LOADING…
        </div>
      )}
    </div>
  );
}


function OperatorIdentityModal({ dept, onConfirm, onCancel }) {
  const [name,       setName]      = useState("");
  const [underWhom,  setUnder]     = useState("");
  const [machine,    setMachine]   = useState("");
  const [knownNames, setKnown]     = useState([]);
  const [showNew,    setShowNew]   = useState(false);
  const isMobile = useIsMobile();
  const isPrinting   = dept === "PRINTING";
  const isLaminating = dept === "LAMINATING";
  const nameLabel = isLaminating ? "Accubind by? *" : "Your name *";

  useEffect(() => {
    apiFetch(`/api/operators/known?dept=${dept}`)
      .then(d => setKnown(d.names || []))
      .catch(() => {});
  }, [dept]);

  function handleName(e) {
    setName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()));
  }
  function handleUnder(e) {
    setUnder(e.target.value.replace(/\b\w/g, c => c.toUpperCase()));
  }

  function submit() {
    const finalName  = name.trim().replace(/\b\w/g, c => c.toUpperCase());
    const finalUnder = underWhom.trim().replace(/\b\w/g, c => c.toUpperCase());
    if (!finalName) return;
    if (isPrinting && !finalUnder) return;
    if (isPrinting && !machine) return;   
    onConfirm({
      operator_name: finalName,
      under_whom: finalUnder || undefined,
      machine: isPrinting ? machine : undefined, 
    });
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)",
      display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9100 }}>
      <div style={{ background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 28, width: "100%", maxWidth: 400,
        maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 16 }}>

        <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>
          Before you start
        </div>

        <div>
          <label>{nameLabel}</label>
          {knownNames.length > 0 && !showNew ? (
            <select
              value={name}
              onChange={e => {
                if (e.target.value === "__new__") { setShowNew(true); setName(""); }
                else setName(e.target.value);
              }}
              style={{ margin: 0 }}
            >
              <option value="">-- Select your name --</option>
              {knownNames.map(n => <option key={n} value={n}>{n}</option>)}
              <option value="__new__">+ Type a new name</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input value={name} onChange={handleName} placeholder="Enter your name" autoFocus style={{ flex: 1 }} />
              {knownNames.length > 0 && (
                <button onClick={() => { setShowNew(false); setName(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>← Back</button>
              )}
            </div>
          )}
        </div>

        {isPrinting && (
          <div>
            <label>Under whom are you printing? *</label>
            <select value={underWhom} onChange={e => setUnder(e.target.value)} style={{ margin: 0 }}>
              <option value="">-- Select supervisor --</option>
              <option value="Jeewan">Jeewan</option>
              <option value="Hirusha">Hirusha</option>
              <option value="Suresh">Suresh</option>
              <option value="sandeepa">Sandeepa</option>
              <option value="Boss">Boss</option>
            </select>
          </div>
        )}

        {/* ── NEW: Machine select ── */}
        {isPrinting && (
          <div>
            <label>Which machine? *</label>
            <select value={machine} onChange={e => setMachine(e.target.value)} style={{ margin: 0 }}>
              <option value="">-- Select machine --</option>
              {MACHINES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </div>
        )}
        

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={submit}
            disabled={!name.trim() || (isPrinting && !underWhom.trim()) || (isPrinting && !machine)}
            style={{ flex: 1, padding: "12px 0", background: "var(--amber)", color: "#000",
              borderRadius: 8, fontWeight: 800, fontSize: 15 }}>
            Confirm &amp; Start
          </button>
          <button onClick={onCancel} style={{ padding: "12px 18px", background: "var(--bg3)",
            color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function BoxPouchModal({ job, onConfirm, onCancel }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9100 }}>
      <div style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 28, width: "100%", maxWidth: 400, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ fontSize: 13, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Before completing</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text-pri)" }}>Is Box or Pouch complete?</div>
        <div style={{ fontSize: 13, color: "var(--text-sec)" }}>{job.job_no} - {job.customer}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button onClick={() => onConfirm("COMPLETE")} style={{ padding: "12px 0", background: "var(--green)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>Yes, Complete</button>
          <button onClick={() => onConfirm("NOT_NEEDED")} style={{ padding: "12px 0", background: "var(--surface-sunken)", color: "var(--text-pri)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>Box/Pouch Not Needed</button>
          <button onClick={() => onConfirm("PROCESSING")} style={{ padding: "12px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 15 }}>Still Processing</button>
        </div>
        <button onClick={onCancel} style={{ padding: "10px 0", background: "var(--red)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
      </div>
    </div>
  );
}

function BoxPouchEditModal({ job, onClose, onSaved, addToast }) {
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  async function set(status) {
    setSaving(true);
    try {
      await api.updateBoxPouch(job.id, status);
      addToast?.(`✓ Box/Pouch updated for #${job.job_no}`, "success");
      onSaved?.(status);
      onClose();
    } catch (err) { addToast?.(err.message, "error"); }
    finally { setSaving(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 400, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", marginBottom: 4 }}>Update Box / Pouch Status</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--amber)" }}>{job.job_no}</div>
          <div style={{ fontSize: 13, color: "var(--text-sec)" }}>{job.customer}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button disabled={saving} onClick={() => set("COMPLETE")} style={{ padding: "11px 0", background: "var(--green)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 14 }}> Complete</button>
          <button disabled={saving} onClick={() => set("NOT_NEEDED")} style={{ padding: "11px 0", background: "var(--surface-sunken)", color: "var(--text-pri)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 800, fontSize: 14 }}> Not Needed</button>
          <button disabled={saving} onClick={() => set("PROCESSING")} style={{ padding: "11px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 14 }}> Still Processing</button>
        </div>
        <button onClick={onClose} style={{ padding: "10px 0", background: "var(--red)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
      </div>
    </div>
  );
}

// ── Daily 5:00 PM Sri Lanka Damage-Reporting Reminder ────────────────
const DAMAGE_ALERT_DEPTS = [
  "PRINTING",
  "LAMINATING",
  "LASER_CUTTING",
  "BINDING",
];

const DAMAGE_ALERT_STORAGE_PREFIX = "ilab-damage-alert-shown:";

function getSriLankaDateTime() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Colombo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date())
    .reduce((obj, part) => {
      if (part.type !== "literal") {
        obj[part.type] = part.value;
      }
      return obj;
    }, {});
}

function DamageTimeAlertModal() {
  const [show, setShow] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!DAMAGE_ALERT_DEPTS.includes(ROLE)) return;

    const storageKey = `${DAMAGE_ALERT_STORAGE_PREFIX}${ROLE}`;

    function checkDamageAlert() {
      const sl = getSriLankaDateTime();

      const todayKey = `${sl.year}-${sl.month}-${sl.day}`;
      const lastShown = localStorage.getItem(storageKey);

      const hour = Number(sl.hour);
      const minute = Number(sl.minute);

      // Sri Lanka time: exactly during 5:00 PM minute
      const isExactly5PM =
        hour === 17 &&
        minute === 0;

      if (isExactly5PM && lastShown !== todayKey) {
        console.log("🚨 5:00 PM DAMAGE ALERT");

        // Save immediately so this browser/device
        // cannot trigger the alert again today.
        localStorage.setItem(storageKey, todayKey);

        setShow(true);
      }
    }

    checkDamageAlert();

    // Check every second so the 5:00 PM minute is not missed.
    const timer = setInterval(checkDamageAlert, 1000);

    return () => clearInterval(timer);
  }, []);

  function dismiss() {
    setShow(false);
  }

  if (!show) return null;

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
        {/* Title */}
        <div
          style={{
            fontSize: 11,
            color: "var(--red)",
            fontWeight: 800,
            textTransform: "uppercase",
            letterSpacing: ".12em",
          }}
        >
          Damage Reporting Time
        </div>

        {/* Sinhala Message */}
        <div
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: "var(--text-pri)",
            lineHeight: 1.6,
          }}
        >
          අද දින සිදුවූ{" "}
          <b style={{ color: "var(--amber)" }}>Damage</b>{" "}
          පිළිබඳ වාර්තා ඉදිරිපත් කිරීම සඳහා නියමිත වේලාව දැන් එළඹ ඇත.
          <br />
          කරුණාකර ඔබ විසින් සිදුවූ සියලුම හානි පිළිබඳව
          <br />
          ඔබගේ කළමනාකාරීවරයා වෙත වාර්තා කරන්න.
        </div>

        {/* English Message */}
        <div
          style={{
            fontSize: 13,
            color: "var(--text-sec)",
            lineHeight: 1.6,
            borderTop: "1px solid var(--border)",
            paddingTop: 12,
          }}
        >
          The designated time for reporting today's damages has now arrived.
          <br />
          Please report all damages that occurred today to your manager.
        </div>

        {/* Contact */}
        <div
          style={{
            background: "var(--bg3)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "12px 16px",
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: "var(--text-dim)",
              textTransform: "uppercase",
              letterSpacing: ".08em",
              marginBottom: 4,
            }}
          >
            Contact
          </div>

          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "var(--amber)",
            }}
          >
            Mr. Suresh - 071 032 1032
          </div>
        </div>

        {/* OK Button */}
        <button
          onClick={dismiss}
          style={{
            padding: "13px 0",
            background: "var(--amber)",
            color: "#000",
            borderRadius: 8,
            fontWeight: 800,
            fontSize: 15,
            marginTop: 4,
          }}
        >
          OK
        </button>
      </div>
    </div>
  );
}

function StationPage({ deptKey }) {
  const cfg = STATION_CFG[deptKey];
  const { toasts, add } = useToast();
  const [queue,              setQueue]              = useState([]);
  const [search, setSearch] = useState("");
  const [deptCompletedCount, setDeptCompletedCount] = useState(null);
  const [actingId,           setActingId]           = useState(null);
  const [reasonJob,          setReasonJob]          = useState(null);
  const [pendingCompleteJob, setPendingCompleteJob] = useState(null);
  const [identityPending, setIdentityPending] = useState(null);
  const [boxPouchPending, setBoxPouchPending] = useState(null);
  const [deptDailyCount, setDeptDailyCount] = useState(null);
  const isMobile = useIsMobile();

  const reload = useCallback(async () => {
  try {
    const [q, ds] = await Promise.all([api.queue(deptKey), api.deptStats()]);
    setIfChanged(setQueue)(q);
    setDeptCompletedCount(prev => {
      const next = ds?.monthly?.[cfg.dept] ?? 0;
      return prev === next ? prev : next;
    });
    setDeptDailyCount(prev => {
      const next = ds?.daily?.[cfg.dept] ?? 0;
      return prev === next ? prev : next;
    });
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

      // ── Intercept START for PRINTING, LASER_CUTTING, and LAMINATING ──
      if (a.action === "start" && (cfg.dept === "PRINTING" || cfg.dept === "LASER_CUTTING" || cfg.dept === "LAMINATING")) {
        setIdentityPending(job);
        return;
      }

      // existing delay-reason guard unchanged
      if (a.action === "complete") {
        const activeLog = job.logs?.find(
          l => l.department === cfg.dept && !l.exited_at && l.is_delayed
        );
        if (activeLog && !activeLog.delay_reason) {
          add("⏱ This job is delayed — please fill in the delay reason before completing.", "error");
          setPendingCompleteJob(job);
          setReasonJob(job);
          return;
        }
      }

      // ── Intercept COMPLETE for BINDING — ask box/pouch status ──
      if (a.action === "complete" && cfg.dept === "BINDING") {
        setBoxPouchPending(job);
        return;
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

    async function handleIdentityConfirm({ operator_name, under_whom, machine }) {
      const job = identityPending;
      setIdentityPending(null);
      const a = cfg.getAction(job);
      setActingId(job.id);
      try {
        await api.advance(job.id, cfg.dept, a.action, { operator_name, under_whom, machine});
        add(`Job #${job.job_no} started at ${cfg.label}.`, "success");
        await reload();
      } catch (err) {
        add(err.message, "error");
      } finally {
        setActingId(null);
  }
}

    async function handleBoxPouchConfirm(status) {
      const job = boxPouchPending;
      setBoxPouchPending(null);
      setActingId(job.id);
      try {
        await api.advance(job.id, cfg.dept, "complete", { box_pouch_status: status });
        add(`Job #${job.job_no} ✓ completed!`, "success");
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
        <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 6 : 8,
            flexWrap: "wrap",
            width: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "flex-end" : "flex-start",
          }}>
          {deptKey === "printing" && (
            <button onClick={() => navigate("/entry")} style={{
              padding: isMobile ? "6px 10px" : "8px 14px",
              background: "var(--amber)", color: "#000",
              border: "none", borderRadius: 6, fontWeight: 800, cursor: "pointer",
              fontSize: isMobile ? 11 : 13,
              display: "flex", alignItems: "center", gap: 5,
              whiteSpace: "nowrap",
            }}>
              <Plus size={14} /> {isMobile ? "Job Card" : "Create Job Card"}
            </button>
          )}
          <DeptCompletedDropdown
            deptKey={cfg.dept}
            title={`Done Today - ${cfg.label}`}
            accent={cfg.accent}
            addToast={add}
            showBreakdown={cfg.dept !== "LASER_CUTTING"}
          />
          {/* Queue count */}
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 4 : 10,
            background:"var(--bg2)", border: "1px solid var(--border)",
            borderRadius: 8, padding: isMobile ? "3px 8px" : "2px 10px 2px 8px",
            minWidth: 0,
          }}>
            <span className="r-station-queue-num" style={{
              fontFamily: "var(--fd)",
              fontSize: isMobile ? 18 : 50,
              fontWeight: 900, lineHeight: 1,
              color: queue.length > 0 ? "var(--green)" : "var(--text-dim)",
              display: "inline-block", textAlign: "right",
            }}>{queue.length}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 8 : 12, fontWeight: 800, color:"var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>{queue.length !== 1 ? "JOBS" : "JOB"}</span>
              <span style={{ fontSize: isMobile ? 7 : 10, fontWeight: 600, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>IN QUEUE</span>
            </div>
          </div>

          {/* Daily Done */}
        <div style={{
          display: "flex", alignItems: "center", gap: isMobile ? 4 : 8,
          background: "#020015", border: "1px solid #1a1c3a",
          borderRadius: 8, padding: isMobile ? "3px 8px" : "2px 10px 2px 8px",
          minWidth: 0,
        }}>
          <span style={{
            fontFamily: "var(--fd)",
            fontSize: isMobile ? 18 : 50,
            fontWeight: 900, lineHeight: 1,
            color: deptDailyCount > 0 ? "#4749c2" : "var(--text-dim)",
          }}>{deptDailyCount ?? "—"}</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: isMobile ? 8 : 12, fontWeight: 800, color: "#ffff", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>Daily</span>
            <span style={{ fontSize: isMobile ? 7 : 10, fontWeight: 600, color: "#4749c2", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>Done</span>
          </div>
        </div>

          {/* Completed count (24h) */}
          <div style={{
            display: "flex", alignItems: "center", gap: isMobile ? 4 : 8,
            background: "#021b09", border: "1px solid #1a3a2e",
            borderRadius: 8, padding: isMobile ? "3px 8px" : "2px 10px 2px 8px",
            minWidth: 0,
          }}>
            <span style={{
              fontFamily: "var(--fd)",
              fontSize: isMobile ? 18 : 50,
              fontWeight: 900, lineHeight: 1,
              color: deptCompletedCount > 0 ? "var(--green)" : "var(--text-dim)",
            }}>{deptCompletedCount ?? "—"}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
              <span style={{ fontSize: isMobile ? 8 : 12, fontWeight: 800, color: "#ffff", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>Monthly</span>
              <span style={{ fontSize: isMobile ? 7 : 10, fontWeight: 600, color: "var(--success-text)", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1, whiteSpace: "nowrap" }}>Done</span>
            </div>
          </div>
        </div>
      }>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
         
          <SearchBar value={search} onChange={setSearch} />

          {queue.filter(j => matchesSearch(j, search)).length === 0
            ? <div style={{ textAlign: "center", padding: isMobile ? "40px 16px" : "60px 20px", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: isMobile ? 15 : 20, letterSpacing: ".06em" }}>
                {search ? "NO MATCHING JOBS" : "✓ QUEUE CLEAR"}
              </div>
            : queue.filter(j => matchesSearch(j, search)).map(job => {
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
                          ? "Fill Delay Reason to Complete"
                          : a?.label
                      }
                      onAction={act}
                      acting={actingId === job.id}
                      actionBlocked={isBlocked}
                      onAddReason={setReasonJob}
                      reasonDept={cfg.dept}
                      addToast={add}
                    />
                  </div>
                );
              })
          }
          <LivePanel />
        </div>
      </Shell>

      {identityPending && (
        <OperatorIdentityModal
          dept={cfg.dept}
          onConfirm={handleIdentityConfirm}
          onCancel={() => setIdentityPending(null)}
        />
      )}

      {boxPouchPending && (
        <BoxPouchModal
          job={boxPouchPending}
          onConfirm={handleBoxPouchConfirm}
          onCancel={() => setBoxPouchPending(null)}
        />
      )}

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
      <DamageTimeAlertModal />
      <ToastStack toasts={toasts} />
    </>
  );
}

// ── Damage tracking ────────────────────────────────────────────────────────────
const DAMAGE_DEPT_LABELS = { PRINTING: "Printing", LAMINATING: "Laminating", BINDING: "Binding" };
const DAMAGE_DEPT_COLORS = { PRINTING: "var(--blue)", LAMINATING: "var(--cyan)", BINDING: "var(--green)" };

function DamageEntryForm({ dept, onCreated, addToast }) {
  const [prices, setPrices] = useState([]);
  const [knownNames, setKnownNames] = useState([]);
  const [priceId, setPriceId] = useState("");
  const [jobNo, setJobNo] = useState("");          
  const [customer, setCustomer] = useState("");
  const [operatorName, setOperatorName] = useState("");
  const [showNewName, setShowNewName] = useState(false);
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.paperPrices().then(setPrices).catch(() => {}); }, []);
  useEffect(() => {
    if (!dept) return;
    api.knownDamageOperators(dept).then(d => setKnownNames(d.names || [])).catch(() => {});
  }, [dept]);

  const selectedPrice = prices.find(p => p.id === Number(priceId));
  const qtyNum = Number(quantity) || 0;
  const previewTotal = selectedPrice ? selectedPrice.unit_price * qtyNum : 0;

  async function submit(e) {
    e.preventDefault();
    if (!priceId || !operatorName.trim() || !reason.trim() || qtyNum <= 0) return;
    setSaving(true);
    try {
      await api.createDamage({
        department: dept,
        paper_price_id: Number(priceId),
        job_no: jobNo.trim(),      
        customer: customer.trim(), 
        operator_name: operatorName.trim(),
        reason: reason.trim(),
        quantity: qtyNum,
      });
      addToast(`✓ Damage entry recorded.`, "success");
      setPriceId(""); setJobNo(""); setCustomer(""); setReason(""); setQuantity("");  
      onCreated();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* ── ADD: Job No / Photographer row ── */}
      <div className="r-grid-2">
        <div>
          <label>Job No <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
          <input value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="JOB-0001" />
        </div>
        <div>
          <label>Photographer / Studio <span style={{ color: "var(--text-dim)", fontWeight: 400 }}>(optional)</span></label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Studio name" />
        </div>
      </div>

      <div className="r-grid-2">
        <div>
          <label>Paper Size *</label>
          <select value={priceId} onChange={e => setPriceId(e.target.value)}>
            <option value="">-- Select paper size --</option>
            {prices.map(p => <option key={p.id} value={p.id}>{p.label} (Rs. {p.unit_price})</option>)}
          </select>
        </div>
        <div>
          <label>Quantity *</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="e.g. 2" />
        </div>
      </div>

      <div>
        <label>Damaged By *</label>
        {knownNames.length > 0 && !showNewName ? (
          <select
            value={knownNames.includes(operatorName) ? operatorName : ""}
            onChange={e => {
              if (e.target.value === "__new__") { setShowNewName(true); setOperatorName(""); }
              else setOperatorName(e.target.value);
            }}
          >
            <option value="">-- Select name --</option>
            {knownNames.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="__new__">+ Type a new name</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={operatorName} onChange={e => setOperatorName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="Enter name" style={{ flex: 1 }} />
            {knownNames.length > 0 && (
              <button type="button" onClick={() => { setShowNewName(false); setOperatorName(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>← Back</button>
            )}
          </div>
        )}
      </div>

      <div>
        <label>Reason *</label>
        <textarea value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Paper jam, color mismatch…" rows={2} />
      </div>

      {selectedPrice && qtyNum > 0 && (
        <div style={{ background: "#807a7a", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".06em",fontweight:900 }}>Estimated Value</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 18, fontWeight: 900, color: "var(--text-pri)" }}>Rs. {previewTotal}</span>
        </div>
      )}

      <button type="submit" disabled={saving} style={{
        padding: "13px 0", background: saving ? "var(--bg3)" : "var(--red)",
        color: saving ? "var(--text-dim)" : "#fff", borderRadius: 8, fontWeight: 800, fontSize: 15,
      }}>{saving ? "Saving…" : "⚠ Record Damage"}</button>
    </form>
  );
}

function DamageEditModal({ entry, onClose, onSaved, addToast }) {
  const [prices, setPrices] = useState([]);
  const [priceId, setPriceId] = useState(entry.paper_price_id);
  const [jobNo, setJobNo] = useState(entry.job_no || "");    
  const [customer, setCustomer] = useState(entry.customer || "");
  const [operatorName, setOperatorName] = useState(entry.operator_name);
  const [reason, setReason] = useState(entry.reason);
  const [quantity, setQuantity] = useState(entry.quantity);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => { api.paperPrices().then(setPrices).catch(() => {}); }, []);

  async function save() {
    setSaving(true);
    try {
      await api.updateDamage(entry.id, {
        paper_price_id: Number(priceId),
        job_no: jobNo.trim(),          // ADD
        customer: customer.trim(),     
        operator_name: operatorName.trim(),
        reason: reason.trim(),
        quantity: Number(quantity),
      });
      addToast("✓ Damage entry updated.", "success");
      onSaved();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 420, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Edit Damage Entry</div>

        {/* ── ADD ── */}
        <div>
          <label>Job No</label>
          <input value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="JOB-0001" />
        </div>
        <div>
          <label>Photographer / Studio</label>
          <input value={customer} onChange={e => setCustomer(e.target.value)} placeholder="Studio name" />
        </div>

        <div>
          <label>Paper Size</label>
          <select value={priceId} onChange={e => setPriceId(e.target.value)}>
            {prices.map(p => <option key={p.id} value={p.id}>{p.label} (Rs. {p.unit_price})</option>)}
          </select>
        </div>
        <div>
          <label>Quantity</label>
          <input type="number" min="1" value={quantity} onChange={e => setQuantity(e.target.value)} />
        </div>
        <div>
          <label>Damaged By</label>
          <input value={operatorName} onChange={e => setOperatorName(e.target.value)} />
        </div>
        <div>
          <label>Reason</label>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: "12px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 14 }}>{saving ? "Saving…" : "✓ Save Changes"}</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function DamageEntryCard({ entry, onChanged, addToast }) {
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function createdMs() {
    const s = entry.created_at;
    return new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  }
  const WINDOW_MS = 24 * 3600 * 1000;
  const remaining = WINDOW_MS - (now - createdMs());
  const withinWindow = remaining > 0;

  async function del() {
    if (!window.confirm(`Delete this damage entry (${entry.paper_label} × ${entry.quantity})?`)) return;
    try {
      await api.deleteDamage(entry.id);
      addToast("Damage entry deleted.", "info");
      onChanged();
    } catch (err) { addToast(err.message, "error"); }
  }

  function fmtRemaining() {
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return `${h}h ${m}m left to edit`;
  }

  return (
    <div style={{
      background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8,
      padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 800, color: "var(--amber)" }}>{entry.paper_label}</span>
            <span style={{ fontSize:15, color: "var(--text-pri)",fontweight:900 }}>× {entry.quantity}</span>
            <span style={{ fontSize: 12, padding: "2px 7px", borderRadius: 4, background: DAMAGE_DEPT_COLORS[entry.department] + "22", color: DAMAGE_DEPT_COLORS[entry.department], border: `1px solid ${DAMAGE_DEPT_COLORS[entry.department]}55`, fontWeight: 700, textTransform: "uppercase" }}>
              {DAMAGE_DEPT_LABELS[entry.department] || entry.department}
            </span>
          </div>
          <div style={{ fontSize: 13, color: "var(--text-pri)", marginTop: 4 }}>{entry.reason}</div>

          {(entry.job_no || entry.customer) && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 5 }}>
              {entry.job_no && (
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 4, background: "var(--info-bg)", border: "1px solid var(--border-strong)", color: "var(--amber)" }}>
                  {entry.job_no}
                </span>
              )}
              {entry.customer && (
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: "var(--info-bg)", border: "1px solid var(--border-strong)", color: "var(--text-pri)" }}>
                  {entry.customer}
                </span>
              )}
            </div>
          )}
          <div style={{ fontSize: 12, color: "var(--text-pri)", marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
            👤 {entry.operator_name}
            <span>-</span>
            {new Date(entry.created_at.endsWith("Z") ? entry.created_at : entry.created_at + "Z").toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--fm)", fontSize: 17, fontWeight: 900, color: "var(--red)" }}>Rs. {entry.total_value}</div>
          <div style={{ fontSize: 12, color: "var(--text-pri)" }}>@ Rs.{entry.unit_price_snapshot}</div>
        </div>
      </div>

      {withinWindow && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
          <span style={{ fontSize: 12, color: "var(--text-pri)" }}>{fmtRemaining()}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(true)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5, background: "var(--bg3)", color: "var(--amber)", border: "1px solid var(--amber)" }}><Pen size={12} /></button>
            <button onClick={del} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5, background: "var(--danger-bg)", color: "var(--red)", border: "1px solid var(--red)" }}><Trash size={12} /></button>
          </div>
        </div>
      )}

      {editing && (
        <DamageEditModal entry={entry} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} addToast={addToast} />
      )}
    </div>
  );
}

function PaperPricesModal({ onClose, addToast }) {
  const [prices, setPrices] = useState([]);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState({});
  const isMobile = useIsMobile();

  const reload = useCallback(() => {
    api.paperPrices().then(setPrices).catch(() => {});
  }, []);
  useEffect(() => { reload(); }, [reload]);

  async function save(id) {
    const val = Number(edits[id]);
    if (!val || val < 0) { addToast("Enter a valid price.", "error"); return; }
    setSaving(s => ({ ...s, [id]: true }));
    try {
      await api.updatePaperPrice(id, val);
      addToast("✓ Price updated.", "success");
      reload();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(s => ({ ...s, [id]: false })); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9400 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{
        background: "var(--bg1)", border: "1px solid var(--border)",
        borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 22,
        width: "100%", maxWidth: 480, maxHeight: isMobile ? "92dvh" : "88vh", overflowY: "auto",
        display: "flex", flexDirection: "column", gap: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Admin</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: "var(--amber)" }}>Paper Price List</div>
          </div>
          <button onClick={onClose} style={{ padding: "8px 12px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontWeight: 700 }}>✕</button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {prices.map(p => (
            <div key={p.id} style={{
              display: "flex", alignItems: "center", gap: 8,
              background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px",
            }}>
              <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: "var(--text-pri)" }}>{p.label}</div>
              <span style={{ fontSize: 12, color: "var(--text-dim)" }}>Rs.</span>
              <input
                type="number"
                defaultValue={p.unit_price}
                onChange={e => setEdits(ed => ({ ...ed, [p.id]: e.target.value }))}
                style={{ width: 80, margin: 0, textAlign: "right" }}
              />
              <button onClick={() => save(p.id)} disabled={saving[p.id]} style={{
                padding: "8px 12px", fontSize: 12, fontWeight: 700, borderRadius: 6,
                background: "var(--amber)", color: "#000",
              }}>{saving[p.id] ? "…" : "Save"}</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function DamagesPage({ deptKey }) {
  const { toasts, add } = useToast();
  const isAdminView = !deptKey;
  const dept = deptKey ? deptKey.toUpperCase() : "";
  const [filterDept, setFilterDept] = useState("");
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [showPrices, setShowPrices] = useState(false);
  const isMobile = useIsMobile();
  const [selectedDate, setSelectedDate] = useState(() => slDateStr(new Date()));
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [dotDays,  setDotDays]  = useState({});
  const [showCal,  setShowCal]  = useState(!isMobile);

  const activeDept = isAdminView ? filterDept : dept;
  const invalidDept = !isAdminView && !DAMAGE_DEPTS.includes(dept);

  const reload = useCallback(async () => {
  if (invalidDept) return;
  try {
    const d = await api.damages(activeDept || undefined, page, selectedDate);
    setIfChanged(setData)(d);
  } catch (err) { add(err.message, "error"); }
  finally { setLoading(false); }
}, [activeDept, page, selectedDate, invalidDept]);


  useEffect(() => {
  api.damageDates(calYear, calMonth, activeDept || undefined).then(setDotDays).catch(() => {});
}, [calYear, calMonth, activeDept]);

  useEffect(() => { setPage(1); }, [selectedDate, activeDept]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);

  const accent = isAdminView ? "var(--red)" : (DAMAGE_DEPT_COLORS[dept] || "var(--red)");

  if (invalidDept) {
    return (
      <Shell title="DAMAGES" accent="var(--red)">
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)" }}>
          Damage tracking is not available for this department.
        </div>
      </Shell>
    );
  }

  return (
    <>
      <Shell title={isAdminView ? "PAPER DAMAGE OVERVIEW" : `${DAMAGE_DEPT_LABELS[dept]} DAMAGES`} accent={accent} topRight={
        IS_ADMIN && (
          <button onClick={() => setShowPrices(true)} style={{
            padding: isMobile ? "6px 10px" : "8px 14px",
            background: "var(--bg3)", color: "var(--amber)",
            border: "1px solid var(--amber)", borderRadius: 6, fontWeight: 700,
            fontSize: isMobile ? 12 : 14,
          }}>{isMobile ? "Prices" : "Manage Paper Prices"}</button>
        )
      }>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {!isAdminView && (
            <Sec title="Record New Damage" accent={accent}>
              <DamageEntryForm dept={dept} onCreated={() => { setPage(1); reload(); }} addToast={add} />
            </Sec>
          )}

          {isAdminView && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {["", "PRINTING", "LAMINATING", "BINDING"].map(d => (
                <button key={d || "ALL"} onClick={() => { setFilterDept(d); setPage(1); }} style={{
                  padding: "7px 16px", fontSize: 12, fontWeight: 700, borderRadius: 6,
                  background: filterDept === d ? "var(--amber)" : "var(--bg2)",
                  color: filterDept === d ? "#000" : "var(--text-sec)",
                  border: `1px solid ${filterDept === d ? "var(--amber)" : "var(--border)"}`,
                }}>{d ? DAMAGE_DEPT_LABELS[d] : "All Departments"}</button>
              ))}
            </div>
          )}

          <div className="r-history-layout" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr", gap: 16, alignItems: "start" }}>
  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
    {isMobile && (
      <button onClick={() => setShowCal(p => !p)} style={{
        padding: "8px 12px", background: showCal ? accent : "var(--bg3)",
        color: showCal ? "#000" : "var(--text-sec)",
        border: `1px solid ${accent}`, borderRadius: 6, fontWeight: 700, fontSize: 12,
        display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
      }}>
        <Calendar size={14} /> {selectedDate}
      </button>
    )}
    {showCal && (
      <EntryCalendar
        year={calYear} month={calMonth}
        onYearMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
        dotDays={dotDays}
        selectedDate={selectedDate}
        onSelect={setSelectedDate}
        onAfterSelect={() => { if (isMobile) setShowCal(false); }}
        accent={accent}
      />
    )}
    {data && (
      <div style={{ background: "var(--bg2)", border: `1px solid ${accent}33`, borderTop: `3px solid ${accent}`, borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
          {selectedDate} Total
        </div>
        <div style={{ fontFamily: "var(--fm)", fontSize: 22, fontWeight: 900, color: accent }}>Rs. {data.day_total_value ?? 0}</div>
        <div style={{ fontSize: 12, color: "var(--text-dim)" }}>{data.day_total_quantity ?? 0} sheets · {data.total} entries</div>
      </div>
    )}
  </div>

  <div>
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-pri)", marginBottom: 10 }}>
      Entries — {selectedDate}
    </div>
    {loading && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-pri)" }}>LOADING…</div>}
    {!loading && data?.entries?.length === 0 && (
      <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-pri)" }}>No damage entries on this day.</div>
    )}
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data?.entries?.map(e => (
        <DamageEntryCard key={e.id} entry={e} onChanged={reload} addToast={add} />
      ))}
    </div>
    {data && data.pages > 1 && (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>◀ Prev</button>
        <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{page} / {data.pages}</span>
        <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>Next ▶</button>
      </div>
    )}
  </div>
</div>


        </div>
      </Shell>
      {showPrices && <PaperPricesModal onClose={() => setShowPrices(false)} addToast={add} />}
      <ToastStack toasts={toasts} />
    </>
  );
}

// ── Paper Stock tracking ─────────────────────────────────────────────────────
function PaperStockCards({ stock }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
      {stock.map(s => {
        const low = s.balance <= LOW_STOCK_THRESHOLD;
        return (
          <div key={s.size} className={low ? "blink" : ""} style={{
            background: low ? "var(--danger-bg)" : "var(--bg2)",
            border: `1px solid ${low ? "var(--red)" : "var(--border)"}`,
            borderTop: `3px solid ${low ? "var(--red)" : "var(--blue)"}`,
            borderRadius: 8, padding: "14px 12px", textAlign: "center",
          }}>
            <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6 }}>{s.size}</div>
            <div style={{
              fontFamily: "var(--fd)", fontSize: isMobile ? 28 : 34, fontWeight: 900,
              color: low ? "var(--red)" : "var(--text-pri)",
              minWidth: "1.6em", display: "inline-block",
            }}>{s.balance}</div>
            <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>sheets left</div>
          </div>
        );
      })}
    </div>
  );
}

function AddPacketControl({ onAdded, addToast }) {
  const [size, setSize] = useState(PAPER_SIZES[0]);
  const [saving, setSaving] = useState(false);

  async function add() {
    setSaving(true);
    try {
      await api.addPaperPacket(size);
      addToast(`✓ New ${size} packet added (+100 sheets)`, "success");
      onAdded();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 160 }}>
        <label>Paper Size</label>
        <select value={size} onChange={e => setSize(e.target.value)}>
          {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <button onClick={add} disabled={saving} style={{
        padding: "11px 20px", background: saving ? "var(--bg3)" : "var(--blue)",
        color: saving ? "var(--text-dim)" : "#fff", borderRadius: 8, fontWeight: 800, fontSize: 14,
      }}>{saving ? "Adding…" : "+ Add New Packet (100)"}</button>
    </div>
  );
}

function PaperUsageForm({ onCreated, addToast }) {
  const [jobNo, setJobNo] = useState("");
  const [knownNames, setKnownNames] = useState([]);
  const [operatorName, setOperatorName] = useState("");
  const [showNewName, setShowNewName] = useState(false);
  const [paperSize, setPaperSize] = useState(PAPER_SIZES[0]);
  const [okPages, setOkPages] = useState("");
  const [printDamage, setPrintDamage] = useState("");
  const [accuRp, setAccuRp] = useState("");
  const [bindRp, setBindRp] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => { api.knownPaperOperators().then(d => setKnownNames(d.names || [])).catch(() => {}); }, []);

  const total = (Number(okPages) || 0) + (Number(printDamage) || 0) + (Number(accuRp) || 0) + (Number(bindRp) || 0);

  async function submit(e) {
    e.preventDefault();
    if (!jobNo.trim() || !operatorName.trim() || total <= 0) return;
    setSaving(true);
    try {
      await api.createPaperUsage({
        job_no: jobNo.trim(),
        operator_name: operatorName.trim(),
        paper_size: paperSize,
        ok_pages: Number(okPages) || 0,
        print_damage: Number(printDamage) || 0,
        accu_rp: Number(accuRp) || 0,
        bind_rp: Number(bindRp) || 0,
      });
      addToast(`✓ Recorded ${total} sheets used for #${jobNo}`, "success");
      setJobNo(""); setOkPages(""); setPrintDamage(""); setAccuRp(""); setBindRp("");
      onCreated();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="r-grid-2">
        <div>
          <label>Job No *</label>
          <input value={jobNo} onChange={e => setJobNo(e.target.value)} placeholder="JOB-0001" />
        </div>
        <div>
          <label>Paper Size *</label>
          <select value={paperSize} onChange={e => setPaperSize(e.target.value)}>
            {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label>Operator *</label>
        {knownNames.length > 0 && !showNewName ? (
          <select
            value={knownNames.includes(operatorName) ? operatorName : ""}
            onChange={e => {
              if (e.target.value === "__new__") { setShowNewName(true); setOperatorName(""); }
              else setOperatorName(e.target.value);
            }}
          >
            <option value="">-- Select name --</option>
            {knownNames.map(n => <option key={n} value={n}>{n}</option>)}
            <option value="__new__">+ Type a new name</option>
          </select>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <input value={operatorName} onChange={e => setOperatorName(e.target.value.replace(/\b\w/g, c => c.toUpperCase()))} placeholder="Enter name" style={{ flex: 1 }} />
            {knownNames.length > 0 && (
              <button type="button" onClick={() => { setShowNewName(false); setOperatorName(""); }} style={{ padding: "0 10px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 6, fontSize: 12 }}>← Back</button>
            )}
          </div>
        )}
      </div>

      <div className="r-grid-4">
        <div>
          <label>OK Pages</label>
          <input type="number" min="0" value={okPages} onChange={e => setOkPages(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label>Print Damage</label>
          <input type="number" min="0" value={printDamage} onChange={e => setPrintDamage(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label>Accu RP</label>
          <input type="number" min="0" value={accuRp} onChange={e => setAccuRp(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label>Bind RP</label>
          <input type="number" min="0" value={bindRp} onChange={e => setBindRp(e.target.value)} placeholder="0" />
        </div>
      </div>

      {total > 0 && (
        <div style={{ background: "var(--info-bg)", border: "1px solid var(--blue)", borderRadius: 6, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".06em" }}>Total Sheets Used</span>
          <span style={{ fontFamily: "var(--fm)", fontSize: 18, fontWeight: 900, color: "var(--blue)" }}>{total}</span>
        </div>
      )}

      <button type="submit" disabled={saving} style={{
        padding: "13px 0", background: saving ? "var(--bg3)" : "var(--blue)",
        color: saving ? "var(--text-dim)" : "#fff", borderRadius: 8, fontWeight: 800, fontSize: 15,
      }}>{saving ? "Saving…" : "✓ Record Usage"}</button>
    </form>
  );
}

function PaperUsageEditModal({ entry, onClose, onSaved, addToast }) {
  const [jobNo, setJobNo] = useState(entry.job_no);
  const [operatorName, setOperatorName] = useState(entry.operator_name);
  const [paperSize, setPaperSize] = useState(entry.paper_size);
  const [okPages, setOkPages] = useState(entry.ok_pages);
  const [printDamage, setPrintDamage] = useState(entry.print_damage);
  const [accuRp, setAccuRp] = useState(entry.accu_rp);
  const [bindRp, setBindRp] = useState(entry.bind_rp);
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();

  async function save() {
    setSaving(true);
    try {
      await api.updatePaperUsage(entry.id, {
        job_no: jobNo.trim(),
        operator_name: operatorName.trim(),
        paper_size: paperSize,
        ok_pages: Number(okPages) || 0,
        print_damage: Number(printDamage) || 0,
        accu_rp: Number(accuRp) || 0,
        bind_rp: Number(bindRp) || 0,
      });
      addToast("✓ Entry updated.", "success");
      onSaved();
    } catch (err) { addToast(err.message, "error"); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9200 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 440, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Edit Paper Usage</div>
        <div className="r-grid-2">
          <div>
            <label>Job No</label>
            <input value={jobNo} onChange={e => setJobNo(e.target.value)} />
          </div>
          <div>
            <label>Paper Size</label>
            <select value={paperSize} onChange={e => setPaperSize(e.target.value)}>
              {PAPER_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label>Operator</label>
          <input value={operatorName} onChange={e => setOperatorName(e.target.value)} />
        </div>
        <div className="r-grid-4">
          <div><label>OK</label><input type="number" min="0" value={okPages} onChange={e => setOkPages(e.target.value)} /></div>
          <div><label>Print Dmg</label><input type="number" min="0" value={printDamage} onChange={e => setPrintDamage(e.target.value)} /></div>
          <div><label>Accu RP</label><input type="number" min="0" value={accuRp} onChange={e => setAccuRp(e.target.value)} /></div>
          <div><label>Bind RP</label><input type="number" min="0" value={bindRp} onChange={e => setBindRp(e.target.value)} /></div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving} style={{ flex: 1, padding: "12px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 14 }}>{saving ? "Saving…" : "✓ Save Changes"}</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function PaperUsageCard({ entry, onChanged, addToast }) {
  const [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  function createdMs() {
    const s = entry.created_at;
    return new Date(s.endsWith("Z") ? s : s + "Z").getTime();
  }
  const WINDOW_MS = 24 * 3600 * 1000;
  const remaining = WINDOW_MS - (now - createdMs());
  const withinWindow = remaining > 0;

  async function del() {
    if (!window.confirm(`Delete this usage entry for #${entry.job_no}?`)) return;
    try {
      await api.deletePaperUsage(entry.id);
      addToast("Entry deleted.", "info");
      onChanged();
    } catch (err) { addToast(err.message, "error"); }
  }

  function fmtRemaining() {
    const h = Math.floor(remaining / 3600000);
    const m = Math.floor((remaining % 3600000) / 60000);
    return `${h}h ${m}m left to edit`;
  }

  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontFamily: "var(--fm)", fontSize: 15, fontWeight: 800, color: "var(--amber)" }}>{entry.job_no}</span>
            <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 4, background: "var(--blue)22", color: "var(--blue)", border: "1px solid var(--blue)55", fontWeight: 700 }}>{entry.paper_size}</span>
          </div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>👤 {entry.operator_name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
            {entry.ok_pages > 0 && <Chip label="OK" value={entry.ok_pages} accent="#22c55e" />}
            {entry.print_damage > 0 && <Chip label="Print Dmg" value={entry.print_damage} accent="#e53e3e" />}
            {entry.accu_rp > 0 && <Chip label="Accu RP" value={entry.accu_rp} accent="#06b6d4" />}
            {entry.bind_rp > 0 && <Chip label="Bind RP" value={entry.bind_rp} accent="#a855f7" />}
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div style={{ fontFamily: "var(--fm)", fontSize: 18, fontWeight: 900, color: "var(--text-pri)" }}>{entry.total_used}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>sheets used</div>
        </div>
      </div>
      {withinWindow && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4, paddingTop: 8, borderTop: "1px dashed var(--border)" }}>
          <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{fmtRemaining()}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={() => setEditing(true)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5, background: "var(--bg3)", color: "var(--amber)", border: "1px solid var(--amber)" }}><Pen size={12} /></button>
            <button onClick={del} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5, background: "var(--danger-bg)", color: "var(--red)", border: "1px solid var(--red)" }}><Trash size={12} /></button>
          </div>
        </div>
      )}
      {editing && <PaperUsageEditModal entry={entry} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} addToast={addToast} />}
    </div>
  );
}

function PapersPage() {
  const { toasts, add } = useToast();
  const isMobile = useIsMobile();
  const [stock, setStock] = useState([]);
  const [data, setData] = useState(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => slDateStr(new Date()));
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);
  const [dotDays,  setDotDays]  = useState({});
  const [showCal,  setShowCal]  = useState(!isMobile);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const reloadStock = useCallback(() => {
    api.paperStock().then(setIfChanged(setStock)).catch(() => {});
  }, []);

  const reloadUsage = useCallback(async () => {
  try {
    const d = await api.paperUsage(debouncedSearch, page, selectedDate);
    setIfChanged(setData)(d);
  } catch (err) { add(err.message, "error"); }
  finally { setLoading(false); }
}, [debouncedSearch, page, selectedDate]);


  useEffect(() => {
  api.paperUsageDates(calYear, calMonth).then(setDotDays).catch(() => {});
}, [calYear, calMonth]);

  useEffect(() => { setPage(1); }, [selectedDate]);
  useEffect(() => { reloadStock(); }, [reloadStock]);
  useEffect(() => { reloadUsage(); }, [reloadUsage]);
  useEffect(() => {
    const t = setInterval(() => { reloadStock(); reloadUsage(); }, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reloadStock, reloadUsage]);

  function reloadAll() {
    reloadStock();
    reloadUsage();
  }

  return (
    <>
      <Shell title="PAPER STOCK" accent="var(--blue)">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <PaperStockCards stock={stock} />

          <Sec title="Add New Packet" accent="var(--blue)">
            <AddPacketControl onAdded={reloadAll} addToast={add} />
          </Sec>

          <Sec title="Record Paper Usage" accent="var(--blue)">
            <PaperUsageForm onCreated={reloadAll} addToast={add} />
          </Sec>

          <div className="r-history-layout" style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "220px 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {isMobile && (
                <button onClick={() => setShowCal(p => !p)} style={{
                  padding: "8px 12px", background: showCal ? "var(--blue)" : "var(--bg3)",
                  color: showCal ? "#000" : "var(--text-sec)",
                  border: "1px solid var(--blue)", borderRadius: 6, fontWeight: 700, fontSize: 12,
                  display: "flex", alignItems: "center", gap: 6, justifyContent: "center",
                }}>
                  <Calendar size={14} /> {selectedDate}
                </button>
              )}
              {showCal && (
                <EntryCalendar
                  year={calYear} month={calMonth}
                  onYearMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
                  dotDays={dotDays}
                  selectedDate={selectedDate}
                  onSelect={setSelectedDate}
                  onAfterSelect={() => { if (isMobile) setShowCal(false); }}
                  accent="var(--blue)"
                />
              )}
              <SearchBar value={search} onChange={setSearch} placeholder="Search Job No / Operator…" />
              {data && (
                <div style={{ background: "var(--bg2)", border: "1px solid var(--blue)33", borderTop: "3px solid var(--blue)", borderRadius: 8, padding: "12px 14px" }}>
                  <div style={{ fontSize: 10, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 6 }}>
                    {selectedDate} Total
                  </div>
                  <div style={{ fontFamily: "var(--fm)", fontSize: 22, fontWeight: 900, color: "var(--blue)" }}>{data.day_total_used ?? 0}</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)" }}>sheets used · {data.total} entries</div>
                </div>
              )}
            </div>

            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-pri)", marginBottom: 10 }}>
                Usage — {selectedDate}
              </div>
              {loading && <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-dim)" }}>LOADING…</div>}
              {!loading && data?.entries?.length === 0 && (
                <div style={{ textAlign: "center", padding: "30px 0", color: "var(--text-dim)" }}>No usage entries on this day.</div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {data?.entries?.map(e => (
                  <PaperUsageCard key={e.id} entry={e} onChanged={reloadAll} addToast={add} />
                ))}
              </div>
              {data && data.pages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 }}>
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>◀ Prev</button>
                  <span style={{ fontSize: 13, color: "var(--text-dim)", fontFamily: "var(--fm)" }}>{page} / {data.pages}</span>
                  <button onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page === data.pages} style={{ padding: "7px 14px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 13, fontWeight: 700 }}>Next ▶</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </Shell>
      <ToastStack toasts={toasts} />
    </>
  );
}

const DEPT_FIX_LABELS = {
  PRINTING: "Printing", LAMINATING: "Laminating",
  LASER_CUTTING: "Laser Cutting", BINDING: "Binding",
};
const DEPT_FIX_COLORS = {
  PRINTING: "var(--blue)", LAMINATING: "var(--cyan)",
  LASER_CUTTING: "var(--purple)", BINDING: "var(--green)",
};

function DateFixRow({ label, accent, currentDateSl, disabled, disabledReason, onFix }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap",
      background: "var(--bg2)", border: "1px solid var(--border)", borderLeft: `4px solid ${accent}`,
      borderRadius: 8, padding: "12px 14px",
    }}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 800, color: accent, textTransform: "uppercase", letterSpacing: ".06em" }}>{label}</div>
        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text-pri)", marginTop: 3, fontFamily: "var(--fm)" }}>
          {currentDateSl || "—"}
        </div>
        {disabled && <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{disabledReason}</div>}
      </div>
      <button onClick={onFix} disabled={disabled} style={{
        padding: "8px 16px", fontSize: 12, fontWeight: 700, borderRadius: 6,
        background: disabled ? "var(--bg3)" : "var(--amber)",
        color: disabled ? "var(--text-dim)" : "#000",
      }}>✏ Fix Date</button>
    </div>
  );
}

function FixDateModal({ title, currentDateSl, onSave, onClose }) {
  const [date, setDate] = useState(currentDateSl || "");
  const [saving, setSaving] = useState(false);
  const isMobile = useIsMobile();
  async function save() {
    if (!date) return;
    setSaving(true);
    try { await onSave(date); onClose(); } finally { setSaving(false); }
  }
  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9300 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em" }}>Fix Date</div>
          <div style={{ fontSize: 16, fontWeight: 800, color: "var(--amber)" }}>{title}</div>
        </div>
        <div>
          <label>Correct calendar date (Sri Lanka)</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
          Time-of-day stays the same — only the date moves. Duration &amp; delay status won't change.
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={save} disabled={saving || !date} style={{ flex: 1, padding: "12px 0", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800, fontSize: 14 }}>{saving ? "Saving…" : "✓ Save"}</button>
          <button onClick={onClose} style={{ padding: "12px 18px", background: "var(--bg3)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 8, fontWeight: 700 }}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function AdminDateFixPage() {
  const { toasts, add } = useToast();

  if (!IS_ADMIN) {
    return (
      <Shell title="ACCESS DENIED" accent="var(--red)">
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--red)" }}>
          This page is admin-only.
        </div>
      </Shell>
    );
  }

  const [query, setQuery]     = useState("");
  const [results, setResults] = useState([]);
  const [job, setJob]         = useState(null);      // selected job (basic)
  const [timeline, setTimeline] = useState(null);     // full timeline
  const [fixTarget, setFixTarget] = useState(null);   // { key, label, dateSl }
  const [loading, setLoading] = useState(false);

  async function search() {
    if (!query.trim()) return;
    try { const d = await api.adminSearchJob(query.trim()); setResults(d.jobs || []); }
    catch (err) { add(err.message, "error"); }
  }

  async function pick(j) {
    setJob(j); setResults([]); setQuery("");
    setLoading(true);
    try { setTimeline(await api.adminJobTimeline(j.id)); }
    catch (err) { add(err.message, "error"); }
    finally { setLoading(false); }
  }

  async function reloadTimeline() {
    if (!job) return;
    try { setTimeline(await api.adminJobTimeline(job.id)); } catch {}
  }

  async function applyFix(newDate) {
    try {
      await api.adminFixDate(job.id, fixTarget.key, newDate);
      add(`✓ ${fixTarget.label} date updated to ${newDate}`, "success");
      await reloadTimeline();
    } catch (err) { add(err.message, "error"); throw err; }
  }

  return (
    <>
      <Shell title="ADMIN — FIX DATES" accent="var(--red)">
        <div style={{ maxWidth: 640, display: "flex", flexDirection: "column", gap: 16 }}>
          <Sec title="Find Job" accent="var(--red)">
            <div style={{ display: "flex", gap: 8 }}>
              <input value={query} onChange={e => setQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && search()}
                placeholder="Job No / Customer / Couple…" style={{ flex: 1, margin: 0 }} />
              <button onClick={search} style={{ padding: "0 18px", background: "var(--amber)", color: "#000", borderRadius: 8, fontWeight: 800 }}>Search</button>
            </div>
            {results.length > 0 && (
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map(r => (
                  <button key={r.id} onClick={() => pick(r)} style={{
                    display: "flex", justifyContent: "space-between", padding: "9px 12px",
                    background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 6, textAlign: "left",
                  }}>
                    <span style={{ fontFamily: "var(--fm)", color: "var(--amber)", fontWeight: 800 }}>{r.job_no}</span>
                    <span style={{ color: "var(--text-sec)" }}>{r.customer}</span>
                  </button>
                ))}
              </div>
            )}
          </Sec>

          {loading && <div style={{ textAlign: "center", padding: 20, color: "var(--text-dim)" }}>LOADING…</div>}

          {timeline && (
            <Sec title={`Timeline — ${timeline.job_no}`} accent="var(--amber)">
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <DateFixRow
                  label="Entry" accent="var(--amber)" currentDateSl={timeline.created_date_sl}
                  onFix={() => setFixTarget({ key: "ENTRY", label: "Entry", dateSl: timeline.created_date_sl })}
                />
                {["PRINTING","LASER_CUTTING","LAMINATING","BINDING"].map(dk => {
                  const log = [...timeline.logs].reverse().find(l => l.department === dk);
                  const done = log && log.exited_at;
                  return (
                    <DateFixRow
                      key={dk}
                      label={DEPT_FIX_LABELS[dk]} accent={DEPT_FIX_COLORS[dk]}
                      currentDateSl={done ? log.exited_date_sl : null}
                      disabled={!done}
                      disabledReason={!log ? "Not started yet" : "Still in progress / not completed"}
                      onFix={() => setFixTarget({ key: dk, label: DEPT_FIX_LABELS[dk], dateSl: log.exited_date_sl })}
                    />
                  );
                })}
                {timeline.is_fully_completed && (
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginTop: 4 }}>
                    Job fully completed on <b style={{ color: "var(--green)" }}>{timeline.completed_date_sl}</b> — this follows the Binding date automatically.
                  </div>
                )}
              </div>
            </Sec>
          )}
        </div>
      </Shell>

      {fixTarget && (
        <FixDateModal
          title={fixTarget.label}
          currentDateSl={fixTarget.dateSl}
          onSave={date => applyFix(date)}
          onClose={() => setFixTarget(null)}
        />
      )}
      <ToastStack toasts={toasts} />
    </>
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
        <TriangleAlert size={isMobile ? 14 : 18} color="var(--danger-text)" />
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
                <span style={{ fontFamily: "var(--fm)", fontSize: 12, color: "#ffffff", fontWeight: 700,letterSpacing:".1em" }}>{job.job_no}</span>
                <span style={{ fontSize: 12, color: "#ffff", fontWeight: 600 }}>{job.customer}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {currentDept && !isMobile && (
                  <span style={{ fontSize: 11, color: "#ffff" }}>@ {({ PRINTING:"Print", LAMINATING:"Lam", LASER_CUTTING:"Laser", BINDING:"Bind" })[currentDept]}</span>
                )}
                <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 3, background: "var(--red)", color: "#fff",letterSpacing:".1em" }}>{daysLate}d late</span>
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
    const h = parseUTC(raw)?.getHours();
    const idx = Math.floor(h / 4);
    if (idx >= 0 && idx < 6) counts[idx]++;
  });

  const maxCount   = Math.max(...counts, 1);
  const totalToday = done.length;
  const nowHour    = new Date().getHours();
  const activeSlot = Math.floor(nowHour / 4);

  return (
    <div style={{
      background: "var(--card-bg)",
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
          color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Throughput - Today
        </span>
        {/* Total badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6,
          background:"var(--bg2)", border: "1px solid var(--border)",
          borderRadius: 6, padding: "4px 10px", flexShrink: 0,
        }}>
          <span style={{
            fontFamily: "var(--fm)",
            fontSize: isMobile ? 30 : 35,
            fontWeight: 900, lineHeight: 1,
            color: totalToday > 0 ? "var(--green)" : "var(--text-dim)",
          }}>
            {totalToday}
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1.3 }}>Total</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", lineHeight: 1.3 }}>Albums</span>
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
            numColor = "var(--text-pri)"; lblColor = "var(--text-pri)";
            barColor = "var(--text-pri)"; borderTop = "2px solid var(--bg1)";
          } else if (isCurrent) {
            numColor  = count > 10 ? "#0caeee" : "var(--text-pri)";
            lblColor  = "#0caeee";
            barColor  = "#0caeee";
            borderTop = "2px solid #0caeee";
          } else if (count > 5 && count <= 10) {
            numColor  = "#b30cd4"; lblColor = "var(--text-pri)";
            barColor  = "#b30cd4";     borderTop = "2px solid #b30cd4";
          } else if (count > 0 && count < 5) {
            numColor  = "#fd2d26"; lblColor = "var(--text-pri)";
            barColor  = "#fd2d26";      borderTop = "2px solid #fd2d26";
          } else if (count > 10) {
            numColor  = "#22c55e"; lblColor = "var(--text-pri)";
            barColor  = "#22c55e";      borderTop = "2px solid #22c55e";


          } else {
            numColor  = "var(--text-pri)"; lblColor = "var(--text-pri)";
            barColor  = "var(--bg3)";      borderTop = "2px solid var(--bg2)";
          }

          return (
            <div key={i} style={{
              background:"var(--surface-sunken)",
              border: `3px solid ${isCurrent ? "#0caeee" : "var(--bg2)"}`,
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
                fontSize: isMobile ? 11 : 12,
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

function DeptTotalsPanel({ addToast }) {
  const [data, setData]           = useState(null);
  const [expanded, setExpanded]   = useState(null); // dept key
  const [dateByDept, setDateByDept] = useState({});   // deptKey -> "YYYY-MM-DD" | null (null = today)
  const [pageByDept, setPageByDept] = useState({});
  const [jobsCache, setJobsCache] = useState({});
  const [calOpenDept, setCalOpenDept] = useState(null);
  const [dotDays, setDotDays]     = useState({});
  const [calYear, setCalYear]     = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]   = useState(new Date().getMonth() + 1);
  const [viewJob, setViewJob]     = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const load = () => api.deptStats().then(setIfChanged(setData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const rows = [
    { key: "PENDING_PRINT", label: "Pending",     tag: "AWAITING PRINT" },
    { key: "PRINTING",      label: "Printing",    tag: null             },
    { key: "LAMINATING",    label: "Accubinding", tag: null             },
    { key: "LASER_CUTTING", label: "Laser cut cover", tag: null         },
    { key: "BINDING",       label: "Binding",     tag: "COMPLETE"       },
  ];

  function cacheKeyFor(dept, date, page) {
    return `${dept}-${date || "today"}-${page}`;
  }

  async function loadJobs(dept, date, page) {
    const key = cacheKeyFor(dept, date, page);
    setJobsCache(c => ({ ...c, [key]: "loading" }));
    try {
      const res = dept === "PENDING_PRINT"
        ? await api.pendingPrintJobs("", page)
        : await api.stationHistory(dept, "", page, date || "");
      setJobsCache(c => ({ ...c, [key]: res }));
    } catch {
      setJobsCache(c => ({ ...c, [key]: "error" }));
    }
  }

  function toggleDept(deptKey) {
    if (expanded === deptKey) { setExpanded(null); setCalOpenDept(null); return; }
    setExpanded(deptKey);
    setCalOpenDept(null);
    const date = dateByDept[deptKey] ?? null;
    const page = pageByDept[deptKey] ?? 1;
    loadJobs(deptKey, date, page);
  }

  function selectDate(deptKey, date) {
    setDateByDept(d => ({ ...d, [deptKey]: date }));
    setPageByDept(p => ({ ...p, [deptKey]: 1 }));
    setCalOpenDept(null);
    loadJobs(deptKey, date, 1);
  }

  function selectToday(deptKey) {
    setDateByDept(d => ({ ...d, [deptKey]: null }));
    setPageByDept(p => ({ ...p, [deptKey]: 1 }));
    setCalOpenDept(null);
    loadJobs(deptKey, null, 1);
  }

  function changePage(deptKey, newPage) {
    setPageByDept(p => ({ ...p, [deptKey]: newPage }));
    const date = dateByDept[deptKey] ?? null;
    loadJobs(deptKey, date, newPage);
  }

  function openCalendar(deptKey) {
    const isOpen = calOpenDept === deptKey;
    setCalOpenDept(isOpen ? null : deptKey);
    if (!isOpen) {
      const now = new Date();
      setCalYear(now.getFullYear());
      setCalMonth(now.getMonth() + 1);
      api.stationHistoryDates(deptKey, now.getFullYear(), now.getMonth() + 1)
        .then(setDotDays).catch(() => setDotDays({}));
    }
  }

  function calNav(deptKey, y, m) {
    setCalYear(y); setCalMonth(m);
    api.stationHistoryDates(deptKey, y, m).then(setDotDays).catch(() => setDotDays({}));
  }

  return (
    <div style={{
      background: "#a8a5a5", border: "1px solid #8f8c8c",
      borderRadius: 12, padding: "14px 16px", marginBottom: 16,
    }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#111", marginBottom: 12 }}>
        Department Totals
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#333", fontSize: 13, letterSpacing: ".05em" }}>
          LOADING…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {rows.map(r => {
            const daily   = data.daily?.[r.key]   ?? 0;
            const monthly = data.monthly?.[r.key] ?? 0;
            const isPending = r.key === "PENDING_PRINT";
            const pendingCount = data.pending_print_count ?? 0;
            const isOpen  = expanded === r.key;
            const selDate = dateByDept[r.key] ?? null;
            const page    = pageByDept[r.key] ?? 1;
            const result  = jobsCache[cacheKeyFor(r.key, selDate, page)];
            const isCalOpen = calOpenDept === r.key;

            return (
              <div key={r.key} style={{
                background: "#e6e6e6", borderLeft: "4px solid #111", borderRadius: 8, overflow: "hidden",
              }}>
                <button onClick={() => toggleDept(r.key)} style={{
                  width: "100%", padding: "14px 18px",
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  gap: 10, flexWrap: "wrap", background: "transparent", textAlign: "left",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronDown size={16} style={{ color: "#444", transition: "transform .2s ease", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{r.label}</span>
                    {r.tag && <span style={{ fontSize: 10, fontWeight: 700, color: "#555" }}>({r.tag})</span>}
                  </div>

                  {isPending ? (
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#333", letterSpacing: ".08em" }}>NOT PRINTED YET</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#d97706" }}>{pendingCount}</div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#333", letterSpacing: ".08em" }}>Today</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#3c24a5" }}>{daily}</div>
                      </div>
                      <div style={{ width: 1, height: 30, background: "#bbb" }} />
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: "#333", letterSpacing: ".08em" }}>Monthly</div>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "#2ECC71" }}>{monthly}</div>
                      </div>
                    </div>
                  )}
                </button>

                {isOpen && (
                  <div className="si" style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 10 }}>

                    {!isPending && (
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                        <button onClick={() => selectToday(r.key)} style={{
                          padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4,
                          background: !selDate ? "#2ECC71" : "#ddd", color: !selDate ? "#fff" : "#333",
                        }}>Today</button>

                        <button onClick={() => openCalendar(r.key)} style={{
                          padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4,
                          background: selDate ? "#3c24a5" : "#ddd", color: selDate ? "#fff" : "#333",
                          display: "flex", alignItems: "center", gap: 5,
                        }}>
                          <Calendar size={12} />
                          {selDate ? new Date(selDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "Pick a day"}
                        </button>
                      </div>
                    )}

                    {isPending && (
                      <div style={{ fontSize: 11, color: "#555" }}>
                        Live backlog — jobs entered but printing hasn't started yet (any date).
                      </div>
                    )}

                    {!isPending && isCalOpen && (
                      <div style={{ width: "100%", maxWidth: 260 }}>
                        <EntryCalendar
                          year={calYear} month={calMonth}
                          onYearMonth={(y, m) => calNav(r.key, y, m)}
                          dotDays={dotDays}
                          selectedDate={selDate || ""}
                          onSelect={dt => selectDate(r.key, dt)}
                          accent="#3c24a5"
                        />
                      </div>
                    )}

                    {result === "loading" && <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>Loading…</div>}
                    {result === "error"   && <div style={{ fontSize: 12, color: "#b91c1c", padding: "6px 0" }}>Failed to load jobs.</div>}
                    {result && result !== "loading" && result !== "error" && (
                      <>
                       <div style={{
                          display: "flex", alignItems: "center", justifyContent: "space-between",
                          background: "#fff", border: "1px solid #ccc", borderLeft: "4px solid #3c24a5",
                          borderRadius: 8, padding: "10px 14px", marginBottom: 4,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#333" }}>
                            {isPending ? "Awaiting Printing" : (selDate ? new Date(selDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "Today")}
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 900, color: "#3c24a5", lineHeight: 1 }}>
                            {result.total}
                          </div>
                        </div>
                        {result.jobs.length === 0 ? (
                          <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>No jobs found.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                            {result.jobs.map(j => (
                              <button key={j.id} onClick={() => setViewJob(j)} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                background: "#fff", border: "1px solid #ddd", borderRadius: 4, padding: "8px 10px",
                                textAlign: "left", cursor: "pointer",
                              }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{j.job_no}</span>
                                <span style={{ fontSize: 12, color: "#333" }}>{j.customer}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {result.pages > 1 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                            <button onClick={() => changePage(r.key, Math.max(1, page - 1))} disabled={page === 1} style={{
                              padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            }}>◀ Prev</button>
                            <span style={{ fontSize: 11, color: "#333" }}>{page} / {result.pages}</span>
                            <button onClick={() => changePage(r.key, Math.min(result.pages, page + 1))} disabled={page === result.pages} style={{
                              padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700,
                            }}>Next ▶</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewJob && <JobCardViewModal job={viewJob} onClose={() => setViewJob(null)} addToast={addToast} />}
    </div>
  );
}

const ALBUM_BREAKDOWN_TYPES = [
  { key: "NORMAL", label: "Magazine Album", accent: "#16a34a" },
  { key: "STORY",  label: "Story Album",    accent: "#7c3aed" },
  { key: "REBIND", label: "Rebind Album",   accent: "#0ea5e9" },
];

function AlbumTypeBreakdownPanel({ dept, accent = "var(--amber)" }) {
  const [data, setData]           = useState(null);
  const [selectedDate, setSelDate] = useState(null); // null = today
  const [showCal, setShowCal]     = useState(false);
  const [calYear, setCalYear]     = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]   = useState(new Date().getMonth() + 1);
  const [dotDays, setDotDays]     = useState({});
  const [expandedType, setExpandedType] = useState(null);
  const [page, setPage]           = useState(1);
  const [jobsResult, setJobsResult] = useState(null);
  const [viewJob, setViewJob]     = useState(null);

  const reload = useCallback(() => {
    api.albumBreakdown(dept, selectedDate || undefined).then(setData).catch(() => {});
  }, [dept, selectedDate]);

  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const t = setInterval(reload, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(() => {
    if (!showCal) return;
    api.albumBreakdownDates(dept, calYear, calMonth).then(setDotDays).catch(() => setDotDays({}));
  }, [dept, calYear, calMonth, showCal]);

  async function loadJobs(type, pg) {
    setJobsResult("loading");
    try { setJobsResult(await api.albumJobsList(dept, type, selectedDate || undefined, pg)); }
    catch { setJobsResult("error"); }
  }

  function toggleType(key) {
    if (expandedType === key) { setExpandedType(null); setJobsResult(null); return; }
    setExpandedType(key);
    setPage(1);
    loadJobs(key, 1);
  }

  function changePage(pg) {
    setPage(pg);
    loadJobs(expandedType, pg);
  }

  const dateLabel = selectedDate
    ? new Date(selectedDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" })
    : "Today";

  return (
    <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 6 }}>
        <span style={{ fontFamily: "var(--fd)", fontSize: 12, fontWeight: 900, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--text-pri)" }}>
          Album Type Breakdown
        </span>
        <button onClick={() => setShowCal(p => !p)} style={{
          padding: "4px 10px", fontSize: 11, fontWeight: 700, borderRadius: 5,
          background: selectedDate ? accent : "var(--bg3)", color: selectedDate ? "#000" : "var(--text-sec)",
          border: `1px solid ${selectedDate ? accent : "var(--border)"}`, display: "flex", alignItems: "center", gap: 5,
        }}><Calendar size={12} /> {dateLabel}</button>
      </div>

      {showCal && (
        <div style={{ marginBottom: 10, maxWidth: 260 }}>
          <EntryCalendar
            year={calYear} month={calMonth}
            onYearMonth={(y, m) => { setCalYear(y); setCalMonth(m); }}
            dotDays={dotDays}
            selectedDate={selectedDate || slDateStr(new Date())}
            onSelect={dt => { setSelDate(dt); setExpandedType(null); }}
            onAfterSelect={() => setShowCal(false)}
            accent={accent}
          />
          {selectedDate && (
            <button onClick={() => { setSelDate(null); setExpandedType(null); setShowCal(false); }} style={{
              marginTop: 6, width: "100%", padding: "6px 0", fontSize: 11, fontWeight: 700,
              color: "var(--red)", background: "var(--bg2)", borderRadius: 4, border: "1px solid var(--border)",
            }}>✕ Clear — back to Today</button>
          )}
        </div>
      )}

      {!data ? (
        <div style={{ textAlign: "center", padding: "14px 0", color: "var(--text-dim)", fontSize: 12 }}>Loading…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ALBUM_BREAKDOWN_TYPES.map(t => {
            const d = data.daily?.[t.key] ?? 0;
            const m = data.monthly?.[t.key] ?? 0;
            const isOpen = expandedType === t.key;
            return (
              <div key={t.key} style={{ background: "var(--surface-sunken)", border: `1px solid ${t.accent}33`, borderLeft: `3px solid ${t.accent}`, borderRadius: 6, overflow: "hidden" }}>
                <button onClick={() => toggleType(t.key)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 6,
                }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: t.accent, textTransform: "uppercase", letterSpacing: ".05em" }}>{t.label}</span>
                  <div style={{ display: "flex", gap: 14 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".1em" }}>{selectedDate ? "DAY" : "TODAY"}</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--text-pri)" }}>{d}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".1em" }}>MONTH</div>
                      <div style={{ fontSize: 15, fontWeight: 800, color: "var(--amber)" }}>{m}</div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="si" style={{ padding: "0 10px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {jobsResult === "loading" && <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0" }}>Loading…</div>}
                    {jobsResult === "error" && <div style={{ fontSize: 11, color: "var(--red)", padding: "4px 0" }}>Failed to load.</div>}
                    {jobsResult && jobsResult !== "loading" && jobsResult !== "error" && (
                      <>
                        {jobsResult.jobs.length === 0 ? (
                          <div style={{ fontSize: 11, color: "var(--text-dim)", padding: "4px 0" }}>No jobs.</div>
                        ) : (
                          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflowY: "auto" }}>
                            {jobsResult.jobs.map(j => (
                              <button key={j.id} onClick={() => setViewJob(j)} style={{
                                display: "flex", justifyContent: "space-between", alignItems: "center",
                                background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 4,
                                padding: "6px 10px", textAlign: "left",
                              }}>
                                <span style={{ fontFamily: "var(--fm)", fontSize: 12, fontWeight: 800, color: t.accent }}>{j.job_no}</span>
                                <span style={{ fontSize: 12, color: "var(--text-sec)" }}>{j.customer}</span>
                              </button>
                            ))}
                          </div>
                        )}
                        {jobsResult.pages > 1 && (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 2 }}>
                            <button onClick={() => changePage(Math.max(1, page - 1))} disabled={page === 1} style={{ padding: "3px 9px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>◀</button>
                            <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{page}/{jobsResult.pages}</span>
                            <button onClick={() => changePage(Math.min(jobsResult.pages, page + 1))} disabled={page === jobsResult.pages} style={{ padding: "3px 9px", background: "var(--bg2)", color: "var(--text-sec)", border: "1px solid var(--border)", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>▶</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {viewJob && <JobCardViewModal job={viewJob} onClose={() => setViewJob(null)} addToast={() => {}} />}
    </div>
  );
}

function MachineStatsPanel() {
  const [data, setData] = useState(null);
  const isMobile = useIsMobile();
  useEffect(() => {
  const load = () => api.deptStats().then(setIfChanged(setData)).catch(() => {});
  load();
  const t = setInterval(load, POLL_INTERVAL_MS);
  return () => clearInterval(t);
}, []);

  const machines = data?.machines || { monthly: {}, daily: {} };
  const rows = [
    { key: "GREEN_2", label: "Green II", accent: "var(--text-pri)" },
    { key: "GREEN_3", label: "Green III", accent: "var(--text-pri)" },
    { key: "EPSON", label: "Epson", accent: "var(--text-pri)" },
    { key: "GREEN_3_NEW", label: "Green IV", accent: "var(--text-pri)" },
  ];

  return (
<div
  style={{
    background: "var(--card-bg)",
    border: "1px solid var(--border)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 8px 30px rgba(0,0,0,0.20)",
  }}
>
  {/* Header */}
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 18,
    }}
  >
    <div>
      <div
        style={{
          fontSize: 18,
          fontWeight: 700,
          color:"var(--text-pri)",
          fontFamily: "var(--fd)",
          letterSpacing: ".04em",
          textShadow: "var(--title-shadow)",
        }}
      >
        Printing Machines
      </div>

    </div>
  </div>

  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: 12,
    }}
  >
    {rows.map((r) => (
      <div
        key={r.key}
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          background: "var(--surface-sunken)",
          border: "1px solid var(--border-strong)",
          borderLeft: `5px solid ${r.accent}`,
          borderRadius: 12,
          padding: isMobile ? "10px 12px" : "14px 18px",
          transition: ".25s",
        }}
      >
        {/* Machine Name */}
        <div>
          <div
            style={{
              color: r.accent,
              fontWeight: 700,
              fontSize: 15,
              letterSpacing: ".05em",
            }}
          >
            {r.label}
          </div>
        </div>

        {/* Stats */}
        <div
          style={{
            display: "flex",
            gap: isMobile ? 14 : 28,
          }}
        >
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 12,
                fontweight:700,
                color: "var(--text-pri)",
                letterSpacing:".2em"
              }}
            >
              Today
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#3c24a5",
              }}
            >
              {machines.daily[r.key] ?? 0}
            </div>
          </div>

          <div
            style={{
              width: 1,
              background: "var(--border-strong)",
            }}
          />

          <div style={{ textAlign: "right" }}>
            <div
              style={{
                fontSize: 12,
                fontweight:700,
                color: "var(--text-pri)",
                // textTransform: "uppercase",
                letterSpacing:".2em"
              }}
            >
              Monthly
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#2ECC71",
              }}
            >
              {machines.monthly[r.key] ?? 0}
            </div>
          </div>
        </div>
      </div>
    ))}
  </div>
</div>
  );
}

const PRINTING_MACHINES = [
  { key: "GREEN_2",     label: "Green II",  albumTypes: ["NORMAL", "STORY", "REBIND"], hasThankYou: true },
  { key: "GREEN_3",     label: "Green III", albumTypes: ["NORMAL", "STORY", "REBIND"], hasThankYou: true },
  { key: "GREEN_3_NEW", label: "Green IV",  albumTypes: ["NORMAL", "STORY", "REBIND"], hasThankYou: true },
  { key: "EPSON",       label: "Epson",     albumTypes: ["STORY", "REBIND"],           hasThankYou: false },
];

const ALBUM_TYPE_LABELS = { NORMAL: "Magazine Album", STORY: "Story Albums", REBIND: "Rebind Albums" };

function PrintingMachineBreakdownPanel() {
  const [data, setData]                 = useState(null);
  const [expandedMachine, setExpMachine] = useState(null);
  const [expandedAlbum, setExpAlbum]     = useState(null); // `${machine}-${albumType}`
  const [dateByAlbum, setDateByAlbum]    = useState({});   // albumKey -> "YYYY-MM-DD" | null (null = this month)
  const [pageByAlbum, setPageByAlbum]    = useState({});   // albumKey -> page number
  const [jobsCache, setJobsCache]        = useState({});   // cacheKey -> result | "loading" | "error"
  const [calOpenAlbum, setCalOpenAlbum]  = useState(null); // only one calendar popover open at a time
  const [dotDays, setDotDays]            = useState({});
  const [calYear, setCalYear]            = useState(new Date().getFullYear());
  const [calMonth, setCalMonth]          = useState(new Date().getMonth() + 1);
  const isMobile = useIsMobile();
  const [tycData, setTycData] = useState(null);
  useEffect(() => {
    const load = () => api.thankYouCardsByMachine().then(setIfChanged(setTycData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
     return () => clearInterval(t);
}, []);

  useEffect(() => {
    const load = () => api.printingBreakdown().then(setIfChanged(setData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  function toggleMachine(mKey) {
    setExpMachine(prev => prev === mKey ? null : mKey);
    setExpAlbum(null);
    setCalOpenAlbum(null);
  }

  function cacheKeyFor(machine, at, date, page) {
    return `${machine}-${at}-${date || "month"}-${page}`;
  }

  async function loadJobs(machine, at, date, page) {
    const key = cacheKeyFor(machine, at, date, page);
    setJobsCache(c => ({ ...c, [key]: "loading" }));
    try {
      const res = at === "THANKYOU"
        ? await api.thankYouCards(machine, date, page)
        : await api.printingJobsList(machine, at, date, page);
      setJobsCache(c => ({ ...c, [key]: res }));
   } catch {
      setJobsCache(c => ({ ...c, [key]: "error" }));
  }
}

  function openAlbum(albumKey, machine, at) {
    if (expandedAlbum === albumKey) { setExpAlbum(null); setCalOpenAlbum(null); return; }
    setExpAlbum(albumKey);
    setCalOpenAlbum(null);
    const date = dateByAlbum[albumKey] ?? null;
    const page = pageByAlbum[albumKey] ?? 1;
    loadJobs(machine, at, date, page);
  }

  function selectDate(albumKey, machine, at, date) {
    setDateByAlbum(d => ({ ...d, [albumKey]: date }));
    setPageByAlbum(p => ({ ...p, [albumKey]: 1 }));
    setCalOpenAlbum(null);
    loadJobs(machine, at, date, 1);
  }

  function selectThisMonth(albumKey, machine, at) {
    setDateByAlbum(d => ({ ...d, [albumKey]: null }));
    setPageByAlbum(p => ({ ...p, [albumKey]: 1 }));
    setCalOpenAlbum(null);
    loadJobs(machine, at, null, 1);
  }

  function changePage(albumKey, machine, at, newPage) {
    setPageByAlbum(p => ({ ...p, [albumKey]: newPage }));
    const date = dateByAlbum[albumKey] ?? null;
    loadJobs(machine, at, date, newPage);
  }

  function openCalendar(albumKey, machine, at) {
  const isOpen = calOpenAlbum === albumKey;
  setCalOpenAlbum(isOpen ? null : albumKey);
  if (!isOpen) {
    const now = new Date();
    setCalYear(now.getFullYear());
    setCalMonth(now.getMonth() + 1);
    const fetcher = at === "THANKYOU"
      ? api.thankYouCardDates(now.getFullYear(), now.getMonth() + 1, machine)
      : api.printingJobsDates(machine, at, now.getFullYear(), now.getMonth() + 1);
    fetcher.then(setDotDays).catch(() => setDotDays({}));
  }
}

function calNav(machine, at, y, m) {
  setCalYear(y); setCalMonth(m);
  const fetcher = at === "THANKYOU"
    ? api.thankYouCardDates(y, m, machine)
    : api.printingJobsDates(machine, at, y, m);
  fetcher.then(setDotDays).catch(() => setDotDays({}));
}

  return (
    <div style={{
      background: "#a8a5a5", border: "1px solid #8f8c8c",
      borderRadius: 12, padding: "14px 16px", marginBottom: 16,
      gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 6 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: "#111" }}>Printing Section - By Machine</div>
        <div style={{ fontSize: 11, color: "#444" }}>tap a machine, then an album type</div>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "20px 0", color: "#333", fontSize: 13 }}>LOADING…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRINTING_MACHINES.map(m => {
            const isMOpen = expandedMachine === m.key;
            const dailyTotal   = m.albumTypes.reduce((s, at) => s + (data.daily[at]?.machines[m.key]   || 0), 0);
            const monthlyTotal = m.albumTypes.reduce((s, at) => s + (data.monthly[at]?.machines[m.key] || 0), 0);

            return (
              <div key={m.key} style={{ background: "#e6e6e6", borderLeft: "4px solid #111", borderRadius: 8, overflow: "hidden" }}>
                <button onClick={() => toggleMachine(m.key)} style={{
                  width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "14px 18px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 8,
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronDown size={16} style={{ color: "#444", transition: "transform .2s ease", transform: isMOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                    <span style={{ fontSize: 15, fontWeight: 800, color: "#111" }}>{m.label}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#333", letterSpacing: ".08em" }}>Today</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#3c24a5" }}>{dailyTotal}</div>
                    </div>
                    <div style={{ width: 1, background: "#bbb" }} />
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 11, color: "#333", letterSpacing: ".08em" }}>Monthly</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#2ECC71" }}>{monthlyTotal}</div>
                    </div>
                  </div>
                </button>

                {isMOpen && (
                  <div className="si" style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {m.albumTypes.map(at => {
                      const albumKey = `${m.key}-${at}`;
                      const isAOpen  = expandedAlbum === albumKey;
                      const d        = data.daily[at]?.machines[m.key]   || 0;
                      const mo       = data.monthly[at]?.machines[m.key] || 0;
                      const selDate  = dateByAlbum[albumKey] ?? null;
                      const page     = pageByAlbum[albumKey] ?? 1;
                      const result   = jobsCache[cacheKeyFor(m.key, at, selDate, page)];
                      const isCalOpen = calOpenAlbum === albumKey;

                      return (
                        <div key={at} style={{ background: "#f2f2f2", border: "1px solid #ccc", borderRadius: 6, overflow: "hidden" }}>
                          <button onClick={() => openAlbum(albumKey, m.key, at)} style={{
                            width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                            padding: "10px 14px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 8,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <ChevronDown size={13} style={{ color: "#555", transition: "transform .2s ease", transform: isAOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#111" }}>{ALBUM_TYPE_LABELS[at]}</span>
                            </div>
                            <div style={{ display: "flex", gap: 16 }}>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "#555", letterSpacing: ".1em" }}>TODAY</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: "#3c24a5" }}>{d}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "#555", letterSpacing: ".1em" }}>MONTHLY</div>
                                <div style={{ fontSize: 15, fontWeight: 800, color: "#2ECC71" }}>{mo}</div>
                              </div>
                            </div>
                          </button>

                          {isAOpen && (
                            <div className="si" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>

                              {/* ── Date controls ── */}
                              <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                <button onClick={() => selectThisMonth(albumKey, m.key, at)} style={{
                                  padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4,
                                  background: !selDate ? "#2ECC71" : "#ddd",
                                  color: !selDate ? "#fff" : "#333",
                                }}>This Month</button>

                                <button onClick={() => openCalendar(albumKey, m.key, at)} style={{
                                  padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4,
                                  background: selDate ? "#3c24a5" : "#ddd",
                                  color: selDate ? "#fff" : "#333",
                                  display: "flex", alignItems: "center", gap: 5,
                                }}>
                                  <Calendar size={12} />
                                  {selDate ? new Date(selDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "Pick a day"}
                                </button>
                              </div>

                              {isCalOpen && (
                                <div style={{ width: "100%", maxWidth: 260 }}>
                                  <EntryCalendar
                                    year={calYear} month={calMonth}
                                    onYearMonth={(y, mo2) => calNav(m.key, at, y, mo2)}
                                    dotDays={dotDays}
                                    selectedDate={selDate || ""}
                                    onSelect={dt => selectDate(albumKey, m.key, at, dt)}
                                    accent="#3c24a5"
                                  />
                                </div>
                              )}

                              {/* ── Job list ── */}
                              {result === "loading" && <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>Loading…</div>}
                              {result === "error"   && <div style={{ fontSize: 12, color: "#b91c1c", padding: "6px 0" }}>Failed to load jobs.</div>}
                              {result && result !== "loading" && result !== "error" && (
                                <>
                                  <div style={{ fontSize: 11, color: "#555" }}>
                                    {result.total} job{result.total !== 1 ? "s" : ""} {selDate ? `on ${selDate}` : "this month"}
                                  </div>
                                  {result.jobs.length === 0 ? (
                                    <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>No jobs found.</div>
                                  ) : (
                                    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                                      {result.jobs.map((j, i) => (
                                        <div key={i} style={{
                                          display: "flex", justifyContent: "space-between", alignItems: "center",
                                          background: "#fff", border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px",
                                        }}>
                                          <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{j.job_no}</span>
                                          <span style={{ fontSize: 12, color: "#333" }}>{j.customer}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                  {result.pages > 1 && (
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                                      <button onClick={() => changePage(albumKey, m.key, at, Math.max(1, page - 1))} disabled={page === 1} style={{
                                        padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700,
                                      }}>◀ Prev</button>
                                      <span style={{ fontSize: 11, color: "#333" }}>{page} / {result.pages}</span>
                                      <button onClick={() => changePage(albumKey, m.key, at, Math.min(result.pages, page + 1))} disabled={page === result.pages} style={{
                                        padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700,
                                      }}>Next ▶</button>
                                    </div>
                                  )}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {m.hasThankYou && (() => {
  const at = "THANKYOU";
  const albumKey = `${m.key}-${at}`;
  const isAOpen  = expandedAlbum === albumKey;
  const d        = tycData?.daily?.[m.key]?.quantity   || 0;
  const mo       = tycData?.monthly?.[m.key]?.quantity || 0;
  const selDate  = dateByAlbum[albumKey] ?? null;
  const page     = pageByAlbum[albumKey] ?? 1;
  const result   = jobsCache[cacheKeyFor(m.key, at, selDate, page)];
  const isCalOpen = calOpenAlbum === albumKey;
  const jobList = result && result !== "loading" && result !== "error" ? (result.jobs || result.cards || []) : [];

  return (
    <div key="THANKYOU" style={{ background: "#fff7e6", border: "1px solid #e0c080", borderRadius: 6, overflow: "hidden" }}>
      <button onClick={() => openAlbum(albumKey, m.key, at)} style={{
        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 14px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 8,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <ChevronDown size={13} style={{ color: "#7a4e00", transition: "transform .2s ease", transform: isAOpen ? "rotate(180deg)" : "rotate(0deg)" }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: "#7a4e00" }}>Thank You Cards</span>
        </div>
        <div style={{ display: "flex", gap: 16 }}>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#7a4e00", letterSpacing: ".1em" }}>TODAY</div><div style={{ fontSize: 15, fontWeight: 800, color: "#3c24a5" }}>{d}</div></div>
          <div style={{ textAlign: "right" }}><div style={{ fontSize: 9, color: "#7a4e00", letterSpacing: ".1em" }}>MONTHLY</div><div style={{ fontSize: 15, fontWeight: 800, color: "#2ECC71" }}>{mo}</div></div>
        </div>
      </button>

      {isAOpen && (
        <div className="si" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            <button onClick={() => selectThisMonth(albumKey, m.key, at)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4, background: !selDate ? "#2ECC71" : "#ddd", color: !selDate ? "#fff" : "#333" }}>This Month</button>
            <button onClick={() => openCalendar(albumKey, m.key, at)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 4, background: selDate ? "#3c24a5" : "#ddd", color: selDate ? "#fff" : "#333", display: "flex", alignItems: "center", gap: 5 }}>
              <Calendar size={12} /> {selDate ? new Date(selDate + "T00:00:00").toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : "Pick a day"}
            </button>
          </div>

          {isCalOpen && (
            <div style={{ width: "100%", maxWidth: 260 }}>
              <EntryCalendar year={calYear} month={calMonth} onYearMonth={(y, mo2) => calNav(m.key, at, y, mo2)}
                dotDays={dotDays} selectedDate={selDate || ""} onSelect={dt => selectDate(albumKey, m.key, at, dt)} accent="#3c24a5" />
            </div>
          )}

          {result === "loading" && <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>Loading…</div>}
          {result === "error"   && <div style={{ fontSize: 12, color: "#b91c1c", padding: "6px 0" }}>Failed to load.</div>}
          {result && result !== "loading" && result !== "error" && (
            <>
              <div style={{ fontSize: 11, color: "#7a4e00" }}>{result.total} card{result.total !== 1 ? "s" : ""} {selDate ? `on ${selDate}` : "this month"}</div>
              {jobList.length === 0 ? (
                <div style={{ fontSize: 12, color: "#555", padding: "6px 0" }}>No thank you cards found.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 260, overflowY: "auto" }}>
                  {jobList.map((c, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fff", border: "1px solid #ddd", borderRadius: 4, padding: "6px 10px" }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#111" }}>{c.customer}</span>
                      <span style={{ fontSize: 12, color: "#333" }}>×{c.quantity} · Rs.{c.total_price}</span>
                    </div>
                  ))}
                </div>
              )}
              {result.pages > 1 && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 4 }}>
                  <button onClick={() => changePage(albumKey, m.key, at, Math.max(1, page - 1))} disabled={page === 1} style={{ padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>◀ Prev</button>
                  <span style={{ fontSize: 11, color: "#333" }}>{page} / {result.pages}</span>
                  <button onClick={() => changePage(albumKey, m.key, at, Math.min(result.pages, page + 1))} disabled={page === result.pages} style={{ padding: "4px 10px", background: "#ddd", color: "#333", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>Next ▶</button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
})()}

                  </div>
                )}
              </div>
            );
          })}

            </div>
          )}
        </div>
      );
    }

function PrintingSectionPanel() {
  const [data, setData] = useState(null);
  const isMobile = useIsMobile();
  useEffect(() => {
  const load = () => api.printingSection().then(setIfChanged(setData)).catch(() => {});
  load();
  const t = setInterval(load, POLL_INTERVAL_MS);
  return () => clearInterval(t);
}, []);

  const rows = [
    { key: "normal",         label: "Magazine Prints",  accent: "var(--text-pri)" },
    { key: "story",          label: "Story Albums",   accent: "var(--text-pri)" },
    { key: "rebind",         label: "Rebinds",        accent: "var(--text-pri)" },
  ];

  const m = data?.monthly || {};
  const d = data?.daily   || {};

  return (
    <div
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--border)",
        borderRadius: 16,
        padding: 20,
        boxShadow: "0 8px 30px rgba(0,0,0,0.20)",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 18,
        }}
      >
        <div
          style={{
            fontSize: 18,
            fontWeight: 700,
            color:"var(--text-pri)",
            fontFamily: "var(--fd)",
            letterSpacing: ".04em",
            textShadow: "var(--title-shadow)",
          }}
        >
          Printing Section
        </div>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "24px 0", color:"var(--text-pri)", fontFamily: "var(--fd)", fontSize: 13, letterSpacing: ".08em" }}>
          LOADING…
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {rows.map((r) => (
            <div
              key={r.key}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                background: "var(--surface-sunken)",
                border: "1px solid var(--border-strong)",
                borderLeft: `5px solid ${r.accent}`,
                borderRadius: 12,
                padding: isMobile ? "10px 12px" : "14px 18px",
                transition: ".25s",
              }}
            >
              {/* Metric name */}
              <div>
                <div
                  style={{
                    color: r.accent,
                    fontWeight: 700,
                    fontSize: 15,
                    letterSpacing: ".05em",
                  }}
                >
                  {r.label}
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "flex", gap: isMobile ? 14 : 28 }}>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12,fontweight:700 ,color: "var(--text-pri)", letterSpacing:isMobile ? ".08em" : ".2em" }}>
                    Today
                  </div>
                  <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 700, color: "#3c24a5" }}>
                    {d[r.key] ?? 0}
                  </div>
                </div>

                <div style={{ width: 1, background: "var(--border-strong)" }} />

                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 12, fontweight:700,color: "var(--text-pri)",letterSpacing:".2em"}}>
                    Monthly
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 700, color: "#2ECC71" }}>
                    {m[r.key] ?? 0}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DamageSummaryPanel() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(null); // "PRINTING" | "LAMINATING" | "BINDING" | null
  const isMobile = useIsMobile();
  useEffect(() => {
    const load = () => api.damageStats().then(setIfChanged(setData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const rows = [
    { key: "PRINTING",   label: "Printing",   accent: "var(--blue)"  },
    { key: "LAMINATING", label: "Laminating", accent: "var(--cyan)"  },
    { key: "BINDING",    label: "Binding",    accent: "var(--green)" },
  ];

  const SIZE_ORDER = ["9x13", "10x16", "12x16", "13x19"];

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 16px", gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000, letterSpacing: ".1em",
          textTransform: "uppercase", color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Paper Damage Summary
        </span>
        <button onClick={() => navigate("/damages")} style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5,
          background: "var(--bg3)", color: "var(--red)", border: "1px solid var(--red)",
        }}>View All →</button>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: 13, letterSpacing: ".08em" }}>LOADING…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--red)33", borderTop: "3px solid var(--red)", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".06em" }}>Today's Loss</div>
              <div style={{ fontFamily: "var(--fd)", fontSize: isMobile ? 26 : 32, fontWeight: 900, color: "var(--red)" }}>Rs. {data.daily.total_value}</div>
              <div style={{ fontSize: 12, color: "var(--text-pri)" }}>{data.daily.total_quantity} sheets</div>
            </div>
            <div style={{ background: "var(--bg2)", border: "1px solid var(--amber)33", borderTop: "3px solid var(--amber)", borderRadius: 8, padding: "14px 16px" }}>
              <div style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".06em" }}>Monthly Loss</div>
              <div style={{ fontFamily: "var(--fd)", fontSize: isMobile ? 26 : 32, fontWeight: 900, color: "var(--amber)" }}>Rs. {data.monthly.total_value}</div>
              <div style={{ fontSize: 12, color: "var(--text-pri)" }}>{data.monthly.total_quantity} sheets</div>
            </div>
          </div>

          <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: ".08em", marginTop: 2 }}>
            tap a department for paper size breakdown
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {rows.map(r => {
              const monthly = data.monthly.by_department[r.key] || { quantity: 0, value: 0, by_size: {} };
              const daily   = data.daily.by_department[r.key]   || { quantity: 0, value: 0, by_size: {} };
              const isOpen  = expanded === r.key;
              const sizeKeys = [
                ...new Set([...Object.keys(monthly.by_size), ...Object.keys(daily.by_size)]),
              ].sort((a, b) => {
                const ia = SIZE_ORDER.indexOf(a), ib = SIZE_ORDER.indexOf(b);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
              });

              return (
                <div key={r.key} style={{
                  background: "var(--surface-sunken)", border: "1px solid var(--border-strong)",
                  borderLeft: `4px solid ${r.accent}`, borderRadius: 6, overflow: "hidden",
                }}>
                  <button
                    onClick={() => setExpanded(isOpen ? null : r.key)}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                      padding: "8px 12px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <ChevronDown size={14} style={{
                        color: "var(--text-dim)", transition: "transform .2s ease",
                        transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0,
                      }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.accent, textTransform: "uppercase", letterSpacing: ".06em" }}>
                        {r.label}
                      </span>
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--text-pri)" }}>
                      Rs. {monthly.value} <span style={{ fontSize: 12, color: "var(--text-pri)", fontWeight: 600, letterSpacing: "0.1em" }}>({monthly.quantity} sheets)</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="si" style={{ padding: "0 12px 10px", display: "flex", flexDirection: "column", gap: 6 }}>
                      {sizeKeys.length === 0 ? (
                        <div style={{ fontSize: 12, color: "var(--text-dim)", padding: "4px 0" }}>No damage recorded for this department.</div>
                      ) : sizeKeys.map(size => {
                        const mSize = monthly.by_size[size] || { quantity: 0, value: 0 };
                        const dSize = daily.by_size[size]   || { quantity: 0, value: 0 };
                        return (
                          <div key={size} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            background: "var(--bg2)", border: "1px solid var(--border)",
                            borderRadius: 6, padding: "7px 12px", marginLeft: isMobile ? 0 : 20,
                          }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-sec)" }}>{size}</span>
                            <div style={{ display: "flex", gap: 16 }}>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".12em" }}>TODAY</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-pri)" }}>{dSize.quantity} sh · Rs.{dSize.value}</div>
                              </div>
                              <div style={{ textAlign: "right" }}>
                                <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".12em" }}>MONTHLY</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>{mSize.quantity} sh · Rs.{mSize.value}</div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function PaperStockSummaryPanel() {
  const [data, setData] = useState(null);
  const isMobile = useIsMobile();
  useEffect(() => {
    const load = () => api.paperStockStats().then(setIfChanged(setData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 16px", gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000, letterSpacing: ".1em",
          textTransform: "uppercase", color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Print - Paper Stock Summary
        </span>
        <button onClick={() => navigate("/papers")} style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5,
          background: "var(--bg3)", color: "var(--blue)", border: "1px solid var(--blue)",
        }}>View All →</button>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: 13, letterSpacing: ".08em" }}>LOADING…</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          {PAPER_SIZES.map(size => {
            const balance = data.balances[size] ?? 0;
            const used    = data.monthly_used[size] ?? 0;
            const low     = balance <= LOW_STOCK_THRESHOLD;
            return (
              <div key={size} className={low ? "blink" : ""} style={{
                background: low ? "var(--danger-bg)" : "var(--surface-sunken)",
                border: `1px solid ${low ? "var(--red)" : "var(--border-strong)"}`,
                borderLeft: `4px solid ${low ? "var(--red)" : "var(--blue)"}`,
                borderRadius: 8, padding: "12px 14px",
              }}>
                <div style={{ fontSize: 12, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".06em" }}>{size}</div>
                <div style={{ fontFamily: "var(--fd)", fontSize: 24, fontWeight: 900, color: low ? "var(--red)" : "var(--text-pri)", marginTop: 4 }}>{balance}</div>
                <div style={{ fontSize: 12, color: "var(--text-pri)" }}>left · {used} used this month</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function PaperUsageBreakdownPanel() {
  const [data, setData] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const load = () => apiFetch(`/api/stats/paper-usage-breakdown`).then(setIfChanged(setData)).catch(() => {});
    load();
    const t = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, []);

  const TYPE_LABELS = {
    ok_pages: "OK Pages", print_damage: "Print Damage",
    accu_rp: "Accu RP", bind_rp: "Bind RP",
  };

  return (
    <div style={{
      background: "var(--card-bg)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "14px 16px", gridColumn: isMobile ? "1" : "1 / -1",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <span style={{
          fontFamily: "var(--fd)", fontSize: 14, fontWeight: 1000, letterSpacing: ".1em",
          textTransform: "uppercase", color: "var(--text-pri)", textShadow: "var(--title-shadow)",
        }}>
          Paper Usage Summary
        </span>
        <button onClick={() => navigate("/papers")} style={{
          padding: "5px 12px", fontSize: 11, fontWeight: 700, borderRadius: 5,
          background: "var(--bg3)", color: "var(--blue)", border: "1px solid var(--blue)",
        }}>View All →</button>
      </div>

      {!data ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: 13, letterSpacing: ".08em" }}>LOADING…</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ fontSize: 10, color: "var(--text-dim)", letterSpacing: ".08em", marginBottom: 6 }}>
            tap a size for usage-type breakdown
          </div>
          {PAPER_SIZES.map(size => {
            const d = data.daily[size]   || { total: 0, ok_pages: 0, print_damage: 0, accu_rp: 0, bind_rp: 0 };
            const m = data.monthly[size] || { total: 0, ok_pages: 0, print_damage: 0, accu_rp: 0, bind_rp: 0 };
            const isOpen = expanded === size;

            return (
              <div key={size} style={{
                background: "var(--surface-sunken)", border: "1px solid var(--border-strong)",
                borderLeft: "4px solid var(--blue)", borderRadius: 6, overflow: "hidden",
              }}>
                <button
                  onClick={() => setExpanded(isOpen ? null : size)}
                  style={{
                    width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", background: "transparent", textAlign: "left", flexWrap: "wrap", gap: 8,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <ChevronDown size={14} style={{
                      color: "var(--text-dim)", transition: "transform .2s ease",
                      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", flexShrink: 0,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--blue)", letterSpacing: ".05em" }}>{size}</span>
                  </div>
                  <div style={{ display: "flex", gap: 20 }}>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "var(--text-pri)", letterSpacing: ".15em" }}>TODAY</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#3c24a5" }}>{d.total}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 10, color: "var(--text-pri)", letterSpacing: ".15em" }}>MONTHLY</div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "#2ECC71" }}>{m.total}</div>
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="si" style={{ padding: "0 14px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                    {Object.keys(TYPE_LABELS).map(tk => (
                      <div key={tk} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        background: "var(--bg2)", border: "1px solid var(--border)",
                        borderRadius: 6, padding: "7px 12px", marginLeft: isMobile ? 0 : 20,
                      }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text-sec)" }}>{TYPE_LABELS[tk]}</span>
                        <div style={{ display: "flex", gap: 16 }}>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".12em" }}>TODAY</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-pri)" }}>{d[tk]}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 9, color: "var(--text-dim)", letterSpacing: ".12em" }}>MONTHLY</div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--amber)" }}>{m[tk]}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
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
    
    const todayStr = slDateStr(new Date());
    const todayDone = c.filter(job => {
      const completedAt = job.completed_at ?? job.updated_at;
      if (!completedAt) return false;
      return slDateStr(parseUTC(completedAt)) === todayStr;
    });

    setIfChanged(setActive)(a);
    setIfChanged(setDone)(todayDone);
    setIfChanged(setStats)(s);
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
      <div style={{ background: "var(--card-bg)", border: "1px solid var(--border)", borderRadius: 10, padding: isMobile ? "12px 14px" : "14px 18px", textAlign: "center" }}>
        <div className="r-stat-num" style={{ fontFamily: "var(--fd)", fontSize: isMobile ? 30 : 40, fontWeight: 900, color: clr, lineHeight: 1,textShadow: 'var(--title-shadow)',minHeight: "1.2em", }}>{val ?? "—"}</div>
        <div style={{ fontSize: isMobile ? 13 : 11, color: "var(--text-pri)", textTransform: "uppercase", letterSpacing: ".08em", marginTop: 4, fontWeight: 800 }}>{label}</div>
        {sub && !isMobile && <div style={{ fontSize: 11, color: "#dbd9d9", marginTop: 2,letterSpacing: ".08em" }}>{sub}</div>}
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
 
        <DeptTotalsPanel addToast={add} />
                      
 
        {/* Intelligence row — side-by-side on desktop, stacked on mobile */}
        <div className="r-grid-intelligence" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
          <BottleneckRadar active={active} />
          <DailyGoalRing   active={active} done={done} />
          <PrintingMachineBreakdownPanel /> 
          <AlbumCountPanel />
          <DamageSummaryPanel />
          <PaperStockSummaryPanel />
          <PaperUsageBreakdownPanel />
          <OperatorStatsPanel />
        </div>
 
        {/* Throughput ticker */}
        <div style={{ marginBottom: 16 }}>
          <ThroughputTicker done={done} />
        </div>

        {/* <div className="r-grid-stats" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
          <Stat label="Active Jobs"     val={stats?.active_jobs}    clr="var(--amber)" />
          <Stat label="Completed (24h)" val={stats?.completed_jobs} clr="var(--green)" sub="Auto-clears after 24 h" />
          <Stat label="Delayed"         val={stats?.delayed_jobs}   clr={stats?.delayed_jobs > 0 ? "var(--red)" : "var(--text-sec)"} />
        </div> */}

                {/* Urgent banner */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
  
          {stats?.urgent_pending > 0 && (
            <div
              className="pulse"
              style={{
                background: "var(--danger-bg)",
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
                <JobCardFull job={job} showExpiry={tab === "done"} addToast={add} />
                <button onClick={() => del(job)} title="Delete" style={{
                  position: "absolute", top: 12, right: 12,
                  background: "var(--overlay)", color: "var(--red)",
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

function HistoryList({ data, loading, search, selectedDate, fmtDate, fmtTime, setPrintJob, page, setPage, addToast }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {loading && <div style={{ textAlign: "center", padding: "40px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", letterSpacing: ".08em" }}>LOADING…</div>}
      {!loading && data?.jobs?.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "var(--text-dim)", fontFamily: "var(--fd)", fontSize: 14, letterSpacing: ".06em" }}>
          NO COMPLETED JOBS {search ? "MATCHING SEARCH" : `ON ${fmtDate(selectedDate + "T00:00:00")}`}
        </div>
      )}
      {!loading && data?.jobs?.map(job => (
        <HistoryCard key={job.id} job={job} fmtDate={fmtDate} fmtTime={fmtTime} onPrint={() => setPrintJob(job)} addToast={addToast} />
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
  const [machineFilter, setMachineFilter] = useState(""); 
  const [albumTypeFilter, setAlbumTypeFilter] = useState("");
  const [open, setOpen] = useState(false);
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
    if (machineFilter)   params.set("machine", machineFilter);
    if (albumTypeFilter) params.set("album_type", albumTypeFilter);
    apiFetch(`/api/history?${params}`)
      .then(d => { setData(d); setLoading(false); })
      .catch(err => { add(err.message, "error"); setLoading(false); });
  }, [selectedDate, debouncedSearch, machineFilter, albumTypeFilter, page]);
 
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
  const fmtTime = iso => parseUTC(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
 
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

              <select value={machineFilter} onChange={e => { setMachineFilter(e.target.value); setPage(1); }} style={{ margin: 0 }}>
                <option value="">All Machines</option>
                {MACHINES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>

              <select value={albumTypeFilter} onChange={e => { setAlbumTypeFilter(e.target.value); setPage(1); }} style={{ margin: 0 }}>
                <option value="">All Album Types</option>
                {ALBUM_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
              </select>
            {search && <button onClick={() => { setSearch(""); setPage(1); }} style={{ fontSize: 12, color: "var(--red)", textAlign: "left" }}>Clear search</button>}
            {showCal && <MiniCalendar />}
            {data && (
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--text-dim)" }}>{search ? "matching jobs" : selectedLabel}</span>
                <span style={{ fontFamily: "var(--fd)", fontSize: 24, fontWeight: 900, color: "var(--cyan)" }}>{data.total}</span>
              </div>
            )}
            <HistoryList data={data} loading={loading} search={search} selectedDate={selectedDate} fmtDate={fmtDate} fmtTime={fmtTime} setPrintJob={setPrintJob} page={page} setPage={setPage} addToast={add} />
          </div>
        ) : (
          /* Desktop: sidebar + list */
          <div className="r-history-layout" style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 16, alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <MiniCalendar />
              <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginBottom: 6 }}>Search</div>
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Job no / Studio / Couple…" style={{ margin: 0 }} />
                {search && <button onClick={() => { setSearch(""); setPage(1); }} style={{ marginTop: 6, fontSize: 12, color: "var(--red)", width: "100%", textAlign: "center" }}>✕ Clear</button>}

                <div
                  style={{
                    position: "relative",
                    width: "100%",
                    marginTop: 10,
                  }}
                >
                  <select
                    value={machineFilter}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setOpen(false)}
                    onChange={(e) => {
                      setMachineFilter(e.target.value);
                      setPage(1);
                      setOpen(false);
                    }}
                    style={{
                      width: "100%",
                      paddingRight: "40px",
                      appearance: "none",
                      WebkitAppearance: "none",
                      MozAppearance: "none",
                    }}
                  >
                    <option value="">All Machines</option>
                    {MACHINES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <ChevronDown
                    size={18}
                    style={{
                      position: "absolute",
                      right: 12,
                      top: "50%",
                      transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`,
                      transition: "transform 0.2s ease",
                      pointerEvents: "none",
                      color: "#888",
                    }}
                  />
                </div>

                <select
                  value={albumTypeFilter}
                  onChange={e => { setAlbumTypeFilter(e.target.value); setPage(1); }}
                  style={{ marginTop: 8 }}
                >
                  <option value="">All Album Types</option>
                  {ALBUM_TYPES.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                </select>
              </div>
              {data && (
                <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 8, padding: 12 }}>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", textTransform: "uppercase", letterSpacing: ".1em", fontWeight: 700, marginBottom: 8 }}>Results</div>
                  <div style={{ fontFamily: "var(--fd)", fontSize: 32, fontWeight: 900, color: "var(--cyan)", lineHeight: 1 }}>{data.total}</div>
                  <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                    {search ? "matching jobs" : `completed on ${fmtDate(selectedDate + "T00:00:00")}`}
                  </div>
                </div>
              )}
            </div>
           <HistoryList data={data} loading={loading} search={search} selectedDate={selectedDate} fmtDate={fmtDate} fmtTime={fmtTime} setPrintJob={setPrintJob} page={page} setPage={setPage} addToast={add} />
          </div>
        )}
      </Shell>
      {printJob && <PrintJobCardModal job={printJob} onClose={() => setPrintJob(null)} />}
      <ToastStack toasts={toasts} />
    </>
  );
}
// ── History card ──────────────────────────────────────────────────────────────
function HistoryCard({ job, fmtDate, fmtTime, onPrint, addToast }) {
  const [expanded, setExpanded] = useState(false);
  const isMobile    = useIsMobile();
  const totalMinutes = job.logs?.filter(l => l.duration_minutes).reduce((s, l) => s + l.duration_minutes, 0) || 0;
  const hadDelay     = job.logs?.some(l => l.is_delayed);
 
  return (
    <div style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden", borderLeft: hadDelay ? "4px solid var(--red)" : "4px solid var(--green)" }}>
      <div onClick={() => setExpanded(p => !p)} style={{ padding: "12px 14px", cursor: "pointer" }}>
        <div className="r-history-card-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--fm)", fontSize: 22, color: "var(--amber)", fontWeight: 800, minWidth: isMobile ? 70 : 90, flexShrink: 0 }}>{job.job_no}</span>
          <div style={{ flex:1, minWidth: 0,display:"inline-flex",gap:15 }}>
            <div style={{fontSize:19, fontWeight: 700, color: "var(--text-pri)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{job.customer}</div>
            {job.couple_name && <div style={{ fontSize: 14, color: "var(--text-sec)",marginTop :"5px" }}>{job.couple_name}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <AlbumTypeBadge type={job.album_type} />   {/* ADD */}
            <span style={{ fontSize: 9, padding: "2px 7px", borderRadius: 4, fontWeight: 700, background: hadDelay ? "var(--danger-bg)" : "var(--success-bg)", color: hadDelay ? "var(--red)" : "var(--green)", border: `1px solid ${hadDelay ? "var(--red)" : "var(--green)"}` }}>{hadDelay ? "LATE" : "✓"}</span>
            {totalMinutes > 0 && !isMobile && (
              <span style={{ fontSize: 13, color: "var(--text-pri)", fontFamily: "var(--fm)" }}>{Math.floor(totalMinutes/60)}h{totalMinutes%60}m</span>
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
            {job.box_pouch_status && (
            <Chip
                label="Box/Pouch"
                value={job.box_pouch_status === "COMPLETE" ? "Complete" : "Processing"}
                accent={job.box_pouch_status === "COMPLETE" ? "#22c55e" : "#f59e0b"}
              />
            )}
          </div>
          <PaymentField job={job} addToast={addToast} />
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
    ["Laminating",  job.status_laminating],
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
     <div class="job-no">${job.job_no}${job.priority === "URGENT" ? '<span class="urgent">🔥 URGENT</span>' : ""}</div>
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
  const isMobile = useIsMobile();
  function doPrint() {
    const win = window.open("", "_blank", "width=800,height=600");
    win.document.write(buildPrintHTML(job));
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const days = Math.ceil((new Date(job.dele_date) - new Date()) / 86400000);

  return (
     <div style={{ position: "fixed", inset: 0, background: "var(--overlay)", display: "flex", alignItems: isMobile ? "flex-end" : "center", justifyContent: "center", zIndex: 9000 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: "var(--bg1)", border: "1px solid var(--border)", borderRadius: isMobile ? "16px 16px 0 0" : 12, padding: 24, width: "100%", maxWidth: 520, maxHeight: isMobile ? "92dvh" : "90vh", overflowY: "auto", display: "flex", flexDirection: "column", gap: 16 }}>
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
  if (page === "track") return <TrackPage />;
 
  return (
    <AppearanceProvider>
      <GlobalResponsiveStyles />
      {page === "entry"     ? <EntryPage /> :
       page === "station"   ? <StationPage deptKey={dept} /> :
       page === "damages"   ? <DamagesPage deptKey={dept} /> :
       page === "papers"    ? <PapersPage /> :
       page === "history"   ? <HistoryPage /> :
       page === "date-fix"  ? <AdminDateFixPage /> :
       <DashboardPage />}
    </AppearanceProvider>
  );
}