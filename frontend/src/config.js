// ─── CONFIGURE THIS VALUE ─────────────────────────────────────
// ─────────────────────────────────────────────────────────────

const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const API_BASE = isLocal
  ? "http://localhost:8000"
  : "";

export const POLL_INTERVAL_MS = 4000;

export const APP_NAME = "i Lab Gampaha";

export const DEPARTMENTS = {
  printing:     "PRINTING",
  laminating:   "LAMINATING",
  laser_cutting: "LASER_CUTTING",   
  binding:      "BINDING",
};

export const TIMEOUT_MINUTES = {
  PRINTING:      1,
  LAMINATING:    60,
  LASER_CUTTING: 45,
  BINDING:       90,
};