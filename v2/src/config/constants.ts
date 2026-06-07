// ─── Notion Database IDs ─────────────────────────────
export const NOTION_DB = {
  USERS: "36620e0684b98051a190e51d38d97288",
  ROLES: "36720e0684b9807aba20c1c3d0536c09",
  GROUPS: "36620e0684b9800e9a57df46019a03e0",
  COMMENTS: "36920e0684b980a19fdbd27302a65feb",
  CONFIG: "36b20e0684b9807aa115df0bb6b36517",
  USER_CONFIG: "37320e0684b9806b84ecc4aae906f645",
  SUBGROUPS: "36c20e0684b9800db6afe60707a87df7",
  VERSIONS: "36f20e0684b98004b283ec713d3cde8a",
  PRODUCTS: "36c20e0684b980b7984bc6c5751a1057",
  LOG: "36c20e0684b98030b292c088101e8184",
} as const;

// ─── SupportPlus API ─────────────────────────────────
export const SP_API = "https://macropayapi.supportplus.mx/tickets/web";
export const SP_SESSION_API =
  "https://macropay.supportplus.mx/api/auth/session";

// ─── SP Ticket Statuses (fixed IDs) ──────────────────
export const SP_STATUSES = {
  ASIGNADO: 1,
  EN_VALIDACION: 2,
  EN_ATENCION: 3,
  POR_APROBADOR: 4,
  POR_EJECUTAR: 5,
  POR_REVISAR: 6,
  EN_APLICACIONES: 7,
  POR_CONFIRMAR: 8,
  CERRADO: 9,
  RECHAZADO: 10,
  CANCELADO: 11,
  REABIERTO: 35,
} as const;

// ─── Monday Status Mapping (SP name -> Monday index) ─
export const MONDAY_STATUS_MAP: Record<string, number> = {
  cerrado: 1,
  asignado: 0,
  "en atención": 0,
  "en espera": 5,
  estancado: 2,
};

export const mapStatusToMonday = (statusName: string): number => {
  return MONDAY_STATUS_MAP[statusName.toLowerCase()] ?? 5;
};

// ─── Priority Mapping ────────────────────────────────
export const PRIORITY_MAP: Record<string, number> = {
  critico: 10,
  alto: 110,
  medio: 109,
  bajo: 7,
};

// ─── Month Names ─────────────────────────────────────
export const MONTH_NAMES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

// ─── Status Colors ───────────────────────────────────
export const STATUS_BG_COLORS: Record<string, string> = {
  Asignado: "rgba(33,150,243,0.18)",
  "En validación": "rgba(156,39,176,0.18)",
  "En atención": "rgba(255,152,0,0.18)",
  "Por aprobador": "rgba(121,85,72,0.18)",
  "Por ejecutar": "rgba(0,150,136,0.18)",
  "Por revisar": "rgba(63,81,181,0.18)",
  "En aplicaciones": "rgba(233,30,99,0.18)",
  "Por confirmar": "rgba(255,193,7,0.20)",
  Cerrado: "rgba(76,175,80,0.18)",
  Rechazado: "rgba(244,67,54,0.18)",
  Cancelado: "rgba(158,158,158,0.20)",
  Reabierto: "rgba(255,87,34,0.18)",
  "En espera": "rgba(255,235,59,0.20)",
};

export const STATUS_TEXT_COLORS: Record<string, string> = {
  Asignado: "#1565C0",
  "En validación": "#7B1FA2",
  "En atención": "#E65100",
  "Por aprobador": "#5D4037",
  "Por ejecutar": "#00796B",
  "Por revisar": "#283593",
  "En aplicaciones": "#C2185B",
  "Por confirmar": "#F9A825",
  Cerrado: "#2E7D32",
  Rechazado: "#C62828",
  Cancelado: "#616161",
  Reabierto: "#D84315",
  "En espera": "#F57F17",
};
