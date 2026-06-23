import { useEffect, useState } from "react"
import { toast } from "sonner"
import { MoreHorizontal, Plus, RefreshCw, Save, Square, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import type { Account, StrmTask } from "@/types/api"
import { Label } from "@/components/ui/label"
import { Metric, TextField, NumberField, SelectField, SwitchField, scanModeText } from "./media-shared"

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

export function StrmPanel() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [strmTasks, setStrmTasks] = useState<StrmTask[]>([])
  const [strmSettings, setStrmSettings] = useState<Record<string, unknown>>({})
  const [message, setMessage] = useState("")
  const [strmDialogOpen, setStrmDialogOpen] = useState(false)
  const [editingStrm, setEditingStrm] = useState<StrmTask | null>(null)
  const [branchesTask, setBranchesTask] = useState<StrmTask | null>(null)
  const confirm = useConfirm()

  useEffect(() => { void load() }, [])

  const load = async () => {
    setMessage("")
    try {
      const [accountRes, tasksRes, settingsRes] = await Promise.allSettled([
        adminApi.accounts(),
        adminApi.strmTasks(),
        adminApi.strmSettings(),
      ])
      if (accountRes.status === "fulfilled") setAccounts(accountRes.value.data || [])
      if (tasksRes.status === "fulfilled") setStrmTasks(tasksRes.value.data || [])
      if (settingsRes.status === "fulfilled") setStrmSettings((settingsRes.value.data || {}) as Record<string, unknown>)
    } catch (err) {
      const text = getMessage(err, "STRM 信息加载失败")
      setMessage(text)
      toast.error(text)
    }
  }

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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">STRM 管理</h2>
          <p className="text-sm text-muted-foreground">STRM 文件生成任务管理与全局设置。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="size-4" />刷新</Button>
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <div className="grid gap-3 md:grid-cols-2">
        <Metric title="STRM 任务" value={strmTasks.length} />
        <Metric title="STRM 基址" value={String(strmSettings.strm_base_url || "未设置")} small />
      </div>
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="text-base">STRM 任务</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => action(() => adminApi.runAllStrmTasks(), "已触发全部 STRM 任务")}>全部执行</Button>
            <Dialog open={strmDialogOpen} onOpenChange={(open) => { setStrmDialogOpen(open); if (!open) setEditingStrm(null) }}>
              <DialogTrigger asChild><Button><Plus className="size-4" />新建 STRM</Button></DialogTrigger>
              <StrmTaskDialog accounts={accounts} task={editingStrm} onSaved={async (text) => {
                setStrmDialogOpen(false); setEditingStrm(null); setMessage(text); await load()
              }} />
            </Dialog>
          </div>
        </CardHeader>
        <TaskTable tasks={strmTasks} onBranches={setBranchesTask}
          onDelete={async (task) => {
            const ok = await confirm({ title: "删除该 STRM 任务？", description: "可以在后续增强中选择是否同时删除 STRM 文件。", confirmText: "删除", destructive: true })
            if (ok) await action(() => adminApi.deleteStrmTask(task.id, false), "任务已删除")
          }}
          onEdit={(task) => { setEditingStrm(task); setStrmDialogOpen(true) }}
          onAction={action}
        />
      </Card>
      <StrmSettings settings={strmSettings} onMessage={setMessage} onReload={load} />
      <StrmBranchesDialog task={branchesTask} onOpenChange={(open) => !open && setBranchesTask(null)} />
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
