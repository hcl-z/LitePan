import { useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import { toast } from "sonner"
import { MoreHorizontal, Play, Plus, RefreshCw, Save, Trash2, Workflow } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { Account, IngestRun, IngestWorkflow, MediaOrganizeTask, StrmTask } from "@/types/api"

type RefreshDirectoryForm = {
  account_id: number
  parent_id: string
  path: string
}

const emptyForm = {
  name: "",
  enabled: true,
  debounce_seconds: 60,
  refresh_enabled: true,
  refresh_account_ids: [] as number[],
  refresh_directories: [] as RefreshDirectoryForm[],
  organize_enabled: true,
  organize_task_ids: [] as string[],
  strm_enabled: true,
  strm_task_ids: [] as number[],
  strm_run_mode: "auto",
  notify_enabled: true,
}

type IngestForm = typeof emptyForm

export function IngestPanel() {
  const [workflows, setWorkflows] = useState<IngestWorkflow[]>([])
  const [runs, setRuns] = useState<IngestRun[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [mediaTasks, setMediaTasks] = useState<MediaOrganizeTask[]>([])
  const [strmTasks, setStrmTasks] = useState<StrmTask[]>([])
  const [editing, setEditing] = useState<IngestWorkflow | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const enabledCount = workflows.filter((item) => item.enabled).length

  const load = async () => {
    setLoading(true)
    setMessage("")
    try {
      const [workflowRes, runRes, accountRes, mediaRes, strmRes] = await Promise.allSettled([
        adminApi.ingestWorkflows(),
        adminApi.ingestRuns({ limit: 20 }),
        adminApi.accounts(),
        adminApi.mediaTasks(),
        adminApi.strmTasks(),
      ])
      if (workflowRes.status === "fulfilled") setWorkflows(workflowRes.value.data || [])
      if (runRes.status === "fulfilled") setRuns(runRes.value.data || [])
      if (accountRes.status === "fulfilled") setAccounts(accountRes.value.data || [])
      if (mediaRes.status === "fulfilled") setMediaTasks(mediaRes.value.data || [])
      if (strmRes.status === "fulfilled") setStrmTasks(strmRes.value.data || [])
    } catch (err) {
      const text = getMessage(err, "入库流程加载失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setLoading(false)
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

  const deleteWorkflow = async (workflow: IngestWorkflow) => {
    const ok = await confirm({
      title: "删除入库流程？",
      description: `删除后飞书和手动入口都不能再执行「${workflow.name}」。`,
      confirmText: "删除",
      destructive: true,
    })
    if (ok) await action(() => adminApi.deleteIngestWorkflow(workflow.id), "流程已删除")
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">入库流程</h2>
          <p className="text-sm text-muted-foreground">配置飞书或手动触发后的刷新、整理和 STRM 生成顺序。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="size-4" />刷新</Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditing(null)
          }}>
            <DialogTrigger asChild>
              <Button><Plus className="size-4" />新建流程</Button>
            </DialogTrigger>
            <WorkflowDialog
              workflow={editing}
              accounts={accounts}
              mediaTasks={mediaTasks}
              strmTasks={strmTasks}
              onSaved={async (text) => {
                setDialogOpen(false)
                setEditing(null)
                setMessage(text)
                toast.success(text)
                await load()
              }}
            />
          </Dialog>
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-3">
        <Metric title="流程总数" value={String(workflows.length)} />
        <Metric title="启用流程" value={String(enabledCount)} />
        <Metric title="最近运行" value={runs[0] ? formatDateTime(runs[0].started_at) : "尚未执行"} small />
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base"><Workflow className="size-4 text-primary" />流程列表</CardTitle>
          <div className="text-sm text-muted-foreground">飞书命令：/lp 入库 列出流程；/lp 入库 &lt;流程ID|流程名&gt; 执行</div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>流程</TableHead>
                <TableHead className="w-40">步骤</TableHead>
                <TableHead className="w-32">防抖</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="w-14 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.map((workflow) => (
                <TableRow key={workflow.id}>
                  <TableCell>
                    <div className="font-medium">#{workflow.id} {workflow.name}</div>
                    <div className="text-xs text-muted-foreground">更新于 {formatDateTime(workflow.updated_at)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(workflow.steps || []).filter((step) => step.enabled !== false).map((step, index) => (
                        <Badge key={`${step.type}-${index}`} variant="secondary">{stepLabel(step.type)}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{workflow.debounce_seconds || 0} 秒</TableCell>
                  <TableCell><StatusBadge status={workflow.enabled ? "enabled" : "disabled"} /></TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => action(() => adminApi.runIngestWorkflow(workflow.id), "流程已执行")}><Play className="size-4" />立即执行</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => { setEditing(workflow); setDialogOpen(true) }}>编辑</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.toggleIngestWorkflow(workflow.id), "状态已切换")}>{workflow.enabled ? "停用" : "启用"}</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteWorkflow(workflow)}><Trash2 className="size-4" />删除</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
              {!workflows.length ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-24 text-center text-sm text-muted-foreground">暂无入库流程。</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader><CardTitle className="text-base">运行历史</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>运行</TableHead>
                <TableHead className="w-28">来源</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead>摘要</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => (
                <TableRow key={run.id}>
                  <TableCell>
                    <div className="font-medium">#{run.id}</div>
                    <div className="text-xs text-muted-foreground">{formatDateTime(run.started_at)}</div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{run.source || "-"}</TableCell>
                  <TableCell><StatusBadge status={run.status || "unknown"} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{runSummary(run)}</TableCell>
                </TableRow>
              ))}
              {!runs.length ? (
                <TableRow>
                  <TableCell colSpan={4} className="h-20 text-center text-sm text-muted-foreground">暂无运行记录。</TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function WorkflowDialog({
  workflow,
  accounts,
  mediaTasks,
  strmTasks,
  onSaved,
}: {
  workflow: IngestWorkflow | null
  accounts: Account[]
  mediaTasks: MediaOrganizeTask[]
  strmTasks: StrmTask[]
  onSaved: (message: string) => void | Promise<void>
}) {
  const [form, setForm] = useState<IngestForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [directoryAccountId, setDirectoryAccountId] = useState("")
  const [directorySelection, setDirectorySelection] = useState({ id: "0", path: "/" })

  useEffect(() => {
    const defaultAccountId = accounts[0]?.id ? String(accounts[0].id) : ""
    setForm(workflow ? workflowToForm(workflow) : {
      ...emptyForm,
      refresh_account_ids: accounts[0]?.id ? [accounts[0].id] : [],
    })
    setDirectoryAccountId(defaultAccountId)
    setDirectorySelection({ id: "0", path: "/" })
  }, [workflow, accounts])

  const update = <K extends keyof IngestForm>(key: K, value: IngestForm[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const addRefreshDirectory = () => {
    const accountId = Number(directoryAccountId || 0)
    if (!accountId) {
      toast.error("请选择刷新路径所属账号")
      return
    }
    const parentId = String(directorySelection.id || "0")
    const exists = form.refresh_directories.some((item) => item.account_id === accountId && item.parent_id === parentId)
    if (exists) {
      toast.error("该刷新路径已存在")
      return
    }
    update("refresh_directories", [
      ...form.refresh_directories,
      { account_id: accountId, parent_id: parentId, path: directorySelection.path || "/" },
    ])
  }

  const removeRefreshDirectory = (index: number) => {
    update("refresh_directories", form.refresh_directories.filter((_, currentIndex) => currentIndex !== index))
  }

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("流程名称不能为空")
      return
    }
    if (form.refresh_enabled && !form.refresh_account_ids.length && !form.refresh_directories.length) {
      toast.error("刷新目录需要选择账号或指定路径")
      return
    }
    const payload = formToWorkflowPayload(form)
    if (!payload.steps.length) {
      toast.error("至少启用一个步骤")
      return
    }
    setSaving(true)
    try {
      const response = workflow
        ? await adminApi.updateIngestWorkflow(workflow.id, payload)
        : await adminApi.createIngestWorkflow(payload)
      await onSaved(response.message || "流程已保存")
    } catch (err) {
      toast.error(getMessage(err, "流程保存失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{workflow ? "编辑入库流程" : "新建入库流程"}</DialogTitle>
        <DialogDescription>选择每一步要执行的账号和任务，流程会按刷新、整理、STRM、通知的顺序运行。</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5">
        <div className="grid gap-4 md:grid-cols-[1fr_160px_140px]">
          <Field label="流程名称">
            <Input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="电视剧入库" />
          </Field>
          <Field label="防抖秒数">
            <Input type="number" min={0} value={form.debounce_seconds} onChange={(event) => update("debounce_seconds", Number(event.target.value || 0))} />
          </Field>
          <ToggleRow label="启用流程" checked={form.enabled} onChange={(value) => update("enabled", value)} />
        </div>

        <StepBlock title="刷新目录" enabled={form.refresh_enabled} onEnabled={(value) => update("refresh_enabled", value)}>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label>刷新账号</Label>
              <CheckList
                items={accounts}
                selected={form.refresh_account_ids}
                getId={(item) => item.id}
                getLabel={(item) => `${item.name}（${item.driver_type || "-"}）`}
                onChange={(value) => update("refresh_account_ids", value)}
                empty="暂无可选账号。"
              />
            </div>

            <div className="grid gap-3 rounded-md border bg-muted/20 p-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="指定路径账号">
                  <Select value={directoryAccountId} onValueChange={(value) => {
                    setDirectoryAccountId(value)
                    setDirectorySelection({ id: "0", path: "/" })
                  }}>
                    <SelectTrigger className="w-48"><SelectValue placeholder="选择账号" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="min-w-0 flex-1">
                  <Field label="刷新路径（可选）">
                    <FolderPicker
                      accountId={directoryAccountId}
                      value={directorySelection}
                      title="选择刷新路径"
                      description="选择入库流程刷新资源时要强制刷新的网盘目录。"
                      onSelect={setDirectorySelection}
                    />
                  </Field>
                </div>
                <Button type="button" variant="outline" onClick={addRefreshDirectory} disabled={!directoryAccountId}>添加路径</Button>
              </div>
              {form.refresh_directories.length ? (
                <div className="grid gap-2">
                  {form.refresh_directories.map((item, index) => (
                    <div key={`${item.account_id}-${item.parent_id}-${index}`} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2 text-sm">
                      <div className="min-w-0">
                        <div className="font-medium">{accountName(accounts, item.account_id)}</div>
                        <div className="truncate text-xs text-muted-foreground">{item.path || "/"}（{item.parent_id || "0"}）</div>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={() => removeRefreshDirectory(index)}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">未指定路径时，会刷新所选账号关联的缓存保持和 STRM 目录。</div>
              )}
            </div>
          </div>
        </StepBlock>

        <StepBlock title="媒体整理" enabled={form.organize_enabled} onEnabled={(value) => update("organize_enabled", value)}>
          <CheckList
            items={mediaTasks}
            selected={form.organize_task_ids}
            getId={(item) => item.id}
            getLabel={(item) => `${item.task_name || item.id}（${item.status || "idle"}）`}
            onChange={(value) => update("organize_task_ids", value)}
            empty="暂无媒体整理任务。"
          />
        </StepBlock>

        <StepBlock title="STRM 生成" enabled={form.strm_enabled} onEnabled={(value) => update("strm_enabled", value)}>
          <div className="grid gap-3">
            <Field label="执行模式">
              <Select value={form.strm_run_mode} onValueChange={(value) => update("strm_run_mode", value)}>
                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">自动</SelectItem>
                  <SelectItem value="full">全量</SelectItem>
                  <SelectItem value="branch">分支</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <CheckList
              items={strmTasks}
              selected={form.strm_task_ids}
              getId={(item) => item.id}
              getLabel={(item) => `${item.name || `STRM#${item.id}`}（${item.path || "/"}）`}
              onChange={(value) => update("strm_task_ids", value)}
              empty="暂无 STRM 任务。"
            />
          </div>
        </StepBlock>

        <StepBlock title="站内通知" enabled={form.notify_enabled} onEnabled={(value) => update("notify_enabled", value)}>
          <div className="text-sm text-muted-foreground">流程结束后写入 LitePan 通知中心。</div>
        </StepBlock>
      </div>

      <DialogFooter>
        <Button onClick={save} disabled={saving}><Save className="size-4" />保存流程</Button>
      </DialogFooter>
    </DialogContent>
  )
}

function formToWorkflowPayload(form: IngestForm) {
  const steps = []
  if (form.refresh_enabled) {
    const refreshDirectories = form.refresh_directories
      .map((item) => ({
        account_id: Number(item.account_id),
        parent_id: String(item.parent_id || "0"),
        path: String(item.path || "/"),
      }))
      .filter((item) => Number.isFinite(item.account_id) && item.account_id > 0 && item.parent_id)
    const hasRefreshDirectories = refreshDirectories.length > 0
    steps.push({
      type: "refresh",
      name: "刷新目录",
      order: 1,
      enabled: true,
      on_error: "stop",
      params: {
        account_ids: hasRefreshDirectories ? [] : form.refresh_account_ids,
        directories: refreshDirectories,
        include_cache_retention_dirs: !hasRefreshDirectories,
        include_strm_dirs: !hasRefreshDirectories,
        include_strm_branches: !hasRefreshDirectories,
      },
    })
  }
  if (form.organize_enabled) {
    steps.push({
      type: "organize",
      name: "媒体整理",
      order: 2,
      enabled: true,
      on_error: "stop",
      params: {
        task_ids: form.organize_task_ids,
        wait_until_done: true,
        skip_if_running: true,
      },
    })
  }
  if (form.strm_enabled) {
    steps.push({
      type: "strm",
      name: "STRM 生成",
      order: 3,
      enabled: true,
      on_error: "stop",
      params: {
        task_ids: form.strm_task_ids,
        run_mode: form.strm_run_mode,
      },
    })
  }
  if (form.notify_enabled) {
    steps.push({
      type: "notify",
      name: "通知",
      order: 4,
      enabled: true,
      on_error: "continue",
      params: {
        title: `${form.name} 已执行`,
        message: "入库流程执行完成，请查看运行历史。",
      },
    })
  }
  return {
    name: form.name.trim(),
    enabled: form.enabled,
    trigger_type: "feishu",
    trigger_config: {},
    debounce_seconds: Math.max(0, Number(form.debounce_seconds || 0)),
    steps,
  }
}

function workflowToForm(workflow: IngestWorkflow): IngestForm {
  const steps = workflow.steps || []
  const refresh = steps.find((step) => step.type === "refresh")
  const organize = steps.find((step) => step.type === "organize")
  const strm = steps.find((step) => step.type === "strm")
  const notify = steps.find((step) => step.type === "notify")
  return {
    name: workflow.name || "",
    enabled: workflow.enabled,
    debounce_seconds: Number(workflow.debounce_seconds || 0),
    refresh_enabled: Boolean(refresh),
    refresh_account_ids: numberList(refresh?.params?.account_ids),
    refresh_directories: refreshDirectoryList(refresh?.params?.directories),
    organize_enabled: Boolean(organize),
    organize_task_ids: stringList(organize?.params?.task_ids),
    strm_enabled: Boolean(strm),
    strm_task_ids: numberList(strm?.params?.task_ids),
    strm_run_mode: String(strm?.params?.run_mode || "auto"),
    notify_enabled: Boolean(notify),
  }
}

function refreshDirectoryList(value: unknown): RefreshDirectoryForm[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const directory = item && typeof item === "object" ? item as Record<string, unknown> : {}
    return {
      account_id: Number(directory.account_id),
      parent_id: String(directory.parent_id || "0"),
      path: String(directory.path || "/"),
    }
  }).filter((item) => Number.isFinite(item.account_id) && item.account_id > 0 && item.parent_id)
}

function accountName(accounts: Account[], accountId: number) {
  const account = accounts.find((item) => Number(item.id) === Number(accountId))
  return account ? `${account.name}（${account.driver_type || "-"}）` : `账号 ${accountId}`
}

function numberList(value: unknown): number[] {
  return Array.isArray(value) ? value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0) : []
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : []
}

function CheckList<T, K extends string | number>({
  items,
  selected,
  getId,
  getLabel,
  onChange,
  empty,
}: {
  items: T[]
  selected: K[]
  getId: (item: T) => K
  getLabel: (item: T) => string
  onChange: (value: K[]) => void
  empty: string
}) {
  const selectedSet = useMemo(() => new Set(selected), [selected])
  if (!items.length) return <div className="rounded-md border bg-muted/40 px-3 py-4 text-sm text-muted-foreground">{empty}</div>
  return (
    <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border p-3">
      {items.map((item) => {
        const id = getId(item)
        const checked = selectedSet.has(id)
        return (
          <label key={String(id)} className="flex min-h-8 items-center gap-3 text-sm">
            <Checkbox
              checked={checked}
              onCheckedChange={(value) => {
                const next = value
                  ? [...selected, id]
                  : selected.filter((current) => current !== id)
                onChange(next)
              }}
            />
            <span className="truncate">{getLabel(item)}</span>
          </label>
        )
      })}
    </div>
  )
}

function StepBlock({ title, enabled, onEnabled, children }: { title: string; enabled: boolean; onEnabled: (value: boolean) => void; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="font-medium">{title}</div>
        <Switch checked={enabled} onCheckedChange={onEnabled} />
      </div>
      {enabled ? children : <div className="text-sm text-muted-foreground">此步骤已关闭。</div>}
    </div>
  )
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex h-full items-end justify-between gap-3 rounded-md border px-3 py-2">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  )
}

function Metric({ title, value, small = false }: { title: string; value: string; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={small ? "mt-1 truncate text-base font-semibold" : "mt-1 text-2xl font-semibold"}>{value}</div>
      </CardContent>
    </Card>
  )
}

function stepLabel(type: string) {
  return {
    refresh: "刷新",
    organize: "整理",
    strm: "STRM",
    notify: "通知",
  }[type] || type
}

function runSummary(run: IngestRun) {
  if (run.error_message) return run.error_message
  const summary = run.summary || {}
  const steps = Array.isArray(summary.steps) ? summary.steps : []
  if (!steps.length) return String(summary.reason || "无步骤摘要")
  return steps.map((step) => {
    if (!step || typeof step !== "object") return ""
    const item = step as { type?: string; status?: string }
    return `${stepLabel(item.type || "-")}:${item.status || "-"}`
  }).filter(Boolean).join(" / ")
}
