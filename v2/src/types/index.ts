// ─── Notion Types ────────────────────────────────────
export interface NotionUser {
  name: string;
  role: string;
  roleName: string;
  groups: number[];
  profileId: number | null;
  active: boolean;
  canMigrate: boolean;
  canDragDrop: boolean;
  canReassignApp: boolean;
  canAddIAM: boolean;
  canShowLabels: boolean;
  canReopenTickets: boolean;
  canCommentClosed: boolean;
  canRejectTickets: boolean;
  btnDashboard: boolean;
  btnComments: boolean;
  btnReports: boolean;
  mondayWorkspaceId: string;
  mondayFolderId: string;
  notionPageId: string;
}

export interface UserConfig {
  pageId: string;
  blacklist: string[];
  onlyWithTickets: boolean;
}

export interface GroupMondayConfig {
  workspaceId: string;
  folderId: string;
  etiqueta: string;
}

export interface SuggestedComment {
  id: string;
  text: string;
  name: string;
}

// ─── SupportPlus API Types ───────────────────────────
export interface SPTicket {
  id: number;
  uniqueCode: string;
  subject: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  ticketStatus?: { id: number; name: string };
  ticketHolder?: { ticketHolderLog?: { fullName: string; email: string } };
  ticketInfo?: {
    fullName: string;
    email: string;
    departmentName: string;
    location: string;
  };
  resolutionGroup?: { id: number; name: string };
  incidentPriority?: { name: string };
  service?: { id: number; name: string };
  attentionChannel?: { name: string };
  reportType?: { name: string };
  ticketComments?: SPComment[];
  attachments?: SPAttachment[];
  participants?: { profileFullName: string; email: string }[];
}

export interface SPComment {
  id: number;
  content: string;
  fullName: string;
  email: string;
  createdAt: string;
  attachments?: { id: number; name: string }[];
}

export interface SPAttachment {
  file?: { id: number; name: string };
}

export interface SPProfile {
  profileId: number;
  profileFullName: string;
}

// ─── Monday Types ────────────────────────────────────
export interface MondayBoard {
  id: string;
  name: string;
  groups?: { id: string; title: string }[];
}

// ─── App State ───────────────────────────────────────
export interface AppState {
  email: string;
  userName: string;
  profileId: number | null;
  role: string;
  roleName: string;
  groups: number[];
  permissions: {
    canMigrate: boolean;
    canDragDrop: boolean;
    canReassignApp: boolean;
    canAddIAM: boolean;
    canShowLabels: boolean;
    canReopenTickets: boolean;
    canCommentClosed: boolean;
    canRejectTickets: boolean;
    btnDashboard: boolean;
    btnComments: boolean;
    btnReports: boolean;
  };
  userConfig: UserConfig;
  groupMondayConfig: Record<number, GroupMondayConfig>;
}
