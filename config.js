// ============================================================
// CONFIG.JS - Centralized constants and configuration
// ============================================================

(function () {
  window.SP_CONFIG = {
    // API Base URL
    API_URL: "http://localhost:3500/api",

    // Monday.com
    MONDAY_TICKET_COL_ID: "text_mm2c9nhc",
    MONDAY_PERSON_COL_ID: "multiple_person_mm25nvfq",
    MONDAY_SUBITEMS_EXCLUDE: "Subelementos",
    MONDAY_BASE_URL: "https://macropay7.monday.com",
    MONDAY_BOARD_ID: "18402162782",
    MONDAY_WORKSPACE_ID: "9956268",
    MONDAY_FOLDER_ID: "16653587",
    MONDAY_BOARD_ETIQUETA: "Tickets DBA",

    // SupportPlus API
    SP_API: "https://macropayapi.supportplus.mx/tickets/web",
    SP_SEARCH_API:
      "https://macropayapi.supportplus.mx/tickets/search-all-tickets",
    SP_SESSION_API: "https://macropay.supportplus.mx/api/auth/session",
    SP_PARTICIPANTS_API:
      "https://macropayapi.supportplus.mx/ticket-participants/assign-visitor-participant",

    // Reasignación a Aplicaciones
    APPS_GROUP: { id: 53, label: "Soporte Aplicativos y Sistemas (general)" },

    // IAM participants (auto-add)
    IAM_PROFILES: [296, 126, 128],
    IAM_NAMES: [
      "Carlos Alberto Lopez Mata",
      "Crhistian Uziel Sanchez Alvarez",
      "Leyver Adair Vasquez Velasco",
    ],

    // Monday status mapping: SP status name -> Monday index
    STATUS_MAP: {
      cerrado: 1,
      asignado: 0,
      "en atención": 0,
      "en espera": 5,
      estancado: 2,
    },

    // Month names (Spanish)
    MONTH_NAMES: [
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
    ],

    // Priority mapping
    PRIORITY_MAP: { critico: 10, alto: 110, medio: 109, bajo: 7 },

    // SupportPlus ticket statuses (fixed, won't change)
    SP_STATUSES: {
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
    },

    // GROUP_INFO - Resolution groups from SupportPlus
    GROUP_INFO: [
      { id: 9, name: "Mesa de Ayuda" },
      { id: 10, name: "Soporte a Tiendas" },
      { id: 11, name: "Soporte Tecnico" },
      { id: 12, name: "Infraestructura IAM" },
      { id: 14, name: "SAP ABAP" },
      { id: 15, name: "SAP BASIS" },
      { id: 16, name: "SAP Funcional (Datos maestros)" },
      { id: 18, name: "Infraestructura (Cloud/ Servidores)" },
      { id: 19, name: "Infraestructura DBA" },
      { id: 20, name: "Infraestructura DevOps" },
      { id: 21, name: "Central de Monitoreo" },
      { id: 22, name: "Aplicaciones- Liberacion e Implementacion" },
      { id: 23, name: "Problemas" },
      { id: 24, name: "Ciberseguridad" },
      { id: 25, name: "Herramienta de Gestion" },
      { id: 26, name: "SAP Funcional (Modulo Banking - CML)" },
      { id: 27, name: "SAP Funcional (Modulo Compras)" },
      { id: 28, name: "SAP Funcional (Modulo Finanzas)" },
      { id: 29, name: "SAP Funcional (Modulo Garantias)" },
      { id: 30, name: "SAP Funcional (Modulo Logistico y Distribucion)" },
      { id: 31, name: "SAP Funcional (Modulo Presupuestos)" },
      { id: 32, name: "SAP Funcional (Modulo Comercial)" },
      { id: 33, name: "Salesforce Comunicaciones" },
      { id: 34, name: "Salesforce Funcional" },
      { id: 51, name: "Soporte Redes y Telecomunicaciones" },
      { id: 52, name: "Telefonia movil" },
      { id: 53, name: "Soporte Aplicativos y Sistemas (general)" },
      { id: 55, name: "Control Auditoria" },
      { id: 56, name: "Control Cadena Suministro" },
      { id: 57, name: "Control Cambaceo" },
      { id: 58, name: "Control Capital Humano" },
      { id: 59, name: "Centro de Servicios" },
      { id: 60, name: "Control CIAB" },
      { id: 61, name: "Control Cobranza" },
      { id: 62, name: "Control Comercial" },
      { id: 64, name: "Control Compras Internas" },
      { id: 65, name: "Control Cons/Mntto" },
      { id: 66, name: "Control Control Interno" },
      { id: 67, name: "Control Experiencia Cliente" },
      { id: 68, name: "Control Finanzas" },
      { id: 69, name: "Control Innovacion Crediticia" },
      { id: 70, name: "Control Juridico" },
      { id: 71, name: "Control Mercadotecnia" },
      { id: 72, name: "Control MNVO" },
      { id: 73, name: "Control Tiendas" },
      { id: 74, name: "control Transformacion Digital" },
      { id: 76, name: "Presupuestos TD" },
      { id: 77, name: "Activo Fijo" },
      { id: 78, name: "Mobile" },
      { id: 79, name: "Control Productos Prendarios" },
      { id: 80, name: "Categoría de inicio" },
      { id: 83, name: "Soporte office 365" },
      { id: 84, name: "Desarrollo" },
      { id: 85, name: "PMO" },
      { id: 86, name: "Desarrollo Organizacional" },
      { id: 87, name: "CANCELAR PR" },
      { id: 88, name: "Soporte a Tiendas - Interno" },
      { id: 89, name: "Viaticos" },
      { id: 90, name: "Compras Tecnologia" },
      { id: 91, name: "Compras Internas" },
    ],
  };

  // Helper: map SP status to Monday index
  window.mapStatusToMonday = function (statusName) {
    var s = (statusName || "").toLowerCase();
    return window.SP_CONFIG.STATUS_MAP[s] !== undefined
      ? window.SP_CONFIG.STATUS_MAP[s]
      : 5;
  };

  // Status colors (background for rows/cards)
  window.SP_CONFIG.STATUS_COLORS = {
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

  // Status colors (text for labels)
  window.SP_CONFIG.STATUS_TEXT_COLORS = {
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
})();
