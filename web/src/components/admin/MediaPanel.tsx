import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Check, Copy, Eye, Film, FileText, ListChecks, MoreHorizontal, Pencil, Plus, RefreshCw, Save, Square, Trash2, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { Account, EmbyProxy, MediaOrganizeTask, StrmTask } from "@/types/api"

const strmDefaults = {
  name: "",
  account_id: "",
  parent_id: "0",
  path: "/",
  scan_mode: "incremental_update",
  api_interval: 200,
  extensions: "",
  exclude_dir_keywords: "",
  exclude_file_keywords: "",
  sync_metadata: false,
  branch_check_enabled: false,
  time_window_enabled: false,
  time_start: "00:00",
  time_end: "00:00",
  schedule_mode: "window",
}

const mediaDefaults = {
  task_name: "",
  account_id: "",
  target_directory: "/",
  target_directory_id: "0",
  action_type: "move",
  target_root: "/",
  target_root_id: "0",
  media_type: "auto",
  rename_marker: "tmdb",
  use_ffprobe: false,
  use_tmdb: true,
  overwrite_existing: false,
  recursive: true,
}

const activeMediaStatuses = new Set(["running", "planning", "stopping"])

type MediaLogEntry = {
  time?: string
  message?: string
}

type MediaRunResult = {
  total?: number
  renamed?: number
  moved?: number
  skipped?: number
  failed?: number
  stopped?: boolean
  [key: string]: unknown
}

type MediaPlanAction = {
  id: string
  kind?: string
  source_name?: string
  target_name?: string
  source_parent_id?: string
  target_parent_id?: string
  reason?: string
  status?: string
  confidence?: number
  metadata?: Record<string, unknown>
  [key: string]: unknown
}

type MediaPlan = {
  actions?: MediaPlanAction[]
  skipped?: Array<Record<string, unknown>>
  diagnostics?: Record<string, unknown>
  [key: string]: unknown
}

