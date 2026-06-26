import axios, { AxiosError } from "axios"
import type {
  Account,
  ApiResponse,
  AuthStatus,
  CacheConfig,
  CacheRetentionConfig,
  EmbyProxy,
  CrossTransferRoute,
  CrossTransferTask,
  DriverInfo,
  FileEntry,
  IngestRun,
  IngestWorkflow,
  LogEntry,
  MediaOrganizeTask,
  NotificationItem,
  PluginInfo,
  StrmTask,
  SystemConfig,
  UploadTask,
} from "@/types/api"

export const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
})

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiResponse>) => {
    const url = error.config?.url || ""
    if (error.response?.status === 401 && !url.includes("/auth/login") && !url.includes("/auth/status")) {
      if (window.location.pathname.startsWith("/admin")) {
        window.location.assign("/login")
      }
    }
    return Promise.reject(error)
  },
)

export function getMessage(error: unknown, fallback = "请求失败") {
  if (axios.isAxiosError<ApiResponse>(error)) {
    return error.response?.data?.message || error.message || fallback
  }
  if (error instanceof Error) return error.message
  return fallback
}

async function unwrap<T>(promise: Promise<{ data: ApiResponse<T> }>) {
  const response = await promise
  if (response.data && response.data.success === false) {
    throw new Error(response.data.message || "请求失败")
  }
  return response.data
}

export const authApi = {
  status: () => unwrap<AuthStatus>(api.get("/auth/status")),
  login: (payload: { username: string; password: string; remember: boolean }) => {
    const body = new FormData()
    body.append("username", payload.username)
    body.append("password", payload.password)
    body.append("remember", payload.remember ? "1" : "")
    return unwrap<AuthStatus>(api.post("/auth/login", body))
  },
  logout: () => unwrap(api.post("/auth/logout")),
  resetPassword: () => unwrap<{ expires_at?: number; remaining_seconds?: number; ttl_seconds?: number }>(api.post("/auth/reset-password")),
}

export const publicApi = {
  accounts: () => unwrap<Account[]>(api.get("/public/accounts")),
  systemConfig: () => unwrap<{ theme?: "light" | "dark" | "auto"; index_account_switch_mode?: string }>(api.get("/public/system-config")),
  cacheHitRate: () => unwrap<{ hit_rate: number }>(api.get("/public/cache/hit-rate")),
}

export const filesApi = {
  list: (params: { account_id: number; path?: string; force_refresh?: boolean }) => unwrap<FileEntry[]>(api.get("/files/list", { params })),
  createFolder: (payload: { account_id: number; path: string; name: string }) => {
    const body = new FormData()
    body.append("account_id", String(payload.account_id))
    body.append("path", payload.path)
    body.append("name", payload.name)
    return unwrap(api.post("/files/create-folder", body))
  },
  rename: (payload: { account_id: number; old_path: string; new_name: string }) => unwrap(api.put("/files/rename", payload)),
  delete: (payload: { account_id: number; file_ids: string[]; parent_id?: string }) => unwrap(api.delete("/files/delete", { data: payload })),
  move: (payload: Record<string, unknown>) => unwrap(api.post("/files/move", payload)),
  copy: (payload: Record<string, unknown>) => unwrap(api.post("/files/copy", payload)),
  refresh: (payload: { account_id: number; parent_id: string }) => unwrap(api.post("/files/refresh", payload)),
  folderSizes: (payload: Record<string, unknown>) => unwrap(api.post("/files/folder-sizes", payload)),
  upload: (payload: { account_id: number; path: string; files: FileList | File[] }) => {
    const body = new FormData()
    body.append("account_id", String(payload.account_id))
    body.append("path", payload.path)
    Array.from(payload.files).forEach((file) => body.append("files", file))
    return unwrap(api.post("/files/upload", body, { headers: { "Content-Type": "multipart/form-data" } }))
  },
  uploadTask: (payload: { account_id: number; path: string; file: File; relative_path?: string }) => {
    const body = new FormData()
    body.append("account_id", String(payload.account_id))
    body.append("path", payload.path)
    body.append("file", payload.file)
    if (payload.relative_path) body.append("relative_path", payload.relative_path)
    return unwrap<UploadTask>(api.post("/files/upload-task", body, { headers: { "Content-Type": "multipart/form-data" } }))
  },
  uploadTasks: () => unwrap<UploadTask[]>(api.get("/files/upload/tasks")),
  pauseUploadTask: (taskId: string) => unwrap(api.post(`/files/upload/tasks/${encodeURIComponent(taskId)}/pause`)),
  resumeUploadTask: (taskId: string) => unwrap(api.post(`/files/upload/tasks/${encodeURIComponent(taskId)}/resume`)),
  deleteUploadTask: (taskId: string, deleteFile = false) => unwrap(api.delete(`/files/upload/tasks/${encodeURIComponent(taskId)}`, { params: { delete_file: deleteFile } })),
  batchDeleteUploadTasks: (taskIds: string[]) => unwrap(api.post("/files/upload/tasks/batch-delete", { task_ids: taskIds })),
  previewText: (accountId: number, file: FileEntry) =>
    api.get(`/files/preview-text/${accountId}/${encodeURIComponent(file.id)}`, {
      params: { user_agent: navigator.userAgent },
      responseType: "text",
    }).then((response) => String(response.data || "")),
  downloadUrl: (accountId: number, file: FileEntry) =>
    `/api/files/download/${accountId}/${encodeURIComponent(file.id)}?user_agent=${encodeURIComponent(navigator.userAgent)}&file_name=${encodeURIComponent(file.name || "")}`,
  previewUrl: (accountId: number, file: FileEntry) =>
    `/api/files/download/${accountId}/${encodeURIComponent(file.id)}?user_agent=${encodeURIComponent(navigator.userAgent)}&preview=true&file_name=${encodeURIComponent(file.name || "")}`,
}

