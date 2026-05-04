// ============================================
// TypeScript interfaces for SupportPlus APIs
// ============================================

export interface TicketListItem {
  id: number;
  uniqueCode: string;
  subject: string;
  description: string;
  requesterName: string;
  responsibleName: string | null;
  resolutionGroupId: number;
  resolutionGroupName: string;
  attentionChannelId: number;
  attentionChannelName: string;
  reportTypeId: number;
  reportTypeName: string;
  incidentPriorityId: number;
  incidentPriorityName: string;
  incidentPriorityColor: string;
  createdAt: string;
  readTime: string | null;
  slaColor: string;
  ticketStatusId: number;
  ticketStatusName: string;
  location: string;
  levelPosition: number;
  levelName: string;
  isTemp: boolean;
  isSubTicket: boolean;
}

export interface PaginatedResponse<T> {
  data: {
    totalElements: number;
    totalPages: number;
    size: number;
    content: T[];
    number: number;
    first: boolean;
    last: boolean;
    numberOfElements: number;
    empty: boolean;
  };
}

export interface TicketDetail {
  id: number;
  subject: string;
  description: string;
  uniqueCode: string;
  attentionChannel: { id: number; name: string };
  reportType: { id: number; name: string };
  resolutionGroup: { id: number; name: string };
  service: ServiceNode;
  level: { id: number; name: string };
  incidentPriority: { id: number; name: string; color: string };
  urgency: { id: number; name: string };
  impact: { id: number; name: string };
  ticketInfo: TicketRequester;
  ticketHolder: TicketHolder | null;
  ticketStatus: TicketStatus;
  ticketComments: TicketComment[];
  ticketAttachments: { attachments: TicketAttachment[] };
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
}

export interface ServiceNode {
  id: number;
  name: string;
  description: string;
  isActive: boolean;
  isService: boolean;
  parentId?: number;
  children: ServiceNode[];
}

export interface TicketRequester {
  id: number;
  fullName: string;
  email: string;
  phoneNumber: string;
  companyName: string;
  departmentName: string;
  location: string;
}

export interface TicketHolder {
  id: number;
  startTime: string;
  endTime: string | null;
  ticketHolderLog: {
    id: number;
    email: string;
    fullName: string;
    roleName: string;
    resolutionGroupName: string;
    serviceName: string;
  };
}

export interface TicketStatus {
  id: number;
  name: string;
  pauseServiceLevel: boolean;
  closeTicket: boolean;
  confirmByRequester: boolean;
  blockEdit: boolean;
  type: { id: number; name: string };
}

export interface TicketComment {
  id: number;
  content: string;
  email: string;
  fullName: string;
  createdAt: string;
  isInternal: boolean;
  attachments: TicketAttachment[];
}

export interface TicketAttachment {
  id: number;
  isInternal: boolean;
  file: {
    id: number;
    name: string;
    key: string;
    isTemp: boolean;
    urlMiniature?: string;
    createdAt: string;
  };
}

export interface Profile {
  profileId: number;
  profileFullName: string;
  roleName: string;
}

export interface ReassignBody {
  ticketCommentRequest?: { internal: boolean; content: string } | null;
  resolutionGroupId: number;
  serviceId: number | null;
  responsibleProfileId: number | null;
  resolutionGroup: { label: string; value: number };
}

export interface CloseTicketBody {
  nextTicketStatusId: number;
  ticketCommentRequest: { internal: boolean; content: string } | null;
}

export interface CommentBody {
  content: string;
  internal: boolean;
}

export interface SessionUser {
  name: string;
  email: string;
  image: string;
  token: string;
  userType: string;
  isSuperAdmin: boolean;
}

// Monday.com types
export interface MondayBoard {
  id: string;
  name: string;
  groups?: MondayGroup[];
}

export interface MondayGroup {
  id: string;
  title: string;
}

export interface MondayUser {
  id: string;
  name: string;
  email: string;
}