export function MediaPanel() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [strmTasks, setStrmTasks] = useState<StrmTask[]>([])
  const [strmSettings, setStrmSettings] = useState<Record<string, unknown>>({})
  const [embyProxies, setEmbyProxies] = useState<EmbyProxy[]>([])
  const [mediaTasks, setMediaTasks] = useState<MediaOrganizeTask[]>([])
  const [mediaSettings, setMediaSettings] = useState<Record<string, unknown>>({})
  const [message, setMessage] = useState("")
  const [strmDialogOpen, setStrmDialogOpen] = useState(false)
  const [mediaDialogOpen, setMediaDialogOpen] = useState(false)
  const [editingStrm, setEditingStrm] = useState<StrmTask | null>(null)
  const [editingMedia, setEditingMedia] = useState<MediaOrganizeTask | null>(null)
  const [branchesTask, setBranchesTask] = useState<StrmTask | null>(null)
  const [planTask, setPlanTask] = useState<MediaOrganizeTask | null>(null)
  const [logsTask, setLogsTask] = useState<MediaOrganizeTask | null>(null)
  const [embyDialogOpen, setEmbyDialogOpen] = useState(false)
  const [editingEmby, setEditingEmby] = useState<EmbyProxy | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setMessage("")
    try {
      const [accountRes, tasksRes, settingsRes, embyRes, mediaRes, mediaSettingsRes] = await Promise.allSettled([
        adminApi.accounts(),
        adminApi.strmTasks(),
        adminApi.strmSettings(),
        adminApi.embyProxies(),
        adminApi.mediaTasks(),
        adminApi.mediaSettings(),
      ])
      if (accountRes.status === "fulfilled") setAccounts(accountRes.value.data || [])
      if (tasksRes.status === "fulfilled") setStrmTasks(tasksRes.value.data || [])
      if (settingsRes.status === "fulfilled") setStrmSettings((settingsRes.value.data || {}) as Record<string, unknown>)
      if (embyRes.status === "fulfilled") setEmbyProxies(embyRes.value.data || [])
      if (mediaRes.status === "fulfilled") setMediaTasks(mediaRes.value.data || [])
      if (mediaSettingsRes.status === "fulfilled") setMediaSettings((mediaSettingsRes.value.data || {}) as Record<string, unknown>)
    } catch (err) {
      const text = getMessage(err, "媒体信息加载失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const loadMediaTasks = async () => {
    try {
      const response = await adminApi.mediaTasks()
      setMediaTasks(response.data || [])
    } catch (err) {
      toast.error(getMessage(err, "媒体整理任务刷新失败"))
    }
  }

  const patchMediaTask = (taskId: string, patch: Partial<MediaOrganizeTask>) => {
    setMediaTasks((items) => items.map((item) => String(item.id) === String(taskId) ? { ...item, ...patch } : item))
    setLogsTask((current) => current && String(current.id) === String(taskId) ? { ...current, ...patch } : current)
  }

  const hasActiveMediaTask = mediaTasks.some((task) => isActiveMediaStatus(task.status))

  useEffect(() => {
    if (!hasActiveMediaTask) return
    const timer = window.setInterval(() => {
      void adminApi.mediaTasks().then((response) => setMediaTasks(response.data || [])).catch(() => undefined)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [hasActiveMediaTask])

  const action = async (runner: () => Promise<unknown>, ok = "操作完成") => {
    setMessage("")
    try {
      const response = await runner()
      const text = response && typeof response === "object" && "message" in response ? String((response as { message?: string }).message || ok) : ok
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err)
      setMessage(text)
      toast.error(text)
    }
  }

  const runMediaTask = async (task: MediaOrganizeTask) => {
    setLogsTask(task)
    patchMediaTask(task.id, { status: "planning" })
    try {
      const response = await adminApi.runMediaTask(task.id)
      toast.success(response.message || "任务已开始执行")
      await loadMediaTasks()
    } catch (err) {
      const text = getMessage(err, "启动失败")
      toast.error(text)
      await loadMediaTasks()
    }
  }

  const applyMediaPlanFromTable = async (task: MediaOrganizeTask) => {
    try {
      const response = await adminApi.applyMediaTask(task.id)
      toast.success(response.message || "计划已开始执行")
      setLogsTask(task)
      patchMediaTask(task.id, { status: "running" })
      await loadMediaTasks()
    } catch (err) {
      toast.error(getMessage(err, "执行计划失败"))
    }
  }

  const stopMediaTask = async (task: MediaOrganizeTask) => {
    setLogsTask(task)
    patchMediaTask(task.id, { status: "stopping" })
    try {
      const response = await adminApi.stopMediaTask(task.id)
      toast.info(response.message || "已请求停止")
      await loadMediaTasks()
    } catch (err) {
      toast.error(getMessage(err, "停止失败"))
      await loadMediaTasks()
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">媒体管理</h2>
          <p className="text-sm text-muted-foreground">STRM 生成、媒体整理、TMDB 和元数据同步任务。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="size-4" />刷新</Button>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric title="STRM 任务" value={strmTasks.length} />
        <Metric title="整理任务" value={mediaTasks.length} />
        <Metric title="STRM 基址" value={String(strmSettings.strm_base_url || "未设置")} small />
      </div>

      <Tabs defaultValue="strm">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="strm">STRM 任务</TabsTrigger>
          <TabsTrigger value="organize">媒体整理</TabsTrigger>
          <TabsTrigger value="strm-settings">STRM 设置</TabsTrigger>
          <TabsTrigger value="emby">Emby 代理</TabsTrigger>
          <TabsTrigger value="settings">媒体设置</TabsTrigger>
        </TabsList>

        <TabsContent value="strm" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">STRM 任务</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => action(() => adminApi.runAllStrmTasks(), "已触发全部 STRM 任务")}>全部执行</Button>
                <Dialog open={strmDialogOpen} onOpenChange={(open) => {
                  setStrmDialogOpen(open)
                  if (!open) setEditingStrm(null)
                }}>
                  <DialogTrigger asChild><Button><Plus className="size-4" />新建 STRM</Button></DialogTrigger>
                  <StrmTaskDialog accounts={accounts} task={editingStrm} onSaved={async (text) => {
                    setStrmDialogOpen(false)
                    setEditingStrm(null)
                    setMessage(text)
                    await load()
                  }} />
                </Dialog>
              </div>
            </CardHeader>
            <TaskTable
              tasks={strmTasks}
              onBranches={setBranchesTask}
              onDelete={async (task) => {
                const ok = await confirm({ title: "删除该 STRM 任务？", description: "可以在后续增强中选择是否同时删除 STRM 文件。", confirmText: "删除", destructive: true })
                if (ok) await action(() => adminApi.deleteStrmTask(task.id, false), "任务已删除")
              }}
              onEdit={(task) => {
                setEditingStrm(task)
                setStrmDialogOpen(true)
              }}
              onAction={action}
            />
          </Card>
        </TabsContent>

        <TabsContent value="organize" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">媒体整理任务</CardTitle>
              <Dialog open={mediaDialogOpen} onOpenChange={(open) => {
                setMediaDialogOpen(open)
                if (!open) setEditingMedia(null)
              }}>
                <DialogTrigger asChild><Button><Plus className="size-4" />新建整理任务</Button></DialogTrigger>
                <MediaTaskDialog accounts={accounts} task={editingMedia} onSaved={async (text) => {
                  setMediaDialogOpen(false)
                  setEditingMedia(null)
                  setMessage(text)
                  await load()
                }} />
              </Dialog>
            </CardHeader>
            <MediaTaskTable
              tasks={mediaTasks}
              onPlan={setPlanTask}
              onLogs={setLogsTask}
              onRun={runMediaTask}
              onApply={applyMediaPlanFromTable}
              onStop={stopMediaTask}
              onDelete={async (task) => {
                const ok = await confirm({ title: "删除该媒体整理任务？", confirmText: "删除", destructive: true })
                if (ok) await action(() => adminApi.deleteMediaTask(task.id), "任务已删除")
              }}
              onEdit={(task) => {
                setEditingMedia(task)
                setMediaDialogOpen(true)
              }}
            />
          </Card>
        </TabsContent>

        <TabsContent value="strm-settings" className="mt-4">
          <StrmSettings settings={strmSettings} onMessage={setMessage} onReload={load} />
        </TabsContent>

        <TabsContent value="emby" className="mt-4">
          <EmbyProxyPanel
            proxies={embyProxies}
            open={embyDialogOpen}
            editing={editingEmby}
            onOpenChange={(open) => {
              setEmbyDialogOpen(open)
              if (!open) setEditingEmby(null)
            }}
            onCreate={() => {
              setEditingEmby(null)
              setEmbyDialogOpen(true)
            }}
            onEdit={(proxy) => {
              setEditingEmby(proxy)
              setEmbyDialogOpen(true)
            }}
            onAction={action}
          />
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <MediaSettings settings={mediaSettings} onMessage={setMessage} onReload={load} />
        </TabsContent>
      </Tabs>

      <StrmBranchesDialog task={branchesTask} onOpenChange={(open) => !open && setBranchesTask(null)} />
      <MediaPlanDialog task={planTask} onOpenChange={(open) => !open && setPlanTask(null)} onApplied={(task) => {
        setPlanTask(null)
        setLogsTask(task)
        patchMediaTask(task.id, { status: "running" })
        void loadMediaTasks()
      }} />
      <MediaLogsDialog task={logsTask} onOpenChange={(open) => !open && setLogsTask(null)} onTaskPatch={patchMediaTask} />
    </div>
  )
}

function TaskTable({ tasks, onEdit, onBranches, onDelete, onAction }: { tasks: StrmTask[]; onEdit: (task: StrmTask) => void; onBranches: (task: StrmTask) => void; onDelete: (task: StrmTask) => void; onAction: (runner: () => Promise<unknown>, ok?: string) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>任务</TableHead>
          <TableHead className="w-40">账号</TableHead>
          <TableHead className="w-32">状态</TableHead>
          <TableHead className="w-44">扫描</TableHead>
          <TableHead className="w-14 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <div className="font-medium">{task.name}</div>
              <div className="text-xs text-muted-foreground">{task.path || "/"}，{scanModeText(task.scan_mode)}</div>
            </TableCell>
            <TableCell className="text-xs text-muted-foreground">{task.account_name || task.account_id}</TableCell>
            <TableCell><StatusBadge status={task.is_scanning ? "running" : task.status || "unknown"} /></TableCell>
            <TableCell className="text-xs text-muted-foreground">
              目录 {task.scanned_dirs || 0}，文件 {task.scanned_files || 0}
              {task.branch_count ? <div>分支 {task.branch_count}</div> : null}
            </TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onAction(() => adminApi.runStrmTask(task.id, "auto"), "已触发执行")}>立即执行</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction(() => adminApi.runStrmTask(task.id, "full"), "已触发全量执行")}>全量执行</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction(() => adminApi.toggleStrmTask(task.id), "状态已切换")}>{task.status === "running" ? "暂停" : "启用"}</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction(() => adminApi.forceStopStrmTask(task.id), "已请求停止")}><Square className="size-4" />强制停止</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onBranches(task)}>分支管理</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(task)}>修改配置</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(task)}>
                    <Trash2 className="size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
        {!tasks.length ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">尚未创建 STRM 任务</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  )
}

