
const isLocal =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1";

export const API_BASE = isLocal
  ? "http://localhost:8000"
  : "";

export const POLL_INTERVAL_MS = 8000;

export const APP_NAME = "i Lab Gampaha";

export const DEPARTMENTS = {
  printing:     "PRINTING",
  laminating:   "LAMINATING",
  laser_cutting: "LASER_CUTTING",   
  binding:      "BINDING",
};
export const DAMAGE_DEPTS = ["PRINTING", "LAMINATING", "BINDING"];

export const MACHINES = [
  { value: "GREEN_2", label: "Green 2" },
  { value: "GREEN_3", label: "Green 3" },
  { value: "GREEN_3_NEW", label: "Green 4" },
  { value: "EPSON", label: "Epson" },
];

export const TIMEOUT_MINUTES = {
  PRINTING:     75,
  LAMINATING:    75,
  LASER_CUTTING: 45,
  BINDING:       90,
};

export const ALBUM_TYPES = [
  { value: "NORMAL", label: "Magazine Album" },
  { value: "STORY",  label: "Story Album" },
  { value: "REBIND", label: "Rebind Album" },
];

export const PAPER_SIZES = ["9x13", "10x16", "12x16", "13x16", "13x19"];
export const THANK_U_CARDS_SIZES =["4 x 6", "4 x 8", "4 x 10","5 x 7", "5 x 8", "6 x 8","6 x 9"]
export const LOW_STOCK_THRESHOLD = 5;



export const CORRECTABLE_DEPTS = [
  { value: "ENTRY",         label: "Entry" },
  { value: "PRINTING",      label: "Printing" },
  { value: "LASER_CUTTING", label: "Laser Cutting" },
  { value: "LAMINATING",    label: "Laminating" },
  { value: "BINDING",       label: "Binding" },
];

export const SHEETS_PER_PACKET = 100;

const ALL_DEPTS = [
  "ENTRY",
  "PRINTING",
  "LAMINATING",
  "LASER_CUTTING",
  "BINDING",
  "ADMIN",
];