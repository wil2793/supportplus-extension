// ============================================================
// SRC/TYPES/INDEX.TS - Shared TypeScript interfaces and types
// ============================================================

// ─── Chrome Extension message types ──────────────────────────

export type MessageType =
  | "sync"
  | "auth-login"
  | "api-get"
  | "api-post"
  | "api-put"
  | "api-delete"
  | "monday-query"
  | "proxy-fetch";

export interface ExtensionMessage {
  type: MessageType;
  endpoint?: string;
  body?: unknown;
  token?: string;
  accept?: string;
  query?: string;
  variables?: Record<string, unknown>;
  url?: string;
}

export interface ExtensionResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── SupportPlus API ──────────────────────────────────────────

export interface SpTicket {
  id: number;
  uniqueCode: string;
  subject: string;
  description: string;
  createdAt: string;
  ticketStatusName: string;
  ticketStatusId: number;
  requesterName: string;
  responsibleName?: string;
  incidentPriorityName?: string;
  incidentPriority?: { name: string };
  resolutionGroupId?: number;
  resolutionGroupName?: string;
  ticketHolder?: {
    ticketHolderLog?: {
      email: string;
      name?: string;
    };
  };
  ticketInfo?: {
    departmentName?: string;
  };
}

export interface SpProfile {
  profileId: number;
  profileFullName: string;
  email?: string;
}

export interface SpSessionData {
  user?: {
    email: string;
    name: string;
  };
}

// ─── User / Auth ──────────────────────────────────────────────

export interface UserData {
  name: string;
  email?: string;
  active: boolean;
  roleName?: string;
  groups: number[];
  profileId: number | null;
  idUsuario?: number;
  tokenMonday?: string;

  // Permissions
  canMigrate?: boolean;
  btnDashboard?: boolean;
  btnComments?: boolean;
  btnReports?: boolean;
  canReassignApp?: boolean;
  canAddIAM?: boolean;
  canShowLabels?: boolean;
  canReopenTickets?: boolean;
  canCommentClosed?: boolean;
  canRejectTickets?: boolean;
  canAddParticipant?: boolean;
  canAddProduct?: boolean;
  canAdelantar?: boolean;
  canGuardias?: boolean;
  canAddUserToGroup?: boolean;
}

export interface UsersMap {
  [email: string]: UserData;
}

// ─── Config / Storage ────────────────────────────────────────

export interface GroupInfo {
  id: number;
  name: string;
}

export interface WorkSchedule {
  horaEntrada: number;
  horaSalida: number;
  diaInicio: string;
  diaFinal: string;
}

export interface UserConfig {
  onlyWithTickets?: boolean;
  blacklist?: string[];
}

export interface SubgroupPerms {
  canReassignApp: boolean;
  canAddIAM: boolean;
  canShowLabels: boolean;
  canReopenTickets: boolean;
  canCommentClosed: boolean;
  canRejectTickets: boolean;
}

export interface GroupMondayConfig {
  [groupId: string]: {
    workspaceId?: string;
    boardId?: string;
    folderId?: string;
  };
}

// ─── Monday.com ───────────────────────────────────────────────