function MediaTaskTable({ tasks, onEdit, onPlan, onLogs, onRun, onApply, onStop, onDelete }: { tasks: MediaOrganizeTask[]; onEdit: (task: MediaOrganizeTask) => void; onPlan: (task: MediaOrganizeTask) => void; onLogs: (task: MediaOrganizeTask) => void; onRun: (task: MediaOrganizeTask) => void; onApply: (task: MediaOrganizeTask) => void; onStop: (task: MediaOrganizeTask) => void; onDelete: (task: MediaOrganizeTask) => void }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>任务</TableHead>
          <TableHead className="w-32">模式</TableHead>
          <TableHead className="w-32">状态</TableHead>
          <TableHead className="w-44">最近运行</TableHead>
          <TableHead className="w-14 text-right">操作</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {tasks.map((task) => (
          <TableRow key={task.id}>
            <TableCell>
              <div className="font-medium">{task.task_name}</div>
              <div className="text-xs text-muted-foreground">{String(task.config?.target_directory || "/")}</div>
            </TableCell>
            <TableCell><Badge variant="outline">{String(task.config?.action_type || "move")}</Badge></TableCell>
            <TableCell><StatusBadge status={task.status || "idle"} /></TableCell>
            <TableCell className="text-xs text-muted-foreground">{formatDateTime(task.last_run_at)}</TableCell>
            <TableCell className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onRun(task)}>直接执行</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onPlan(task)}><Eye className="size-4" />生成 / 查看计划</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onApply(task)}>应用计划</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onStop(task)}><Square className="size-4" />停止</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onLogs(task)}>查看日志</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(task)}>修改配置</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onDelete(task)}>
                    <Trash2 className="size-4" />
                    删除
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
        {!tasks.length ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">尚未创建媒体整理任务</TableCell></TableRow> : null}
      </TableBody>
    </Table>
  )
}

function StrmTaskDialog({ accounts, task, onSaved }: { accounts: Account[]; task: StrmTask | null; onSaved: (message: string) => void | Promise<void> }) {
  const [form, setForm] = useState(strmDefaults)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setForm(task ? {
      name: task.name || "",
      account_id: String(task.account_id || ""),
      parent_id: task.parent_id || "0",
      path: task.path || "/",
      scan_mode: task.scan_mode || "incremental_update",
      api_interval: task.api_interval || 200,
      extensions: task.extensions || "",
      exclude_dir_keywords: task.exclude_dir_keywords || "",
      exclude_file_keywords: task.exclude_file_keywords || "",
      sync_metadata: Boolean(task.sync_metadata),
      branch_check_enabled: Boolean(task.branch_check_enabled),
      time_window_enabled: Boolean(task.time_window_enabled),
      time_start: task.time_start || "00:00",
      time_end: task.time_end || "00:00",
      schedule_mode: task.schedule_mode || "window",
    } : { ...strmDefaults, account_id: accounts[0]?.id ? String(accounts[0].id) : "" })
  }, [task, accounts])

  const save = async () => {
    setMessage("")
    try {
      const payload = { ...form, account_id: Number(form.account_id), api_interval: Number(form.api_interval) }
      if (!payload.name.trim()) throw new Error("任务名称不能为空")
      const response = task ? await adminApi.updateStrmTask(task.id, payload) : await adminApi.createStrmTask(payload)
      await onSaved(response.message || "STRM 任务已保存")
    } catch (err) {
      setMessage(getMessage(err, "保存失败"))
    }
  }

  return (
    <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{task ? "修改 STRM 任务" : "新建 STRM 任务"}</DialogTitle>
        <DialogDescription>配置源目录、扫描方式、元数据同步和运行窗口。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="任务名称" value={form.name} onChange={(value) => setForm((prev) => ({ ...prev, name: value }))} />
        <SelectField label="账号" value={form.account_id} onChange={(value) => setForm((prev) => ({ ...prev, account_id: value }))} options={accounts.map((account) => [String(account.id), account.name])} />
        <div className="grid gap-2 md:col-span-2">
          <Label>源目录</Label>
          <FolderPicker
            accountId={form.account_id}
            value={{ id: form.parent_id, path: form.path }}
            title="选择 STRM 源目录"
            description="选择需要生成 STRM 文件的网盘目录。"
            onSelect={(folder) => setForm((prev) => ({ ...prev, parent_id: folder.id, path: folder.path }))}
          />
          <div className="text-xs text-muted-foreground">目录 ID：{form.parent_id || "0"}</div>
        </div>
        <SelectField label="扫描方式" value={form.scan_mode} onChange={(value) => setForm((prev) => ({ ...prev, scan_mode: value }))} options={[["incremental_update", "增量更新"], ["incremental_missing", "仅补缺失"], ["full_sync", "全量同步"]]} />
        <NumberField label="API 间隔（毫秒）" value={form.api_interval} min={0} max={5000} onChange={(value) => setForm((prev) => ({ ...prev, api_interval: value }))} />
        <TextField label="媒体扩展名" value={form.extensions} onChange={(value) => setForm((prev) => ({ ...prev, extensions: value }))} placeholder="留空使用默认" />
        <TextField label="排除目录关键词" value={form.exclude_dir_keywords} onChange={(value) => setForm((prev) => ({ ...prev, exclude_dir_keywords: value }))} />
        <TextField label="排除文件关键词" value={form.exclude_file_keywords} onChange={(value) => setForm((prev) => ({ ...prev, exclude_file_keywords: value }))} />
        <SelectField label="调度方式" value={form.schedule_mode} onChange={(value) => setForm((prev) => ({ ...prev, schedule_mode: value }))} options={[["window", "按窗口循环"], ["daily", "每日定时"]]} />
        <SwitchField label="同步元数据" checked={form.sync_metadata} onChange={(value) => setForm((prev) => ({ ...prev, sync_metadata: value }))} />
        <SwitchField label="启用分支检查" checked={form.branch_check_enabled} onChange={(value) => setForm((prev) => ({ ...prev, branch_check_enabled: value }))} />
        <SwitchField label="启用时间窗口" checked={form.time_window_enabled} onChange={(value) => setForm((prev) => ({ ...prev, time_window_enabled: value }))} />
        {form.time_window_enabled ? <>
          <TextField label="开始时间" type="time" value={form.time_start} onChange={(value) => setForm((prev) => ({ ...prev, time_start: value }))} />
          <TextField label="结束时间" type="time" value={form.time_end} onChange={(value) => setForm((prev) => ({ ...prev, time_end: value }))} />
        </> : null}
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <DialogFooter><Button onClick={save}>保存任务</Button></DialogFooter>
    </DialogContent>
  )
}

