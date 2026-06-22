import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Database, MoreHorizontal, Plus, RefreshCw, Save, Square, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime, formatFileSize } from "@/lib/format"
import type { Account, CacheConfig, CacheRetentionConfig } from "@/types/api"

const defaultCacheConfig: CacheConfig = {
  cache_enabled: true,
  cache_ttl: 60,
  cache_persistence_enabled: true,
  cache_persistence_interval_minutes: 10,
  cache_max_items: 100000,
  cache_memory_limit_mb: 512,
}

const defaultRetentionForm = {
  account_id: "",
  parent_id: "0",
  path: "/",
  scan_depth: "1",
  api_interval: 200,
  refresh_interval: 60,
  time_window_enabled: false,
  time_start: "00:00",
  time_end: "00:00",
}

export function CachePanel() {
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [config, setConfig] = useState<CacheConfig>(defaultCacheConfig)
  const [retention, setRetention] = useState<CacheRetentionConfig[]>([])
  const [retentionStats, setRetentionStats] = useState<Record<string, unknown>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [editing, setEditing] = useState<CacheRetentionConfig | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setMessage("")
    try {
      const [statsRes, configRes, configsRes, retentionStatsRes, accountsRes] = await Promise.allSettled([
        adminApi.cacheStats(),
        adminApi.cacheConfig(),
        adminApi.cacheRetentionConfigs(),
        adminApi.cacheRetentionStats(),
        adminApi.cacheRetentionAccounts(),
      ])
      if (statsRes.status === "fulfilled") setStats((statsRes.value.data || {}) as Record<string, unknown>)
      if (configRes.status === "fulfilled") setConfig({ ...defaultCacheConfig, ...(configRes.value.data || {}) })
      if (configsRes.status === "fulfilled") setRetention(configsRes.value.data || [])
      if (retentionStatsRes.status === "fulfilled") setRetentionStats((retentionStatsRes.value.data || {}) as Record<string, unknown>)
      if (accountsRes.status === "fulfilled") setAccounts(accountsRes.value.data || [])
    } catch (err) {
      const text = getMessage(err, "缓存信息加载失败")
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

  const saveConfig = () => action(() => adminApi.updateCacheConfig(config), "缓存配置已保存")
  const clear = async () => {
    const ok = await confirm({ title: "确认清理全部缓存？", description: "会清空当前内存与持久化缓存。", confirmText: "清理", destructive: true })
    if (ok) await action(() => adminApi.clearCache(), "缓存已清理")
  }

  const deleteRetention = async (id: number) => {
    const ok = await confirm({ title: "删除该缓存保持目录？", description: "删除后该目录不会再被周期刷新。", confirmText: "删除", destructive: true })
    if (ok) await action(() => adminApi.deleteCacheRetention(id, false), "配置已删除")
  }

  const totalSize = Number(stats.total_size_bytes || 0)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">缓存管理</h2>
          <p className="text-sm text-muted-foreground">全局缓存参数、缓存保持目录和手动刷新任务。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="size-4" />刷新</Button>
          <Button variant="destructive" onClick={clear} disabled={loading}><Trash2 className="size-4" />清理缓存</Button>
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric title="缓存条目" value={String(stats.total_keys ?? 0)} />
        <Metric title="缓存大小" value={formatFileSize(totalSize)} />
        <Metric title="命中率" value={`${Number(stats.hit_rate || 0).toFixed(1)}%`} />
        <Metric title="保持任务" value={String(retentionStats.total_count ?? retention.length)} />
      </div>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">全局配置</TabsTrigger>
          <TabsTrigger value="retention">缓存保持</TabsTrigger>
        </TabsList>
        <TabsContent value="config" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="size-4 text-primary" />缓存策略</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <SwitchField label="启用缓存" checked={config.cache_enabled} onCheckedChange={(value) => setConfig((prev) => ({ ...prev, cache_enabled: value }))} />
                <SwitchField label="持久化缓存" checked={config.cache_persistence_enabled} onCheckedChange={(value) => setConfig((prev) => ({ ...prev, cache_persistence_enabled: value }))} />
                <NumberField label="缓存过期时间（分钟）" value={config.cache_ttl} min={1} max={1440} onChange={(value) => setConfig((prev) => ({ ...prev, cache_ttl: value }))} />
                <NumberField label="持久化快照间隔（分钟）" value={config.cache_persistence_interval_minutes} min={1} max={1440} onChange={(value) => setConfig((prev) => ({ ...prev, cache_persistence_interval_minutes: value }))} />
                <NumberField label="最大缓存条目" value={config.cache_max_items} min={1000} max={1000000} onChange={(value) => setConfig((prev) => ({ ...prev, cache_max_items: value }))} />
                <NumberField label="内存上限（MB）" value={config.cache_memory_limit_mb} min={64} max={16384} onChange={(value) => setConfig((prev) => ({ ...prev, cache_memory_limit_mb: value }))} />
              </div>
              <div>
                <Button onClick={saveConfig}><Save className="size-4" />保存缓存配置</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="retention" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">缓存保持目录</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => action(() => adminApi.refreshAllCacheRetention(), "已触发全部任务")}>全部执行</Button>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open)
                  if (!open) setEditing(null)
                }}>
                  <DialogTrigger asChild>
                    <Button disabled={retention.length >= 6}>
                      <Plus className="size-4" />
                      添加目录
                    </Button>
                  </DialogTrigger>
                  <RetentionDialog
                    accounts={accounts}
                    config={editing}
                    onSaved={async (text) => {
                      setDialogOpen(false)
                      setEditing(null)
                      setMessage(text)
                      await load()
                    }}
                  />
                </Dialog>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>目录</TableHead>
                    <TableHead className="w-36">账号</TableHead>
                    <TableHead className="w-32">状态</TableHead>
                    <TableHead className="w-52">最后刷新</TableHead>
                    <TableHead className="w-14 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {retention.map((item) => {
                    const executing = Array.isArray(retentionStats.executing_task_ids) && retentionStats.executing_task_ids.includes(item.id)
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="font-medium">{item.path || "/"}</div>
                          <div className="text-xs text-muted-foreground">
                            层级 {scanDepthText(item.scan_depth)}，每 {item.refresh_interval || 60} 分钟，API 间隔 {item.api_interval || 0} ms
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.account_name || item.account_id}</TableCell>
                        <TableCell><StatusBadge status={executing ? "running" : item.status || "unknown"} /></TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          <div>{formatDateTime(item.last_refresh)}</div>
                          <div>{item.last_refresh_status || "尚未执行"}，文件 {item.file_count || item.scanned_files || 0}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => action(() => adminApi.refreshCacheRetention(item.id), "已触发刷新")}>立即执行</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => action(() => adminApi.toggleCacheRetention(item.id), "状态已切换")}>{item.status === "running" ? "禁用" : "启用"}</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => action(() => adminApi.forceStopCacheRetention(item.id), "已请求停止")}><Square className="size-4" />强制停止</DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                setEditing(item)
                                setDialogOpen(true)
                              }}>修改配置</DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteRetention(item.id)}>
                                <Trash2 className="size-4" />
                                删除
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  {!retention.length ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">尚未配置缓存保持目录</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RetentionDialog({ accounts, config, onSaved }: { accounts: Account[]; config: CacheRetentionConfig | null; onSaved: (message: string) => void | Promise<void> }) {
  const [form, setForm] = useState(defaultRetentionForm)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    setForm(config ? {
      account_id: String(config.account_id || ""),
      parent_id: config.parent_id || "0",
      path: config.path || "/",
      scan_depth: String(config.scan_depth ?? 1),
      api_interval: config.api_interval || 200,
      refresh_interval: config.refresh_interval || 60,
      time_window_enabled: Boolean(config.time_window_enabled),
      time_start: config.time_start || "00:00",
      time_end: config.time_end || "00:00",
    } : { ...defaultRetentionForm, account_id: accounts[0]?.id ? String(accounts[0].id) : "" })
    setMessage("")
  }, [config, accounts])

  const save = async () => {
    setSaving(true)
    setMessage("")
    try {
      const payload = {
        account_id: Number(form.account_id),
        parent_id: form.parent_id || "0",
        path: form.path || "/",
        recursive: form.scan_depth !== "1",
        scan_depth: form.scan_depth === "0" ? null : Number(form.scan_depth),
        api_interval: Number(form.api_interval),
        refresh_interval: Number(form.refresh_interval),
        time_window_enabled: form.time_window_enabled,
        time_start: form.time_start || "00:00",
        time_end: form.time_end || "00:00",
      }
      if (!payload.account_id) throw new Error("请选择账号")
      const response = config ? await adminApi.updateCacheRetention(config.id, payload) : await adminApi.createCacheRetention(payload)
      await onSaved(response.message || "缓存保持配置已保存")
    } catch (err) {
      setMessage(getMessage(err, "保存失败"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{config ? "修改缓存保持目录" : "添加缓存保持目录"}</DialogTitle>
        <DialogDescription>选择账号和目录，LitePan 会按周期刷新目录列表并保持缓存热度。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="grid gap-2">
          <Label>账号</Label>
          <Select value={form.account_id} onValueChange={(value) => setForm((prev) => ({ ...prev, account_id: value }))}>
            <SelectTrigger><SelectValue placeholder="选择账号" /></SelectTrigger>
            <SelectContent>
              {accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 md:col-span-2">
          <Label>目录</Label>
          <FolderPicker
            accountId={form.account_id}
            value={{ id: form.parent_id, path: form.path }}
            title="选择缓存保持目录"
            description="选择需要周期刷新并保持缓存热度的网盘目录。"
            onSelect={(folder) => setForm((prev) => ({ ...prev, parent_id: folder.id, path: folder.path }))}
          />
          <div className="text-xs text-muted-foreground">目录 ID：{form.parent_id || "0"}</div>
        </div>
        <div className="grid gap-2">
          <Label>扫描层级</Label>
          <Select value={form.scan_depth} onValueChange={(value) => setForm((prev) => ({ ...prev, scan_depth: value }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">仅当前目录</SelectItem>
              <SelectItem value="2">向下 2 层</SelectItem>
              <SelectItem value="3">向下 3 层</SelectItem>
              <SelectItem value="0">无限递归</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <NumberField label="刷新间隔（分钟）" value={form.refresh_interval} min={1} max={1440} onChange={(value) => setForm((prev) => ({ ...prev, refresh_interval: value }))} />
        <NumberField label="API 额外间隔（毫秒）" value={form.api_interval} min={0} max={5000} onChange={(value) => setForm((prev) => ({ ...prev, api_interval: value }))} />
        <SwitchField label="启用时间窗口" checked={form.time_window_enabled} onCheckedChange={(value) => setForm((prev) => ({ ...prev, time_window_enabled: value }))} />
        {form.time_window_enabled ? (
          <>
            <div className="grid gap-2">
              <Label htmlFor="time-start">开始时间</Label>
              <Input id="time-start" type="time" value={form.time_start} onChange={(event) => setForm((prev) => ({ ...prev, time_start: event.target.value }))} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="time-end">结束时间</Label>
              <Input id="time-end" type="time" value={form.time_end} onChange={(event) => setForm((prev) => ({ ...prev, time_end: event.target.value }))} />
            </div>
          </>
        ) : null}
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <DialogFooter>
        <Button onClick={save} disabled={saving}>{saving ? "保存中" : "保存配置"}</Button>
      </DialogFooter>
    </DialogContent>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
      </CardContent>
    </Card>
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

function SwitchField({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (value: boolean) => void }) {
  return (
    <div className="flex h-10 items-center justify-between rounded-md border px-3">
      <Label>{label}</Label>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  )
}

function scanDepthText(depth?: number | null) {
  if (!depth || depth <= 0) return "无限"
  if (depth === 1) return "当前"
  return `${depth} 层`
}
