/** Public, locale-independent HTTP paths shared by API discovery and UI clients. */
export const API_VERSION = "v1";
const API_BASE_PATH = `/api/${API_VERSION}`;
const AUTH_BASE_PATH = `${API_BASE_PATH}/auth`;
/** Relative paths consumed by Better Auth endpoint registration and hooks. */
export const AUTH_ENDPOINTS = {
  status: "/session-status", renew: "/renew-session", logout: "/hard-sign-out", logoutContext: "/logout-context-status",
} as const;

export const API_ROUTES = {
  root: API_BASE_PATH,
  auth: AUTH_BASE_PATH,
  productImage: `${API_BASE_PATH}/admin/products/{uuid}/image`,
  fileImage: `${API_BASE_PATH}/admin/files/{uuid}/image`,
  fileDownload: `${API_BASE_PATH}/admin/files/{uuid}/download`,
  fileUpload: `${API_BASE_PATH}/admin/files/upload`,
  chat: `${API_BASE_PATH}/chat`,
  chatAttachment: `${API_BASE_PATH}/chat/attachments/{uuid}`,
  ocrAnalyze: `${API_BASE_PATH}/ocr/analyze`,
  cases: `${API_BASE_PATH}/cases`,
  caseById: `${API_BASE_PATH}/cases/{uuid}`,
  caseDepartments: `${API_BASE_PATH}/cases/{uuid}/departments`,
  knowledgeMatch: `${API_BASE_PATH}/knowledge/match`,
  knowledgeInstitutions: `${API_BASE_PATH}/knowledge/institutions`,
  knowledgeTemplates: `${API_BASE_PATH}/knowledge/templates`,
  adminKnowledgeGraph: `${API_BASE_PATH}/admin/knowledge/graph`,
  adminKnowledgeIngest: `${API_BASE_PATH}/admin/knowledge/ingest`,
  session: {
    status: `${AUTH_BASE_PATH}${AUTH_ENDPOINTS.status}`,
    renew: `${AUTH_BASE_PATH}${AUTH_ENDPOINTS.renew}`,
    logout: `${AUTH_BASE_PATH}${AUTH_ENDPOINTS.logout}`,
  },
  health: {
    live: `${API_BASE_PATH}/health/live`,
    ready: `${API_BASE_PATH}/health/ready`,
  },
} as const;