function MediaTaskDialog({ accounts, task, onSaved }: { accounts: Account[]; task: MediaOrganizeTask | null; onSaved: (message: string) => void | Promise<void> }) {
  const [form, setForm] = useState(mediaDefaults)
  const [message, setMessage] = useState("")

  useEffect(() => {
    const config = task?.config || {}
    setForm(task ? {
      ...mediaDefaults,
      task_name: task.task_name || "",
      account_id: String(task.account_id || ""),
      target_directory: String(config.target_directory || "/"),
      target_directory_id: String(config.target_directory_id || "0"),
      action_type: String(config.action_type || "move"),
      target_root: String(config.target_root || "/"),
      target_root_id: String(config.target_root_id || "0"),
      media_type: String(config.media_type || "auto"),
      rename_marker: String(config.rename_marker || "tmdb"),
      use_ffprobe: Boolean(config.use_ffprobe),
      use_tmdb: config.use_tmdb !== false,
      overwrite_existing: Boolean(config.overwrite_existing),
      recursive: config.recursive !== false,
    } : { ...mediaDefaults, account_id: accounts[0]?.id ? String(accounts[0].id) : "" })
  }, [task, accounts])

  const save = async () => {
    setMessage("")
    try {
      if (!form.task_name.trim()) throw new Error("任务名称不能为空")
      const response = task ? await adminApi.updateMediaTask(task.id, form) : await adminApi.createMediaTask(form)
      await onSaved(response.message || "媒体整理任务已保存")
    } catch (err) {
      setMessage(getMessage(err, "保存失败"))
    }
  }

  return (
    <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{task ? "修改媒体整理任务" : "新建媒体整理任务"}</DialogTitle>
        <DialogDescription>配置源目录、整理方式、目标根目录和识别策略。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="任务名称" value={form.task_name} onChange={(value) => setForm((prev) => ({ ...prev, task_name: value }))} />
        <SelectField label="账号" value={form.account_id} onChange={(value) => setForm((prev) => ({ ...prev, account_id: value }))} options={accounts.map((account) => [String(account.id), account.name])} />
        <div className="grid gap-2 md:col-span-2">
          <Label>源目录</Label>
          <FolderPicker
            accountId={form.account_id}
            value={{ id: form.target_directory_id, path: form.target_directory }}
            title="选择媒体整理源目录"
            description="选择需要扫描和整理的网盘目录。"
            onSelect={(folder) => setForm((prev) => ({ ...prev, target_directory_id: folder.id, target_directory: folder.path }))}
          />
          <div className="text-xs text-muted-foreground">目录 ID：{form.target_directory_id || "0"}</div>
        </div>
        <SelectField label="动作类型" value={form.action_type} onChange={(value) => setForm((prev) => ({ ...prev, action_type: value }))} options={[["move", "移动到目标目录"], ["rename", "原地重命名"]]} />
        <SelectField label="媒体类型" value={form.media_type} onChange={(value) => setForm((prev) => ({ ...prev, media_type: value }))} options={[["auto", "自动"], ["movie", "电影"], ["tv", "剧集"]]} />
        {form.action_type === "move" ? (
          <div className="grid gap-2 md:col-span-2">
            <Label>目标根目录</Label>
            <FolderPicker
              accountId={form.account_id}
              value={{ id: form.target_root_id, path: form.target_root }}
              title="选择媒体整理目标根目录"
              description="整理后的电影、剧集会移动到这个目录下。"
              onSelect={(folder) => setForm((prev) => ({ ...prev, target_root_id: folder.id, target_root: folder.path }))}
            />
            <div className="text-xs text-muted-foreground">目录 ID：{form.target_root_id || "0"}</div>
          </div>
        ) : null}
        <TextField label="重命名标识" value={form.rename_marker} onChange={(value) => setForm((prev) => ({ ...prev, rename_marker: value }))} placeholder="tmdb / 自定义 / off" />
        <SwitchField label="递归扫描" checked={form.recursive} onChange={(value) => setForm((prev) => ({ ...prev, recursive: value }))} />
        <SwitchField label="使用 TMDB" checked={form.use_tmdb} onChange={(value) => setForm((prev) => ({ ...prev, use_tmdb: value }))} />
        <SwitchField label="使用 FFprobe" checked={form.use_ffprobe} onChange={(value) => setForm((prev) => ({ ...prev, use_ffprobe: value }))} />
        <SwitchField label="覆盖已有文件" checked={form.overwrite_existing} onChange={(value) => setForm((prev) => ({ ...prev, overwrite_existing: value }))} />
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <DialogFooter><Button onClick={save}>保存任务</Button></DialogFooter>
    </DialogContent>
  )
}

