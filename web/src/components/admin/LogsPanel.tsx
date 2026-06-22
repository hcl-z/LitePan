import { useEffect, useState } from "react"
import { toast } from "sonner"
import { RefreshCw, Search, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { LogEntry } from "@/types/api"

export function LogsPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [stats, setStats] = useState<Record<string, unknown>>({})
  const [levels, setLevels] = useState<Array<{ value: number; name: string; emoji?: string }>>([])
  const [modules, setModules] = useState<Array<{ value: string; name: string; color?: string }>>([])
  const [level, setLevel] = useState("all")
  const [module, setModule] = useState("all")
  const [keyword, setKeyword] = useState("")
  const [limit, setLimit] = useState(100)
  const [message, setMessage] = useState("")
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setMessage("")
    try {
      const params: Record<string, unknown> = { limit }
      if (level !== "all") params.level = level
      if (module !== "all") params.module = module
      if (keyword.trim()) params.keyword = keyword.trim()
      const [logsRes, statsRes, levelsRes, modulesRes] = await Promise.allSettled([
        adminApi.logs(params),
        adminApi.logStats(),
        adminApi.logLevels(),
        adminApi.logModules(),
      ])
      if (logsRes.status === "fulfilled") setLogs(logsRes.value || [])
      if (statsRes.status === "fulfilled") setStats((statsRes.value || {}) as Record<string, unknown>)
      if (levelsRes.status === "fulfilled") setLevels(levelsRes.value || [])
      if (modulesRes.status === "fulfilled") setModules(modulesRes.value || [])
    } catch (err) {
      const text = getMessage(err, "日志加载失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const cleanup = async () => {
    const ok = await confirm({ title: "按当前保留策略清理旧日志？", description: "会删除超过保留天数的日志。", confirmText: "清理", destructive: true })
    if (!ok) return
    try {
      const response = await adminApi.cleanupLogs(30)
      const text = response.message || `日志清理完成，删除 ${response.deleted || 0} 条`
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err, "清理失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const deleteFiltered = async () => {
    const ok = await confirm({ title: "删除当前筛选条件匹配的日志？", description: "此操作会按当前级别、模块和关键词删除日志。", confirmText: "删除", destructive: true })
    if (!ok) return
    try {
      const params: Record<string, unknown> = {}
      if (level !== "all") params.level = level
      if (module !== "all") params.module = module
      if (keyword.trim()) params.keyword = keyword.trim()
      const response = await adminApi.deleteFilteredLogs(params)
      const text = response.message || `筛选日志已删除，删除 ${response.deleted || 0} 条`
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
          <h2 className="text-xl font-semibold">系统日志</h2>
          <p className="text-sm text-muted-foreground">按级别、模块和关键词筛选日志，并清理过期记录。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="size-4" />刷新</Button>
          <Button variant="outline" onClick={cleanup}><Trash2 className="size-4" />清理旧日志</Button>
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <div className="grid gap-3 md:grid-cols-4">
        <Metric title="总日志" value={String(stats.total_logs ?? stats.total ?? "-")} />
        <Metric title="近 24 小时错误" value={String(stats.recent_errors ?? "-")} />
        <Metric title="活跃模块" value={String(stats.by_module && typeof stats.by_module === "object" ? Object.keys(stats.by_module).length : "-")} />
        <Metric title="当前结果" value={String(logs.length)} />
      </div>

      <Card className="p-4">
        <div className="grid gap-3 md:grid-cols-[180px_180px_1fr_120px_auto]">
          <div className="grid gap-2">
            <Label>级别</Label>
            <Select value={level} onValueChange={setLevel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {levels.map((item) => <SelectItem key={item.value} value={String(item.value)}>{item.emoji ? `${item.emoji} ` : ""}{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>模块</Label>
            <Select value={module} onValueChange={setModule}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部</SelectItem>
                {modules.map((item) => <SelectItem key={item.value} value={item.value}>{item.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>关键词</Label>
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="消息内容" />
          </div>
          <div className="grid gap-2">
            <Label>数量</Label>
            <Input type="number" value={limit} min={20} max={1000} onChange={(event) => setLimit(Number(event.target.value || 100))} />
          </div>
          <div className="flex items-end gap-2">
            <Button type="button" onClick={load}><Search className="size-4" />筛选</Button>
            <Button type="button" variant="destructive" onClick={deleteFiltered}><Trash2 className="size-4" />删除筛选</Button>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-44">时间</TableHead>
              <TableHead className="w-28">级别</TableHead>
              <TableHead className="w-36">模块</TableHead>
              <TableHead>消息</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log, index) => (
              <TableRow key={log.id || index}>
                <TableCell className="text-xs text-muted-foreground">{formatDateTime(log.timestamp)}</TableCell>
                <TableCell><LogLevelBadge log={log} /></TableCell>
                <TableCell><Badge variant="outline">{log.module_name || log.module || "-"}</Badge></TableCell>
                <TableCell className="max-w-[720px] whitespace-pre-wrap text-sm">
                  <div>{log.message || "-"}</div>
                  {log.driver_name || log.account_id ? (
                    <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {log.driver_name ? <span>驱动 {log.driver_name}</span> : null}
                      {log.account_id ? <span>账号 {log.account_id}</span> : null}
                    </div>
                  ) : null}
                  {log.details ? <pre className="mt-2 max-h-32 overflow-auto rounded-md bg-muted p-2 text-xs text-muted-foreground">{formatDetails(log.details)}</pre> : null}
                </TableCell>
              </TableRow>
            ))}
            {!logs.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">暂无日志</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{title}</div>
      <div className="mt-1 font-mono text-2xl font-semibold">{value}</div>
    </Card>
  )
}

function LogLevelBadge({ log }: { log: LogEntry }) {
  const value = Number(log.level)
  const className = value >= 40
    ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300"
    : value >= 30
      ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300"
      : "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
  return <Badge variant="outline" className={className}>{log.level_emoji ? `${log.level_emoji} ` : ""}{log.level_name || log.level || "INFO"}</Badge>
}

function formatDetails(details: LogEntry["details"]) {
  if (!details) return ""
  if (typeof details === "string") return details
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return String(details)
  }
}
