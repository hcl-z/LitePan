import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ArrowLeftRight, Fingerprint, Play, RefreshCw, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import { formatFileSize } from "@/lib/format"
import type { Account, CrossTransferRoute } from "@/types/api"

type ScannedFile = {
  source_file_id?: string
  rel_path?: string
  rel_dir?: string
  name: string
  size?: number
  hash?: string
}

export function CrossTransferPanel() {
  const [routes, setRoutes] = useState<CrossTransferRoute[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [routeId, setRouteId] = useState("")
  const [sourceAccountId, setSourceAccountId] = useState("")
  const [targetAccountId, setTargetAccountId] = useState("")
  const [sourceParentId, setSourceParentId] = useState("0")
  const [sourcePath, setSourcePath] = useState("/")
  const [targetParentId, setTargetParentId] = useState("0")
  const [targetPath, setTargetPath] = useState("/")
  const [files, setFiles] = useState<ScannedFile[]>([])
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [relayTasks, setRelayTasks] = useState<Record<string, unknown>[]>([])
  const [conflict, setConflict] = useState("rename")
  const [fallback, setFallback] = useState(false)
  const [message, setMessage] = useState("")
  const [running, setRunning] = useState(false)
  const [probeSummary, setProbeSummary] = useState("")
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setMessage("")
    try {
      const [routesRes, accountRes, relayRes] = await Promise.allSettled([
        adminApi.crossTransferRoutes(),
        adminApi.accounts(),
        adminApi.crossTransferRelayTasks(),
      ])
      if (routesRes.status === "fulfilled") {
        const nextRoutes = routesRes.value.data || []
        setRoutes(nextRoutes)
        setRouteId((prev) => prev || nextRoutes[0]?.id || "")
      }
      if (accountRes.status === "fulfilled") {
        const nextAccounts = accountRes.value.data || []
        setAccounts(nextAccounts)
        setSourceAccountId((prev) => prev || (nextAccounts[0]?.id ? String(nextAccounts[0].id) : ""))
        setTargetAccountId((prev) => prev || (nextAccounts[1]?.id ? String(nextAccounts[1].id) : nextAccounts[0]?.id ? String(nextAccounts[0].id) : ""))
      }
      if (relayRes.status === "fulfilled") setRelayTasks(Array.isArray(relayRes.value.data) ? relayRes.value.data : [])
    } catch (err) {
      const text = getMessage(err, "跨盘秒传信息加载失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const route = routes.find((item) => item.id === routeId)
  const method = String(route?.method || route?.id || routeId)
  const selectedFiles = useMemo(() => files.filter((file, index) => selected[fileKey(file, index)]), [files, selected])
  const sourceAccount = accounts.find((item) => String(item.id) === sourceAccountId)
  const targetAccount = accounts.find((item) => String(item.id) === targetAccountId)

  const scan = async () => {
    setRunning(true)
    setMessage("")
    try {
      const response = await adminApi.crossTransferScan({
        source_account_id: Number(sourceAccountId),
        source_parent_id: sourceParentId,
        method,
        source_display_path: sourcePath,
      })
      const data = (response.data || {}) as Record<string, unknown>
      const list = normalizeFiles(data.files || data.items || data.list || [])
      setFiles(list)
      setSelected(Object.fromEntries(list.map((file, index) => [fileKey(file, index), true])))
      const text = response.message || `已扫描 ${list.length} 个文件`
      setMessage(text)
      toast.success(text)
    } catch (err) {
      const text = getMessage(err, "扫描失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setRunning(false)
    }
  }

  const buildExecutePayload = () => ({
    source_account_id: Number(sourceAccountId),
    source_account_name: sourceAccount?.name || "",
    source_driver_type: sourceAccount?.driver_type || "",
    target_account_id: Number(targetAccountId),
    target_account_name: targetAccount?.name || "",
    target_driver_type: targetAccount?.driver_type || "",
    target_parent_id: targetParentId,
    target_display_path: targetPath,
    method,
    files: selectedFiles.map((file) => ({ ...file, hash: file.hash || "" })),
    conflict,
    fallback,
  })

  const probe = async () => {
    if (!selectedFiles.length) {
      toast.warning("请先扫描并选择文件")
      return
    }
    setRunning(true)
    setProbeSummary("")
    try {
      const response = await adminApi.crossTransferProbe(buildExecutePayload())
      const data = response.data && typeof response.data === "object" ? response.data as Record<string, unknown> : {}
      const text = response.message || `预探测完成：可秒传 ${data.hit_count ?? data.ok ?? "-"}，需兜底 ${data.miss_count ?? data.pending ?? "-"}`
      setProbeSummary(text)
      toast.success(text)
    } catch (err) {
      const text = getMessage(err, "预探测失败")
      setProbeSummary(text)
      toast.error(text)
    } finally {
      setRunning(false)
    }
  }

  const execute = async () => {
    if (!selectedFiles.length) {
      toast.warning("请先选择要转存的文件")
      return
    }
    const ok = await confirm({
      title: `执行 ${selectedFiles.length} 个文件的跨盘秒传？`,
      description: fallback ? "未命中的文件会加入兜底传输任务。" : "未命中的文件会在结果中标记失败。",
      confirmText: "执行",
    })
    if (!ok) return
    setRunning(true)
    setMessage("")
    try {
      const response = await adminApi.crossTransferExecute(buildExecutePayload())
      const text = String(response || "").split("\n").filter(Boolean).slice(-1)[0] || "跨盘秒传已执行"
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err, "执行失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setRunning(false)
    }
  }

  const deleteRelayTasks = async () => {
    const ids = relayTasks.map((task) => String(task.id || task.task_id || "")).filter(Boolean)
    if (!ids.length) return
    const ok = await confirm({ title: `删除 ${ids.length} 个兜底传输任务？`, confirmText: "删除", destructive: true })
    if (!ok) return
    try {
      const response = await adminApi.deleteCrossTransferRelayTasks(ids)
      const text = response.message || "兜底任务已删除"
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err, "删除失败")
      setMessage(text)
      toast.error(text)
    }
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">跨盘秒传</h2>
          <p className="text-sm text-muted-foreground">选择可用线路，扫描源目录并把可命中的文件转存到目标目录。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="size-4" />刷新</Button>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <Tabs defaultValue="transfer">
        <TabsList>
          <TabsTrigger value="transfer">转存操作</TabsTrigger>
          <TabsTrigger value="relay">兜底任务</TabsTrigger>
        </TabsList>
        <TabsContent value="transfer" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ArrowLeftRight className="size-4 text-primary" />传输配置</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label="秒传线路">
                  <Select value={routeId} onValueChange={setRouteId}>
                    <SelectTrigger><SelectValue placeholder="选择线路" /></SelectTrigger>
                    <SelectContent>
                      {routes.map((item) => <SelectItem key={item.id} value={item.id}>{routeLabel(item)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-1">
                  <AccountPicker label="源账号" value={sourceAccountId} accounts={accounts} onChange={setSourceAccountId} />
                  <AccountPicker label="目标账号" value={targetAccountId} accounts={accounts} onChange={setTargetAccountId} />
                </div>
                <Field label="源目录">
                  <FolderPicker
                    accountId={sourceAccountId}
                    value={{ id: sourceParentId, path: sourcePath }}
                    title="选择跨盘秒传源目录"
                    description="选择要扫描指纹并转存的源目录。"
                    onSelect={(folder) => {
                      setSourceParentId(folder.id)
                      setSourcePath(folder.path)
                    }}
                  />
                  <div className="text-xs text-muted-foreground">目录 ID：{sourceParentId || "0"}</div>
                </Field>
                <Field label="目标目录">
                  <FolderPicker
                    accountId={targetAccountId}
                    value={{ id: targetParentId, path: targetPath }}
                    title="选择跨盘秒传目标目录"
                    description="选择命中文件转存到的目标目录。"
                    onSelect={(folder) => {
                      setTargetParentId(folder.id)
                      setTargetPath(folder.path)
                    }}
                  />
                  <div className="text-xs text-muted-foreground">目录 ID：{targetParentId || "0"}</div>
                </Field>
                <Field label="冲突策略">
                  <Select value={conflict} onValueChange={setConflict}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="rename">自动重命名</SelectItem>
                      <SelectItem value="overwrite">覆盖</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <label className="flex items-center gap-2 rounded-md border p-3 text-sm">
                  <Checkbox checked={fallback} onCheckedChange={(value) => setFallback(Boolean(value))} />
                  未命中文件启用兜底传输
                </label>
                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={scan} disabled={running || !routeId || !sourceAccountId}>
                    <Fingerprint className="size-4" />
                    扫描
                  </Button>
                  <Button type="button" variant="outline" onClick={probe} disabled={running || !selectedFiles.length}>
                    <Fingerprint className="size-4" />
                    预探测
                  </Button>
                  <Button type="button" onClick={execute} disabled={running || !selectedFiles.length}>
                    <Play className="size-4" />
                    执行秒传
                  </Button>
                </div>
                {probeSummary ? <div className="rounded-md border bg-muted px-3 py-2 text-xs text-muted-foreground">{probeSummary}</div> : null}
              </CardContent>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">扫描结果</CardTitle>
                <Badge variant="outline">已选 {selectedFiles.length} / {files.length}</Badge>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10"></TableHead>
                      <TableHead>文件</TableHead>
                      <TableHead className="w-32">大小</TableHead>
                      <TableHead className="w-48">指纹</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {files.map((file, index) => {
                      const key = fileKey(file, index)
                      return (
                        <TableRow key={key}>
                          <TableCell><Checkbox checked={Boolean(selected[key])} onCheckedChange={(value) => setSelected((prev) => ({ ...prev, [key]: Boolean(value) }))} /></TableCell>
                          <TableCell>
                            <div className="font-medium">{file.name}</div>
                            <div className="text-xs text-muted-foreground">{file.rel_path || file.rel_dir || "-"}</div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{formatFileSize(file.size)}</TableCell>
                          <TableCell className="truncate font-mono text-xs text-muted-foreground">{file.hash || "-"}</TableCell>
                        </TableRow>
                      )
                    })}
                    {!files.length ? <TableRow><TableCell colSpan={4} className="h-48 text-center text-muted-foreground">选择线路和源目录后执行扫描</TableCell></TableRow> : null}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="relay" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">兜底传输任务</CardTitle>
              <Button variant="destructive" onClick={deleteRelayTasks} disabled={!relayTasks.length}><Trash2 className="size-4" />清空任务</Button>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>任务</TableHead>
                    <TableHead className="w-32">状态</TableHead>
                    <TableHead className="w-32">进度</TableHead>
                    <TableHead className="w-48">消息</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relayTasks.map((task, index) => (
                    <TableRow key={String(task.id || index)}>
                      <TableCell className="font-medium">{String(task.name || task.file_name || task.id || "跨盘任务")}</TableCell>
                      <TableCell><StatusBadge status={String(task.status || "unknown")} /></TableCell>
                      <TableCell className="font-mono text-xs">{String(task.progress ?? task.percent ?? "-")}</TableCell>
                      <TableCell className="truncate text-xs text-muted-foreground">{String(task.message || task.error || "-")}</TableCell>
                    </TableRow>
                  ))}
                  {!relayTasks.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">暂无兜底传输任务</TableCell></TableRow> : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid gap-2"><Label>{label}</Label>{children}</div>
}

function AccountPicker({ label, value, accounts, onChange }: { label: string; value: string; accounts: Account[]; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder={label} /></SelectTrigger>
        <SelectContent>
          {accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  )
}

function routeLabel(route: CrossTransferRoute) {
  const from = route.from?.name || route.from?.id || "源"
  const to = route.to?.name || route.to?.id || "目标"
  return `${from} -> ${to} · ${route.method_label || route.method || route.id}`
}

function normalizeFiles(value: unknown): ScannedFile[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => item && typeof item === "object" ? item as ScannedFile : null).filter(Boolean) as ScannedFile[]
}

function fileKey(file: ScannedFile, index: number) {
  return `${file.source_file_id || file.rel_path || file.name}-${index}`
}