export const adminApi = {
  drivers: () => unwrap<Record<string, DriverInfo>>(api.get("/admin/drivers")),
  driverSchema: (driver: string) => unwrap(api.get(`/admin/drivers/${encodeURIComponent(driver)}/config-schema`)),
  accounts: () => unwrap<Account[]>(api.get("/admin/accounts")),
  account: (id: number) => unwrap<Account>(api.get(`/admin/accounts/${id}`)),
  accountAuthStatus: (id: number) => unwrap(api.get(`/admin/accounts/${id}/auth_status`)),
  refreshAccountAuth: (id: number) => unwrap(api.post(`/admin/accounts/${id}/refresh_auth`)),
  accountCapabilities: (id: number) => unwrap(api.get(`/admin/accounts/${id}/capabilities`)),
  createAccount: (payload: { name: string; driver_type: string; config: Record<string, unknown> }) => unwrap<Account>(api.post("/admin/accounts", payload)),
  updateAccount: (id: number, payload: Record<string, unknown>) => unwrap<Account>(api.put(`/admin/accounts/${id}`, payload)),
  deleteAccount: (id: number) => unwrap(api.delete(`/admin/accounts/${id}`)),
  toggleAccount: (id: number) => unwrap<Account>(api.post(`/admin/accounts/${id}/toggle`)),
  setDefaultAccount: (id: number) => unwrap<Account>(api.post(`/admin/accounts/${id}/set-default`)),
  testAccount: (id: number) => unwrap(api.post(`/admin/accounts/${id}/test`)),
  clearDownloadCache: (id: number) => unwrap(api.post(`/admin/accounts/${id}/clear-download-cache`)),
  qrLoginStart: (driverType: string) => unwrap(api.post("/admin/qr-login/start", { driver_type: driverType })),
  qrLoginStatus: (stateId: string, driverType: string) => unwrap(api.get(`/admin/qr-login/status/${encodeURIComponent(stateId)}`, { params: { driver_type: driverType } })),
  oauthQuickAuth: (driverType: string) => unwrap<{ oauth_url: string }>(api.get(`/oauth/quick-auth/${encodeURIComponent(driverType)}`)),
  oauthStart: (payload: Record<string, unknown>) => api.post("/oauth/start", payload).then((response) => response.data),
  oauthStatus: (sessionId: string) => api.get(`/oauth/status/${encodeURIComponent(sessionId)}`).then((response) => response.data),
  oauthConfirm: (sessionId: string) => api.post(`/oauth/confirm-received/${encodeURIComponent(sessionId)}`).then((response) => response.data),
  cacheConfig: () => unwrap<CacheConfig>(api.get("/admin/cache-config")),
  updateCacheConfig: (payload: Partial<CacheConfig>) => unwrap(api.post("/admin/update-cache-config", payload)),
  cacheStats: () => unwrap<Record<string, unknown>>(api.get("/admin/cache/stats")),
  cacheInfo: () => unwrap<Record<string, unknown>>(api.get("/admin/cache/info")),
  clearCache: () => unwrap(api.post("/admin/clear-cache")),
  systemConfig: () => unwrap<SystemConfig>(api.get("/admin/system-config")),
  updateCredentials: (payload: Record<string, unknown>) => unwrap(api.post("/admin/update-credentials", payload)),
  updateWebdavConfig: (payload: Record<string, unknown>) => unwrap(api.post("/admin/webdav-config", payload)),
  testFeishu: (payload: Record<string, unknown>) => unwrap(api.post("/admin/feishu/test", payload)),
  theme: (theme: "light" | "dark" | "auto") => unwrap(api.post("/admin/theme", { theme })),
  authSchedulerStatus: () => unwrap(api.get("/admin/auth/scheduler_status")),
  recalculateAuthScheduler: () => unwrap(api.post("/admin/auth/scheduler/recalculate")),
  dashboardAckErrors: () => unwrap(api.post("/admin/dashboard/ack-errors")),
  notifications: () => unwrap<NotificationItem[]>(api.get("/admin/notifications")),
  unreadCount: () => unwrap<{ count: number } | number>(api.get("/admin/notifications/unread-count")),
  markAllRead: () => unwrap(api.post("/admin/notifications/read-all")),
  markNotificationRead: (id: number) => unwrap(api.post(`/admin/notifications/${id}/read`)),
  deleteNotification: (id: number) => unwrap(api.delete(`/admin/notifications/${id}`)),
  logs: (params?: Record<string, unknown>) => api.get<LogEntry[]>("/logs/", { params }).then((response) => response.data),
  logStats: () => api.get<Record<string, unknown>>("/logs/stats").then((response) => response.data),
  logLevels: () => api.get<Array<{ value: number; name: string; emoji?: string }>>("/logs/levels").then((response) => response.data),
  logModules: () => api.get<Array<{ value: string; name: string; color?: string }>>("/logs/modules").then((response) => response.data),
  cleanupLogs: (days: number) => api.delete<{ message?: string; deleted?: number }>("/logs/cleanup", { params: { days } }).then((response) => response.data),
  deleteFilteredLogs: (params: Record<string, unknown>) => api.delete<{ message?: string; deleted?: number }>("/logs/filtered", { params }).then((response) => response.data),
  strmTasks: () => unwrap<StrmTask[]>(api.get("/admin/strm/tasks")),
  createStrmTask: (payload: Record<string, unknown>) => unwrap(api.post("/admin/strm/tasks", payload)),
  updateStrmTask: (id: number, payload: Record<string, unknown>) => unwrap(api.put(`/admin/strm/tasks/${id}`, payload)),
  deleteStrmTask: (id: number, deleteStrmFiles = false) => unwrap(api.delete(`/admin/strm/tasks/${id}`, { params: { delete_strm_files: deleteStrmFiles } })),
  toggleStrmTask: (id: number) => unwrap(api.post(`/admin/strm/tasks/${id}/toggle`)),
  runStrmTask: (id: number, mode = "auto") => unwrap(api.post(`/admin/strm/tasks/${id}/run`, null, { params: { mode } })),
  forceStopStrmTask: (id: number) => unwrap(api.post(`/admin/strm/tasks/${id}/force-stop`)),
  runAllStrmTasks: () => unwrap(api.post("/admin/strm/tasks/run-all")),
  strmBranches: (id: number) => unwrap(api.get(`/admin/strm/tasks/${id}/branches`)),
  createStrmBranch: (id: number, payload: Record<string, unknown>) => unwrap(api.post(`/admin/strm/tasks/${id}/branches`, payload)),
  updateStrmBranch: (taskId: number, branchId: number, payload: Record<string, unknown>) => unwrap(api.put(`/admin/strm/tasks/${taskId}/branches/${branchId}`, payload)),
  deleteStrmBranch: (taskId: number, branchId: number) => unwrap(api.delete(`/admin/strm/tasks/${taskId}/branches/${branchId}`)),
  strmSettings: () => unwrap<Record<string, unknown>>(api.get("/admin/strm/settings")),
  updateStrmSettings: (payload: Record<string, unknown>) => unwrap<Record<string, unknown>>(api.post("/admin/strm/settings", payload)),
  replaceStrmDomain: (newBaseUrl: string) => unwrap(api.post("/admin/strm/replace-domain", { new_base_url: newBaseUrl })),
  generateCurrentDirectoryStrm: (payload: Record<string, unknown>) => unwrap(api.post("/admin/strm/generate-current-directory", payload)),
  embyProxies: () => unwrap<EmbyProxy[]>(api.get("/admin/strm/emby-proxies")),
  createEmbyProxy: (payload: Record<string, unknown>) => unwrap(api.post("/admin/strm/emby-proxies", payload)),
  updateEmbyProxy: (id: number, payload: Record<string, unknown>) => unwrap(api.put(`/admin/strm/emby-proxies/${id}`, payload)),
  deleteEmbyProxy: (id: number) => unwrap(api.delete(`/admin/strm/emby-proxies/${id}`)),
  toggleEmbyProxy: (id: number) => unwrap(api.post(`/admin/strm/emby-proxies/${id}/toggle`)),
  testEmbyProxy: (id: number) => unwrap(api.post(`/admin/strm/emby-proxies/${id}/test`)),
  mediaTasks: () => unwrap<MediaOrganizeTask[]>(api.get("/admin/media-organize/tasks")),
  createMediaTask: (payload: Record<string, unknown>) => unwrap(api.post("/admin/media-organize/tasks", payload)),
  updateMediaTask: (id: string, payload: Record<string, unknown>) => unwrap(api.put(`/admin/media-organize/tasks/${id}`, payload)),
  deleteMediaTask: (id: string) => unwrap(api.delete(`/admin/media-organize/tasks/${id}`)),
  runMediaTask: (id: string) => unwrap(api.post(`/admin/media-organize/tasks/${id}/run`)),
  planMediaTask: (id: string) => unwrap(api.post(`/admin/media-organize/tasks/${id}/plan`)),
  applyMediaTask: (id: string) => unwrap(api.post(`/admin/media-organize/tasks/${id}/apply`)),
  stopMediaTask: (id: string) => unwrap(api.post(`/admin/media-organize/tasks/${id}/stop`)),
  mediaTaskPlan: (id: string) => unwrap(api.get(`/admin/media-organize/tasks/${id}/plan`)),
  mediaTaskLogs: (id: string) => unwrap(api.get(`/admin/media-organize/tasks/${id}/logs`)),
  mediaTaskProgress: (id: string) => unwrap(api.get(`/admin/media-organize/tasks/${id}/progress`)),
  updateMediaTaskPlanAction: (taskId: string, actionId: string, payload: Record<string, unknown>) => unwrap(api.put(`/admin/media-organize/tasks/${taskId}/plan/actions/${actionId}`, payload)),
  deleteMediaTaskPlanAction: (taskId: string, actionId: string) => unwrap(api.delete(`/admin/media-organize/tasks/${taskId}/plan/actions/${actionId}`)),
  batchDeleteMediaTaskPlanActions: (taskId: string, actionIds: string[]) => unwrap(api.post(`/admin/media-organize/tasks/${taskId}/plan/actions/batch-delete`, { action_ids: actionIds })),
  mediaSettings: () => unwrap<Record<string, unknown>>(api.get("/admin/media-organize/settings")),
  updateMediaSettings: (payload: Record<string, unknown>) => unwrap(api.put("/admin/media-organize/settings", payload)),
  testTmdb: (payload: Record<string, unknown>) => unwrap(api.post("/admin/media-organize/test-tmdb", payload)),
  cacheRetentionStats: () => unwrap(api.get("/cache-retention/stats")),
  cacheRetentionConfigs: () => unwrap<CacheRetentionConfig[]>(api.get("/cache-retention/configs")),
  cacheRetentionDefaults: () => unwrap(api.get("/cache-retention/defaults")),
  cacheRetentionAccounts: () => unwrap<Account[]>(api.get("/cache-retention/accounts")),
  cacheRetentionDirectories: (accountId: number, params?: Record<string, unknown>) => unwrap(api.get(`/cache-retention/accounts/${accountId}/directories`, { params })),
  createCacheRetention: (payload: Record<string, unknown>) => unwrap(api.post("/cache-retention/configs", payload)),
  updateCacheRetention: (id: number, payload: Record<string, unknown>) => unwrap(api.put(`/cache-retention/configs/${id}`, payload)),
  deleteCacheRetention: (id: number, clearCache = false) => unwrap(api.delete(`/cache-retention/configs/${id}`, { params: { clear_cache: clearCache } })),
  toggleCacheRetention: (id: number) => unwrap(api.post(`/cache-retention/configs/${id}/toggle`)),
  refreshCacheRetention: (id: number) => unwrap(api.post(`/cache-retention/configs/${id}/refresh`)),
  forceStopCacheRetention: (id: number) => unwrap(api.post(`/cache-retention/configs/${id}/force-stop`)),
  refreshAllCacheRetention: () => unwrap(api.post("/cache-retention/refresh-all")),
  plugins: () => unwrap<PluginInfo[]>(api.get("/plugins")),
  rescanPlugins: () => unwrap(api.post("/plugins/rescan")),
  togglePlugin: (pluginId: string, enabled: boolean) => unwrap(api.post(`/plugins/${encodeURIComponent(pluginId)}/toggle`, { enabled })),
  updatePluginConfig: (pluginId: string, config: Record<string, unknown>) => unwrap(api.put(`/plugins/${encodeURIComponent(pluginId)}/config`, { config })),
  executePluginAction: (pluginId: string, action: string, payload: Record<string, unknown> = {}) => unwrap(api.post(`/plugins/${encodeURIComponent(pluginId)}/actions/${encodeURIComponent(action)}`, { payload })),
  searchPlugins: (payload: Record<string, unknown>) => unwrap(api.post("/plugins/search", payload)),
  startPluginSearchJob: (payload: Record<string, unknown>) => unwrap(api.post("/plugins/search-jobs", payload)),
  pluginSearchJob: (jobId: string) => unwrap(api.get(`/plugins/search-jobs/${encodeURIComponent(jobId)}`)),
  cancelPluginSearchJob: (jobId: string) => unwrap(api.post(`/plugins/search-jobs/${encodeURIComponent(jobId)}/cancel`)),
  testPluginConnection: (pluginId: string) => unwrap(api.post(`/plugins/${encodeURIComponent(pluginId)}/test-connection`)),
  syncPlugin: (pluginId: string, force = true) => unwrap(api.post(`/plugins/${encodeURIComponent(pluginId)}/sync`, { force })),
  crossTransferRoutes: () => unwrap<CrossTransferRoute[]>(api.get("/cross-transfer/routes")),
  crossTransferScan: (payload: Record<string, unknown>) => unwrap(api.post("/cross-transfer/scan", payload)),
  crossTransferProbe: (payload: Record<string, unknown>) => unwrap(api.post("/cross-transfer/probe", payload)),
  crossTransferExecute: (payload: Record<string, unknown>) => api.post("/cross-transfer/execute", payload, { responseType: "text" }).then((response) => response.data),
  crossTransferRelayTasks: () => unwrap<CrossTransferTask[]>(api.get("/cross-transfer/relay/tasks")),
  deleteCrossTransferRelayTasks: (taskIds: string[]) => unwrap(api.post("/cross-transfer/relay/tasks/batch-delete", { task_ids: taskIds })),
  localFsBrowse: (params?: Record<string, unknown>) => unwrap(api.get("/admin/local-fs/browse", { params })),
  ingestWorkflows: () => unwrap<IngestWorkflow[]>(api.get("/admin/ingest/workflows")),
  ingestRuns: (params?: Record<string, unknown>) => unwrap<IngestRun[]>(api.get("/admin/ingest/runs", { params })),
  createIngestWorkflow: (payload: Record<string, unknown>) => unwrap(api.post("/admin/ingest/workflows", payload)),
  updateIngestWorkflow: (id: number, payload: Record<string, unknown>) => unwrap(api.put(`/admin/ingest/workflows/${id}`, payload)),
  deleteIngestWorkflow: (id: number) => unwrap(api.delete(`/admin/ingest/workflows/${id}`)),
  toggleIngestWorkflow: (id: number) => unwrap(api.post(`/admin/ingest/workflows/${id}/toggle`)),
  runIngestWorkflow: (id: number) => unwrap(api.post(`/admin/ingest/workflows/${id}/run`)),
}