export interface MondayBoard {
  id: string;
  name: string;
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayUser {
  id: string;
  email: string;
}

export interface MondayItem {
  id: string;
  column_values?: Array<{ text: string }>;
}

export interface MondayItemsPage {
  cursor?: string;
  items: MondayItem[];
}

export interface MondayQueryResponse {
  boards?: Array<{
    id: string;
    name: string;
    groups?: MondayGroup[];
    items_page?: MondayItemsPage;
  }>;
  users?: MondayUser[];
  items_page_by_column_values?: MondayItemsPage;
  next_items_page?: MondayItemsPage;
  create_item?: { id: string };
  create_group?: { id: string };
  duplicate_board?: { board: { id: string } };
  change_multiple_column_values?: { id: string };
  delete_group?: { id: string };
}

export type MondayUsersMap = Record<string, string>; // email -> id

export interface MondayColumnValues {
  status?: { index: number };
  priority_mkn9kbe9?: { index: number };
  multiple_person_mm25nvfq?: {
    personsAndTeams: Array<{ id: number; kind: "person" }>;
  };
  cronograma_mkn9hwe3?: { from: string; to: string };
  link_mknkdctz?: { url: string; text: string };
  text_mm2c9nhc?: string;
  text_mm44vbfc?: string;
  descripci_n_mkn9e5f4?: { text: string };
  [key: string]: unknown;
}

// ─── SP Config shape ─────────────────────────────────────────

export interface SpConfig {
  API_URL: string;
  MONDAY_TICKET_COL_ID: string;
  MONDAY_PERSON_COL_ID: string;
  MONDAY_SUBITEMS_EXCLUDE: string;
  MONDAY_BASE_URL: string;
  MONDAY_BOARD_ID: string;
  MONDAY_WORKSPACE_ID: string;
  MONDAY_FOLDER_ID: string;
  MONDAY_BOARD_ETIQUETA: string;
  SP_API: string;
  SP_SEARCH_API: string;
  SP_SESSION_API: string;
  SP_PARTICIPANTS_API: string;
  APPS_GROUP: { id: number; label: string };
  IAM_PROFILES: number[];
  IAM_NAMES: string[];
  STATUS_MAP: Record<string, number>;
  MONTH_NAMES: string[];
  PRIORITY_MAP: Record<string, number>;
  SP_STATUSES: Record<string, number>;
  GROUP_INFO: GroupInfo[];
  STATUS_COLORS: Record<string, string>;
  STATUS_TEXT_COLORS: Record<string, string>;
}

// ─── Background API (our own backend) ────────────────────────

export interface BackendSyncData {
  usersMap: UsersMap;
  rolesList: unknown[];
  groupNames: Record<string, string>;
  suggestedComments: unknown[];
  config: {
    HorarioEntrada: string;
    HorarioSalida: string;
    DiaInicio: string;
    DiaFinal: string;
  };
  latestVersion: string;
  latestZipUrl: string;
  allVersions: unknown[];
}

export interface BackendLoginResponse {
  success: boolean;
  data: { token: string };
  error?: string;
}

export interface BackendUserConfigResponse {
  data?: {
    MostrarSoloConTickets: boolean;
    blacklist?: string[];
  };
}

// ─── Session state ────────────────────────────────────────────

export interface SessionState {
  userRole: "admin" | "usuario";
  userName: string;
  userEmail: string;
  profileId: number | null;
  groups: number[];
  teamArea: string;

  // Permissions
  btnDashboard: boolean;
  btnComments: boolean;
  btnReports: boolean;
  btnReassignApp: boolean;
  btnAddIAM: boolean;
  canShowLabels: boolean;
  canReopenTickets: boolean;
  canCommentClosed: boolean;
  canRejectTickets: boolean;
  canAddParticipant: boolean;
  canAddProduct: boolean;
  canAdelantar: boolean;
  canGuardias: boolean;
  canAddUserToGroup: boolean;
  canAddUserToRole: boolean;

  // Config
  userConfig: UserConfig;
  workSchedule: WorkSchedule;

  // Runtime
  versionBlocked: boolean;
  lastDropTime: number;
}

// ─── Component option types ───────────────────────────────────

export interface HeaderButtonOptions {
  id?: string;
  icon?: string;
  label?: string;
  color?: string;
  onClick?: (e: MouseEvent) => void;
}

export interface ModalOptions {
  maxWidth?: string;
  width?: string;
  height?: string;
  maxHeight?: string;
  scroll?: boolean;
  zIndex?: number;
  textAlign?: string;
  headerActions?: string;
  onClose?: () => void;
  closeOnBackdrop?: boolean;
  blur?: boolean;
  showHeader?: boolean;
  padding?: string;
  customClass?: string;
}

export interface CreateModalOptions {
  id?: string;
  title?: string;
  content?: string;
  options?: ModalOptions;
}

export interface ModalInstance {
  overlay: HTMLElement;
  modal: HTMLElement;
  body: HTMLElement;
  close: () => void;
}

// ─── Guardias ────────────────────────────────────────────────

export interface GuardiaEntry {
  id: number;
  date: string;
  name: string;
  userId: string;
}

export interface GuardiaSolicitud {
  FK_IdControlGuardiaSolicitado: number;
  FK_IdControlGuardiaSolicitante?: number;
  FK_IdUsuarioSolicitante?: number;
  [key: string]: unknown;
}

// ─── Pending close tickets ───────────────────────────────────

export interface PendingCloseTicket {
  ticket: string;
  ticketId: number;
  pageId: string;
}

// ─── Detection results (detail-view) ─────────────────────────

export interface DetectionResults {
  slCodes: string[];
  users: string[];
  dbObjects: string[];
}
