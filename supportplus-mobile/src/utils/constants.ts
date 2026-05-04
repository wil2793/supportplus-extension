// ============================================
// Constants
// ============================================

export const SP_BASE_URL = "https://macropayapi.supportplus.mx";
export const SP_WEB_URL = "https://macropay.supportplus.mx";
export const SP_LOGIN_URL = "https://macropay.supportplus.mx/es/iniciar-sesion";
export const MONDAY_API_URL = "https://api.monday.com/v2";

export const RESOLUTION_GROUP_DBA = 19;
export const RESOLUTION_GROUP_APPS = 53;

export const STATUS_IDS = {
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
  EN_ESPERA: 34,
  REABIERTO: 35,
} as const;

export const STATUS_COLORS: Record<string, string> = {
  Asignado: "#2196F3",
  "En validación": "#9C27B0",
  "En atención": "#FF9800",
  "Por aprobador": "#795548",
  "Por ejecutar": "#009688",
  "Por revisar": "#3F51B5",
  "En aplicaciones": "#E91E63",
  "Por confirmar": "#FFC107",
  Cerrado: "#4CAF50",
  Rechazado: "#F44336",
  Cancelado: "#9E9E9E",
  Reabierto: "#FF5722",
  "En espera": "#FFEB3B",
};

export const STATUS_BG_COLORS: Record<string, string> = {
  Asignado: "rgba(33, 150, 243, 0.18)",
  "En validación": "rgba(156, 39, 176, 0.18)",
  "En atención": "rgba(255, 152, 0, 0.18)",
  "Por aprobador": "rgba(121, 85, 72, 0.18)",
  "Por ejecutar": "rgba(0, 150, 136, 0.18)",
  "Por revisar": "rgba(63, 81, 181, 0.18)",
  "En aplicaciones": "rgba(233, 30, 99, 0.18)",
  "Por confirmar": "rgba(255, 193, 7, 0.20)",
  Cerrado: "rgba(76, 175, 80, 0.18)",
  Rechazado: "rgba(244, 67, 54, 0.18)",
  Cancelado: "rgba(158, 158, 158, 0.20)",
  Reabierto: "rgba(255, 87, 34, 0.18)",
  "En espera": "rgba(255, 235, 59, 0.20)",
};

export const PRIORITY_MAP: Record<string, number> = {
  critico: 10,
  alto: 110,
  medio: 109,
  bajo: 7,
};

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

// IAMcitos - participantes fijos
export const IAM_PROFILES = [
  { id: 296, name: "Leyver Adair Vasquez Velasco" },
  { id: 126, name: "Carlos Alberto Lopez Mata" },
  { id: 128, name: "Crhistian Uziel Sanchez Alvarez" },
];

// Monday column IDs
export const MONDAY_COLUMNS = {
  DESCRIPTION: "descripci_n_mkn9e5f4",
  PERSON: "multiple_person_mm25nvfq",
  STATUS: "status",
  PRIORITY: "priority_mkn9kbe9",
  TIMELINE: "cronograma_mkn9hwe3",
  LINK: "link_mknkdctz",
  TICKET_CODE: "text_mm2c9nhc",
};