function MediaSettings({ settings, onMessage, onReload }: { settings: Record<string, unknown>; onMessage: (value: string) => void; onReload: () => void | Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setForm(settings || {})
  }, [settings])

  const save = async () => {
    setSaving(true)
    try {
      const response = await adminApi.updateMediaSettings(form)
      onMessage(response.message || "媒体设置已保存")
      toast.success(response.message || "媒体设置已保存")
      await onReload()
    } catch (err) {
      const text = getMessage(err, "媒体设置保存失败")
      onMessage(text)
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  const testTmdb = async () => {
    try {
      const response = await adminApi.testTmdb(form)
      onMessage(response.message || "TMDB 测试完成")
      toast.success(response.message || "TMDB 测试完成")
    } catch (err) {
      const text = getMessage(err, "TMDB 测试失败")
      onMessage(text)
      toast.error(text)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Film className="size-4 text-primary" />识别与代理设置</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <TextField label="TMDB API Key" type="password" value={String(form.tmdb_api_key || "")} onChange={(value) => setForm((prev) => ({ ...prev, tmdb_api_key: value }))} />
        <TextField label="TMDB 语言" value={String(form.tmdb_language || "zh-CN")} onChange={(value) => setForm((prev) => ({ ...prev, tmdb_language: value }))} />
        <SwitchField label="启用代理" checked={Boolean(form.proxy_enabled)} onChange={(value) => setForm((prev) => ({ ...prev, proxy_enabled: value }))} />
        <TextField label="代理地址" value={String(form.proxy_url || "")} onChange={(value) => setForm((prev) => ({ ...prev, proxy_url: value }))} placeholder="http://127.0.0.1:7890" />
        <NumberField label="TMDB 请求间隔（毫秒）" value={Number(form.tmdb_request_interval_ms || 1000)} min={0} max={60000} onChange={(value) => setForm((prev) => ({ ...prev, tmdb_request_interval_ms: value }))} />
        <NumberField label="FFprobe 并发" value={Number(form.ffprobe_concurrency || 1)} min={1} max={8} onChange={(value) => setForm((prev) => ({ ...prev, ffprobe_concurrency: value }))} />
        <div className="flex gap-2 md:col-span-2">
          <Button onClick={save} disabled={saving}><Save className="size-4" />保存媒体设置</Button>
          <Button variant="outline" onClick={testTmdb}>测试 TMDB</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function StrmSettings({ settings, onMessage, onReload }: { settings: Record<string, unknown>; onMessage: (value: string) => void; onReload: () => void | Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({})
  const [replaceDomain, setReplaceDomain] = useState("")

  useEffect(() => setForm(settings || {}), [settings])

  const save = async (patch?: Record<string, unknown>) => {
    try {
      const response = await adminApi.updateStrmSettings({ ...form, ...(patch || {}) })
      const text = response.message || "STRM 设置已保存"
      onMessage(text)
      toast.success(text)
      await onReload()
    } catch (err) {
      const text = getMessage(err, "STRM 设置保存失败")
      onMessage(text)
      toast.error(text)
    }
  }

  const replace = async () => {
    if (!replaceDomain.trim()) return
    try {
      const response = await adminApi.replaceStrmDomain(replaceDomain.trim())
      const text = response.message || "域名替换完成"
      onMessage(text)
      toast.success(text)
      setReplaceDomain("")
      await onReload()
    } catch (err) {
      const text = getMessage(err, "域名替换失败")
      onMessage(text)
      toast.error(text)
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">STRM 全局设置</CardTitle></CardHeader>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <TextField label="STRM 基址" value={String(form.strm_base_url || "")} onChange={(value) => setForm((prev) => ({ ...prev, strm_base_url: value }))} />
        <TextField label="STRM Token" value={String(form.strm_token || "")} onChange={(value) => setForm((prev) => ({ ...prev, strm_token: value }))} />
        <SelectField label="链接格式" value={String(form.strm_link_format || "v2")} onChange={(value) => setForm((prev) => ({ ...prev, strm_link_format: value }))} options={[["v1", "v1"], ["v2", "v2"]]} />
        <TextField label="批量替换新域名" value={replaceDomain} onChange={setReplaceDomain} placeholder="https://media.example.com" />
        <div className="flex flex-wrap gap-2 md:col-span-2">
          <Button onClick={() => save()}><Save className="size-4" />保存设置</Button>
          <Button variant="outline" onClick={() => save({ regenerate_token: true })}>重生成 Token</Button>
          <Button variant="outline" onClick={() => save({ regenerate_token: true, apply_token_to_existing_strm: true })}>重生成并应用到已有 STRM</Button>
          <Button variant="outline" onClick={replace}>替换已有 STRM 域名</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function EmbyProxyPanel({ proxies, open, editing, onOpenChange, onCreate, onEdit, onAction }: { proxies: EmbyProxy[]; open: boolean; editing: EmbyProxy | null; onOpenChange: (open: boolean) => void; onCreate: () => void; onEdit: (proxy: EmbyProxy) => void; onAction: (runner: () => Promise<unknown>, ok?: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Emby 代理</CardTitle>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogTrigger asChild><Button onClick={onCreate}><Plus className="size-4" />新增代理</Button></DialogTrigger>
          <EmbyProxyDialog proxy={editing} onSaved={async (message) => {
            onOpenChange(false)
            toast.success(message)
            await onAction(() => Promise.resolve({ message }), message)
          }} />
        </Dialog>
      </CardHeader>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead>地址</TableHead>
            <TableHead className="w-28">状态</TableHead>
            <TableHead className="w-14 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {proxies.map((proxy) => (
            <TableRow key={proxy.id}>
              <TableCell className="font-medium">{proxy.name || proxy.proxy_name || `代理 ${proxy.id}`}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{proxy.emby_url || proxy.server_url || "-"}</TableCell>
              <TableCell><StatusBadge status={proxy.enabled === false ? "disabled" : proxy.status || "enabled"} /></TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onEdit(proxy)}>编辑</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction(() => adminApi.toggleEmbyProxy(proxy.id), "状态已切换")}>启停</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onAction(() => adminApi.testEmbyProxy(proxy.id), "测试完成")}>测试</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(String(proxy.proxy_url || proxy.url || proxy.emby_url || ""))}><Copy className="size-4" />复制地址</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => onAction(() => adminApi.deleteEmbyProxy(proxy.id), "代理已删除")}><Trash2 className="size-4" />删除</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
          {!proxies.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">尚未配置 Emby 代理</TableCell></TableRow> : null}
        </TableBody>
      </Table>
    </Card>
  )
}

function EmbyProxyDialog({ proxy, onSaved }: { proxy: EmbyProxy | null; onSaved: (message: string) => void | Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({})

  useEffect(() => setForm(proxy || { name: "", emby_url: "", token: "", enabled: true }), [proxy])

  const save = async () => {
    try {
      const response = proxy ? await adminApi.updateEmbyProxy(proxy.id, form) : await adminApi.createEmbyProxy(form)
      await onSaved(response.message || "Emby 代理已保存")
    } catch (err) {
      toast.error(getMessage(err, "保存失败"))
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{proxy ? "编辑 Emby 代理" : "新增 Emby 代理"}</DialogTitle>
        <DialogDescription>配置 Emby 反向代理地址、Token 和路径映射。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="名称" value={String(form.name || form.proxy_name || "")} onChange={(value) => setForm((prev) => ({ ...prev, name: value, proxy_name: value }))} />
        <TextField label="Emby 地址" value={String(form.emby_url || form.server_url || "")} onChange={(value) => setForm((prev) => ({ ...prev, emby_url: value, server_url: value }))} />
        <TextField label="Token" value={String(form.token || "")} onChange={(value) => setForm((prev) => ({ ...prev, token: value }))} />
        <SwitchField label="启用" checked={form.enabled !== false} onChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))} />
        <div className="grid gap-2 md:col-span-2">
          <Label>路径映射</Label>
          <Textarea value={String(form.path_mapping || "")} onChange={(event) => setForm((prev) => ({ ...prev, path_mapping: event.target.value }))} rows={5} />
        </div>
      </div>
      <DialogFooter><Button onClick={save}>保存代理</Button></DialogFooter>
    </DialogContent>
  )
}

function StrmBranchesDialog({ task, onOpenChange }: { task: StrmTask | null; onOpenChange: (open: boolean) => void }) {
  const [branches, setBranches] = useState<Array<Record<string, unknown>>>([])
  const [form, setForm] = useState({ branch_type: "directory", parent_id: "0", path: "/" })

  useEffect(() => {
    if (!task) return
    void adminApi.strmBranches(task.id).then((response) => setBranches(Array.isArray(response.data) ? response.data as Array<Record<string, unknown>> : [])).catch((err) => toast.error(getMessage(err, "分支加载失败")))
  }, [task])

  const add = async () => {
    if (!task) return
    try {
      const response = await adminApi.createStrmBranch(task.id, form)
      toast.success(response.message || "分支已添加")
      const next = await adminApi.strmBranches(task.id)
      setBranches(Array.isArray(next.data) ? next.data as Array<Record<string, unknown>> : [])
    } catch (err) {
      toast.error(getMessage(err, "分支保存失败"))
    }
  }

  const remove = async (branch: Record<string, unknown>) => {
    if (!task || !branch.id) return
    try {
      const response = await adminApi.deleteStrmBranch(task.id, Number(branch.id))
      toast.success(response.message || "分支已删除")
      setBranches((items) => items.filter((item) => item.id !== branch.id))
    } catch (err) {
      toast.error(getMessage(err, "删除失败"))
    }
  }

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>STRM 分支管理</DialogTitle>
          <DialogDescription>{task?.name || "任务"} 的额外扫描分支。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <FolderPicker accountId={task?.account_id || ""} value={{ id: form.parent_id, path: form.path }} title="选择分支目录" description="选择额外扫描目录。" onSelect={(folder) => setForm((prev) => ({ ...prev, parent_id: folder.id, path: folder.path }))} />
          <Button onClick={add}><Plus className="size-4" />添加分支</Button>
        </div>
        <Table>
          <TableHeader><TableRow><TableHead>路径</TableHead><TableHead className="w-20"></TableHead></TableRow></TableHeader>
          <TableBody>
            {branches.map((branch, index) => (
              <TableRow key={String(branch.id || index)}>
                <TableCell>{String(branch.path || branch.display_path || "/")}</TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => remove(branch)}><Trash2 className="size-4" /></Button></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </DialogContent>
    </Dialog>
  )
}

function MediaPlanDialog({ task, onOpenChange, onApplied }: { task: MediaOrganizeTask | null; onOpenChange: (open: boolean) => void; onApplied: (task: MediaOrganizeTask) => void }) {
  const [plan, setPlan] = useState<MediaPlan | null>(null)
  const [progress, setProgress] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const [editingId, setEditingId] = useState("")
  const [editingName, setEditingName] = useState("")
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const confirm = useConfirm()

  const actions = useMemo(() => Array.isArray(plan?.actions) ? plan.actions || [] : [], [plan])
  const relocateActions = actions.filter((action) => action.kind === "relocate")
  const ensureActions = actions.filter((action) => action.kind === "ensure_dir")
  const skipped = Array.isArray(plan?.skipped) ? plan.skipped || [] : []
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const loadExistingOrGenerate = async (target: MediaOrganizeTask) => {
    setLoading(true)
    setPlan(null)
    setProgress({})
    setSelectedIds([])
    setEditingId("")
    try {
      const existing = await adminApi.mediaTaskPlan(target.id)
      const existingPlan = normalizePlan(existing.data)
      if (existingPlan && ((existingPlan.actions?.length || 0) > 0 || (existingPlan.skipped?.length || 0) > 0)) {
        setPlan(existingPlan)
        return
      }
      await generatePlan(target.id, false)
    } catch (err) {
      toast.error(getMessage(err, "计划加载失败"))
    } finally {
      setLoading(false)
    }
  }

  const generatePlan = async (taskId: string, notify = true) => {
    setLoading(true)
    setProgress({})
    const timer = window.setInterval(() => {
      void adminApi.mediaTaskProgress(taskId).then((response) => setProgress(asRecord(response.data))).catch(() => undefined)
    }, 1200)
    try {
      const response = await adminApi.planMediaTask(taskId)
      const nextPlan = normalizePlan(response.data)
      setPlan(nextPlan)
      setSelectedIds([])
      if (notify) toast.success(response.message || "计划已重新生成")
    } catch (err) {
      toast.error(getMessage(err, "计划生成失败"))
    } finally {
      window.clearInterval(timer)
      void adminApi.mediaTaskProgress(taskId).then((response) => setProgress(asRecord(response.data))).catch(() => undefined)
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!task) return
    void loadExistingOrGenerate(task)
  }, [task?.id])

  const updateAction = async (action: MediaPlanAction) => {
    if (!task) return
    const targetName = editingName.trim()
    if (!targetName) {
      toast.warning("目标名不能为空")
      return
    }
    try {
      const response = await adminApi.updateMediaTaskPlanAction(task.id, action.id, { target_name: targetName })
      const updated = asRecord(response.data).action as MediaPlanAction | undefined
      setPlan((current) => current ? {
        ...current,
        actions: (current.actions || []).map((item) => item.id === action.id ? { ...item, ...(updated || {}), target_name: updated?.target_name || targetName } : item),
      } : current)
      setEditingId("")
      setEditingName("")
      toast.success(response.message || "动作已更新")
    } catch (err) {
      toast.error(getMessage(err, "保存失败"))
    }
  }

  const removeAction = async (action: MediaPlanAction) => {
    if (!task) return
    const ok = await confirm({ title: "从计划中移除？", description: `“${action.source_name || action.target_name || action.id}” 将不会被整理。`, confirmText: "移除", destructive: true })
    if (!ok) return
    try {
      const response = await adminApi.deleteMediaTaskPlanAction(task.id, action.id)
      setPlan((current) => current ? { ...current, actions: (current.actions || []).filter((item) => item.id !== action.id) } : current)
      setSelectedIds((ids) => ids.filter((id) => id !== action.id))
      toast.success(response.message || "动作已删除")
    } catch (err) {
      toast.error(getMessage(err, "删除失败"))
    }
  }

  const removeSelected = async () => {
    if (!task || !selectedIds.length) return
    const ok = await confirm({ title: "批量移除选中动作？", description: `将从计划中移除 ${selectedIds.length} 个整理动作。`, confirmText: "批量移除", destructive: true })
    if (!ok) return
    try {
      const response = await adminApi.batchDeleteMediaTaskPlanActions(task.id, selectedIds)
      const removed = asStringArray(asRecord(response.data).removed)
      const removedSet = new Set(removed.length ? removed : selectedIds)
      setPlan((current) => current ? { ...current, actions: (current.actions || []).filter((item) => !removedSet.has(item.id)) } : current)
      setSelectedIds([])
      toast.success(response.message || `已移除 ${removedSet.size} 项`)
    } catch (err) {
      toast.error(getMessage(err, "批量移除失败"))
    }
  }

  const applyPlan = async () => {
    if (!task) return
    setApplying(true)
    try {
      const response = await adminApi.applyMediaTask(task.id)
      toast.success(response.message || "计划已开始执行，可在日志中查看进度")
      onApplied(task)
    } catch (err) {
      toast.error(getMessage(err, "执行失败"))
    } finally {
      setApplying(false)
    }
  }

  const toggleSelected = (id: string, checked: boolean) => {
    setSelectedIds((ids) => checked ? [...new Set([...ids, id])] : ids.filter((item) => item !== id))
  }

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><ListChecks className="size-4" />整理计划</DialogTitle>
          <DialogDescription>{task?.task_name || "媒体整理任务"}，生成后可先检查、改名或移除条目，再应用计划。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-4">
          <PlanMetric label="整理动作" value={relocateActions.length} />
          <PlanMetric label="建目录" value={ensureActions.length} />
          <PlanMetric label="跳过" value={skipped.length} />
          <PlanMetric label="TMDB" value={String(plan?.diagnostics?.tmdb_status || "未返回")} />
        </div>

        {loading ? <PlanProgress progress={progress} /> : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => task && generatePlan(task.id)} disabled={!task || loading}>
            <RefreshCw className="size-4" />重新生成计划
          </Button>
          <Button variant="outline" onClick={removeSelected} disabled={!selectedIds.length}>
            <Trash2 className="size-4" />移除选中
          </Button>
          <Button onClick={applyPlan} disabled={!relocateActions.length || applying || loading}>
            <Check className="size-4" />应用计划
          </Button>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10"></TableHead>
                <TableHead>来源</TableHead>
                <TableHead>目标名称</TableHead>
                <TableHead className="w-28">类型</TableHead>
                <TableHead className="w-24">置信度</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {relocateActions.map((action) => {
                const meta = planActionMeta(action)
                const editing = editingId === action.id
                return (
                  <TableRow key={action.id}>
                    <TableCell>
                      <Checkbox checked={selectedSet.has(action.id)} onCheckedChange={(checked) => toggleSelected(action.id, checked === true)} />
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[320px] truncate font-medium">{action.source_name || "-"}</div>
                      <div className="max-w-[320px] truncate text-xs text-muted-foreground">{action.reason || meta.mode}</div>
                    </TableCell>
                    <TableCell>
                      {editing ? (
                        <Input value={editingName} onChange={(event) => setEditingName(event.target.value)} autoFocus />
                      ) : (
                        <div className="max-w-[360px] truncate">{action.target_name || "-"}</div>
                      )}
                    </TableCell>
                    <TableCell><Badge variant="outline">{meta.typeLabel}</Badge></TableCell>
                    <TableCell className={meta.confLow ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"}>{meta.conf != null ? `${meta.conf}%` : "-"}</TableCell>
                    <TableCell className="text-right">
                      {editing ? (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => updateAction(action)}><Check className="size-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => setEditingId("")}><X className="size-4" /></Button>
                        </div>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => {
                            setEditingId(action.id)
                            setEditingName(action.target_name || "")
                          }}><Pencil className="size-4" /></Button>
                          <Button variant="ghost" size="icon" onClick={() => removeAction(action)}><Trash2 className="size-4" /></Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
              {!relocateActions.length ? <TableRow><TableCell colSpan={6} className="h-24 text-center text-muted-foreground">{loading ? "正在生成计划..." : "暂无可执行的整理动作"}</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>

        {ensureActions.length ? (
          <PlanSection title="建目录动作" items={ensureActions.map((action) => action.target_name || action.source_name || action.id)} />
        ) : null}
        {skipped.length ? (
          <PlanSection title="跳过项" items={skipped.map((item) => String(item.name || item.source_name || item.file_name || item.reason || JSON.stringify(item)))} muted />
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function MediaLogsDialog({ task, onOpenChange, onTaskPatch }: { task: MediaOrganizeTask | null; onOpenChange: (open: boolean) => void; onTaskPatch: (taskId: string, patch: Partial<MediaOrganizeTask>) => void }) {
  const [logs, setLogs] = useState<MediaLogEntry[]>([])
  const [status, setStatus] = useState(task?.status || "idle")
  const [lastRunResult, setLastRunResult] = useState<MediaRunResult | null>(task?.last_run_result as MediaRunResult | null || null)
  const [loading, setLoading] = useState(false)
  const bodyRef = useRef<HTMLDivElement | null>(null)

  const loadLogs = async (quiet = false) => {
    if (!task) return
    if (!quiet) setLoading(true)
    try {
      const response = await adminApi.mediaTaskLogs(task.id)
      const data = asRecord(response.data)
      const nextLogs = Array.isArray(data.logs) ? data.logs as MediaLogEntry[] : []
      const nextStatus = String(data.status || "idle")
      const nextResult = data.last_run_result ? data.last_run_result as MediaRunResult : null
      setLogs(nextLogs)
      setStatus(nextStatus)
      setLastRunResult(nextResult)
      onTaskPatch(task.id, { status: nextStatus, last_run_result: nextResult })
      requestAnimationFrame(() => {
        if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
      })
    } catch (err) {
      toast.error(getMessage(err, "日志加载失败"))
    } finally {
      if (!quiet) setLoading(false)
    }
  }

  useEffect(() => {
    if (!task) return
    setLogs([])
    setStatus(task.status || "idle")
    setLastRunResult(task.last_run_result as MediaRunResult | null || null)
    void loadLogs()
  }, [task?.id])

  useEffect(() => {
    if (!task || !isActiveMediaStatus(status)) return
    const timer = window.setInterval(() => {
      void loadLogs(true)
    }, 1000)
    return () => window.clearInterval(timer)
  }, [task?.id, status])

  return (
    <Dialog open={Boolean(task)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-hidden sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><FileText className="size-4" />整理日志</DialogTitle>
          <DialogDescription>{task?.task_name || "媒体整理任务"} 的实时执行输出。</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <div className="space-y-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">当前状态</div>
              <div className="mt-2"><StatusBadge status={status} /></div>
            </div>
            <RunResultSummary result={lastRunResult} />
            <Button variant="outline" className="w-full" onClick={() => loadLogs()} disabled={loading}>
              <RefreshCw className="size-4" />刷新日志
            </Button>
          </div>

          <div ref={bodyRef} className="h-[60dvh] overflow-auto rounded-md border bg-zinc-950 p-3 font-mono text-xs text-zinc-100 dark:bg-black">
            {logs.map((log, index) => (
              <div key={`${log.time || "log"}-${index}`} className="grid grid-cols-[72px_1fr] gap-3 border-b border-white/5 py-1.5 last:border-0">
                <span className="text-zinc-500">{log.time || "--:--:--"}</span>
                <span className="whitespace-pre-wrap break-words">{log.message || ""}</span>
              </div>
            ))}
            {!logs.length ? (
              <div className="flex h-full items-center justify-center text-zinc-500">
                {loading ? "正在加载日志..." : "暂无日志内容，执行任务后会在这里实时显示。"}
              </div>
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Metric({ title, value, small }: { title: string; value: string | number; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={small ? "mt-1 truncate text-sm font-medium" : "mt-1 font-mono text-2xl font-semibold"}>{value}</div>
      </CardContent>
    </Card>
  )
}

function PlanMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold">{value}</div>
    </div>
  )
}

function PlanProgress({ progress }: { progress: Record<string, unknown> }) {
  const total = Number(progress.total || progress.max_works || 0)
  const current = Number(progress.current || progress.planned_works || 0)
  const value = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : undefined
  const stage = String(progress.stage || "planning")
  const currentDir = String(progress.current_dir || "")

  return (
    <div className="rounded-md border bg-muted/40 p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-medium">正在生成计划：{stage}</span>
        <span className="text-muted-foreground">目录 {Number(progress.scanned_dirs || 0)}，文件 {Number(progress.scanned_files || 0)}，动作 {Number(progress.actions || 0)}，跳过 {Number(progress.skipped || 0)}</span>
      </div>
      <Progress value={value ?? 35} className={value == null ? "opacity-70" : ""} />
      {currentDir ? <div className="mt-2 truncate text-xs text-muted-foreground">{currentDir}</div> : null}
    </div>
  )
}

function PlanSection({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
  return (
    <div className="rounded-md border">
      <div className="flex items-center justify-between px-3 py-2">
        <div className="text-sm font-medium">{title}</div>
        <Badge variant="outline">{items.length}</Badge>
      </div>
      <Separator />
      <div className="max-h-44 overflow-auto p-2">
        {items.map((item, index) => (
          <div key={`${item}-${index}`} className={muted ? "rounded px-2 py-1.5 text-xs text-muted-foreground" : "rounded px-2 py-1.5 text-xs"}>
            {item}
          </div>
        ))}
      </div>
    </div>
  )
}

function RunResultSummary({ result }: { result: MediaRunResult | null }) {
  const items = [
    ["总数", result?.total || 0],
    ["改名", result?.renamed || 0],
    ["移动", result?.moved || 0],
    ["跳过", result?.skipped || 0],
    ["失败", result?.failed || 0],
  ]
  return (
    <div className="rounded-md border p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs text-muted-foreground">最近结果</span>
        {result?.stopped ? <Badge variant="outline">已停止</Badge> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {items.map(([label, value]) => (
          <div key={label} className="rounded bg-muted/50 px-2 py-1.5">
            <div className="text-[11px] text-muted-foreground">{label}</div>
            <div className="font-mono text-sm font-semibold">{value}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function TextField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} />
    </div>
  )
}

function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, optionLabel]) => <SelectItem key={optionValue} value={optionValue}>{optionLabel}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  )
}

function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-md border px-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function scanModeText(mode?: string) {
  if (mode === "incremental_missing") return "仅补缺失"
  if (mode === "full_sync") return "全量同步"
  return "增量更新"
}

function isActiveMediaStatus(status?: string) {
  return activeMediaStatuses.has(String(status || ""))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

function normalizePlan(value: unknown): MediaPlan | null {
  const data = asRecord(value)
  const candidate = data.plan && typeof data.plan === "object" ? asRecord(data.plan) : data
  if (!candidate || (!("actions" in candidate) && !("skipped" in candidate) && !("diagnostics" in candidate))) return null
  return {
    ...candidate,
    actions: Array.isArray(candidate.actions) ? candidate.actions as MediaPlanAction[] : [],
    skipped: Array.isArray(candidate.skipped) ? candidate.skipped as Array<Record<string, unknown>> : [],
    diagnostics: asRecord(candidate.diagnostics),
  }
}

function planActionMeta(action: MediaPlanAction) {
  const md = asRecord(action.metadata)
  const confidence = typeof action.confidence === "number" ? Math.round(action.confidence * 100) : undefined
  const kindLabel = String(md.kind_label || "")
  const mediaKind = String(md.media_kind || "")
  const isRename = md.mode ? md.mode === "rename" : String(action.source_parent_id || "") === String(action.target_parent_id || "")
  return {
    typeLabel: kindLabel === "dir_rename" ? "目录" : mediaKind === "tv" ? "剧集" : mediaKind === "movie" ? "电影" : "媒体",
    mode: isRename ? "原地重命名" : "移动并重命名",
    conf: confidence,
    confLow: confidence != null && confidence < 80,
  }
}
