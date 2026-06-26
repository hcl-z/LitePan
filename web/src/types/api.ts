export interface ApiResponse<T = unknown> {
  success: boolean
  data: T
  message?: string
}

export interface AuthStatus {
  is_admin: boolean
  username?: string | null
  public_index_enabled?: boolean
  must_change_password?: boolean
  password_change_reason?: string
}

export interface DriverInfo {
  name: string
  display_name: string
  version?: string
  capabilities?: string[]
  description?: string
  author?: string
  card_color?: string
  card_name?: string
  card_logo?: string
  icon?: string
  auto_oauth?: number
  supports_qr_login?: number
}

export interface Account {
  id: number
  name: string
  driver_type: string
  driver_card_name?: string
  driver_card_color?: string
  driver_card_logo?: string
  is_active?: boolean
  is_default?: boolean
  sort_order?: number
  status?: string
  enabled?: boolean
  error_message?: string | null
  last_tested?: string | null
  config?: Record<string, unknown>
}

export interface FileEntry {
  id: string
  name: string
  path?: string
  size?: number
  is_dir: boolean
  modified?: string | null
  created?: string | null
  extra?: Record<string, unknown>
}

export interface UploadTask {
  task_id: string
  client_task_id?: string
  file_name?: string
  name?: string
  status?: string
  progress?: number
  uploaded?: number
  total?: number
  size?: number
  speed?: number
  message?: string
  error?: string
  account_id?: number
  account_name?: string
  path?: string
  target_path?: string
  relative_path?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface NotificationItem {
  id: number
  title: string
  message: string
  level: "info" | "warning" | "error" | string
  read: boolean
  action_label?: string
  action_route?: string
  created_at?: string
}

export interface LogEntry {
  id?: number
  timestamp?: string
  level?: number | string
  level_name?: string
  level_emoji?: string
  module?: string
  module_name?: string
  module_color?: string
  message?: string
  details?: string | Record<string, unknown> | null
  account_id?: string | null
  driver_name?: string | null
}

export interface ConfigField {
  name: string
  label?: string
  type?: string
  required?: boolean
  default?: unknown
  placeholder?: string
  description?: string
  options?: Array<{ label: string; value: unknown } | string>
  min?: number
  max?: number
  pairRow?: number
}

export interface CacheConfig {
  cache_enabled: boolean
  cache_ttl: number
  cache_persistence_enabled: boolean
  cache_persistence_interval_minutes: number
  cache_max_items: number
  cache_memory_limit_mb: number
}

export interface CacheRetentionConfig {
  id: number
  account_id: number
  parent_id: string
  path: string
  account_name?: string
  recursive?: boolean
  scan_depth?: number | null
  api_interval?: number
  refresh_interval?: number
  status?: string
  file_count?: number
  last_refresh?: string | null
  last_refresh_status?: string | null
  scanned_dirs?: number
  scanned_files?: number
  current_duration_ms?: number
  last_duration_ms?: number
  started_at?: string | null
  time_window_enabled?: boolean
  time_start?: string
  time_end?: string
  created_at?: string
}

export interface SystemConfig {
  admin_username: string
  session_timeout: number
  oauth_server_url: string
  public_index_enabled: boolean
  index_account_switch_mode: "dropdown" | "floating"
  admin_home_return_mode: "sidebar" | "top_icon" | "both"
  theme: "light" | "dark" | "auto"
  upload_task_concurrency: number
  log_retention_days: number
  auth_active_refresh_enabled: boolean
  feishu_bot_enabled: boolean
  feishu_app_id: string
  feishu_app_secret?: string
  feishu_app_secret_configured?: boolean
  feishu_allowed_chat_ids: string
  feishu_allowed_user_ids: string
  feishu_command_prefix: string
  must_change_password?: boolean
  password_change_reason?: string
  webdav_enabled: boolean
  webdav_smart_chunk_enabled: boolean
  webdav_chunk_size: number
  webdav_cache_enabled: boolean
}

export interface StrmTask {
  id: number
  name: string
  account_id: number
  account_name?: string
  parent_id: string
  path: string
  status?: string
  scan_mode?: string
  api_interval?: number
  scan_interval?: number
  extensions?: string
  exclude_dir_keywords?: string
  exclude_file_keywords?: string
  sync_metadata?: boolean
  branch_check_enabled?: boolean
  branch_count?: number
  is_scanning?: boolean
  is_queued?: boolean
  scanned_dirs?: number
  scanned_files?: number
  current_duration_ms?: number
  last_run_at?: string | null
  last_run_status?: string | null
  time_window_enabled?: boolean
  time_start?: string
  time_end?: string
  schedule_mode?: string
}

export interface MediaOrganizeTask {
  id: string
  task_name: string
  account_id: string
  config: Record<string, unknown>
  status?: string
  last_run_at?: string | null
  last_run_result?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export interface IngestStep {
  type: "refresh" | "organize" | "strm" | "notify" | string
  name?: string
  order?: number
  enabled?: boolean
  on_error?: "stop" | "continue" | string
  timeout_seconds?: number
  params?: Record<string, unknown>
}

export interface IngestWorkflow {
  id: number
  name: string
  enabled: boolean
  trigger_type?: string
  trigger_config?: Record<string, unknown>
  steps: IngestStep[]
  debounce_seconds?: number
  created_at?: string
  updated_at?: string
}

export interface IngestRun {
  id: number
  workflow_id?: number | null
  source?: string
  status?: string
  started_at?: string
  finished_at?: string | null
  summary?: Record<string, unknown>
  error_message?: string | null
}

export interface EmbyProxy {
  id: number
  name?: string
  proxy_name?: string
  emby_url?: string
  server_url?: string
  enabled?: boolean
  status?: string
  token?: string
  path_mapping?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export interface PluginInfo {
  id?: string
  name?: string
  version?: string
  author?: string
  description?: string
  enabled?: boolean
  status?: string
  config?: Record<string, unknown>
  config_schema?: ConfigField[] | Record<string, ConfigField>
  actions?: Array<string | { name?: string; label?: string; description?: string }>
  [key: string]: unknown
}

export interface CrossTransferRoute {
  id: string
  method?: string
  method_label?: string
  bidirectional?: boolean
  from?: { id?: string; name?: string; logo?: string }
  to?: { id?: string; name?: string; logo?: string }
  [key: string]: unknown
}

export interface CrossTransferTask {
  id?: string
  task_id?: string
  name?: string
  file_name?: string
  status?: string
  progress?: number
  speed?: number
  message?: string
  error?: string
  from?: string
  to?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}
