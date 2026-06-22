import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Bell, Database, HardDrive, ListChecks, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { DriverAvatar } from "@/components/shared/DriverAvatar"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { adminApi, getMessage } from "@/lib/api"
import type { Account, NotificationItem } from "@/types/api"

interface AdminDashboardProps {
  onNavigate: (page: string) => void
}

export function AdminDashboard({ onNavigate }: AdminDashboardProps) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [cacheStats, setCacheStats] = useState<Record<string, unknown>>({})
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const [strmTasks, setStrmTasks] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")

  const onlineCount = useMemo(() => accounts.filter((account) => account.enabled !== false && account.status !== "failed" && account.status !== "error").length, [accounts])
  const issueCount = useMemo(() => accounts.filter((account) => account.status === "failed" || account.status === "error" || account.enabled === false).length, [accounts])
  const onlineRate = accounts.length ? Math.round((onlineCount / accounts.length) * 100) : 0

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setError("")
    try {
      const [accountRes, cacheRes, notificationRes, strmRes] = await Promise.allSettled([
        adminApi.accounts(),
        adminApi.cacheStats(),
        adminApi.notifications(),
        adminApi.strmTasks(),
      ])
      if (accountRes.status === "fulfilled") setAccounts(accountRes.value.data || [])
      if (cacheRes.status === "fulfilled") setCacheStats(cacheRes.value.data || {})
      if (notificationRes.status === "fulfilled") setNotifications(notificationRes.value.data || [])
      if (strmRes.status === "fulfilled") setStrmTasks(Array.isArray(strmRes.value.data) ? strmRes.value.data : [])
    } catch (err) {
      setError(getMessage(err, "仪表盘加载失败"))
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <Skeleton className="h-[520px] w-full" />
  }

  return (
    <div className="grid gap-5">
      {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
      <Card className="overflow-hidden">
        <CardContent className="grid gap-6 p-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div>
            <Badge variant="outline" className="mb-4">控制台总览</Badge>
            <h2 className="text-3xl font-semibold tracking-normal">{issueCount ? `${issueCount} 项需要关注` : "系统运行正常"}</h2>
            <p className="mt-3 max-w-[62ch] text-sm leading-6 text-muted-foreground">
              管理存储账号、缓存、STRM 任务、系统日志与插件。这里保留高频操作入口，复杂配置在对应模块内完成。
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Button onClick={() => onNavigate("accounts")}>
                <HardDrive />
                管理账号
              </Button>
              <Button variant="outline" onClick={load}>
                <RefreshCw />
                刷新数据
              </Button>
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-5">
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-medium">账号在线率</span>
              <span className="text-muted-foreground">{onlineRate}%</span>
            </div>
            <Progress value={onlineRate} />
            <div className="mt-5 grid grid-cols-3 gap-3">
              <Metric label="接入" value={accounts.length} />
              <Metric label="在线" value={onlineCount} />
              <Metric label="通知" value={notifications.filter((item) => !item.read).length} />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>存储账号</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("accounts")}>查看全部</Button>
          </CardHeader>
          <CardContent className="grid gap-3">
            {accounts.slice(0, 6).map((account) => (
              <button key={account.id} className="flex items-center gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent" onClick={() => onNavigate("accounts")}>
                <DriverAvatar name={account.driver_card_name || account.name} color={account.driver_card_color} logo={account.driver_card_logo} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{account.name}</div>
                  <div className="truncate text-xs text-muted-foreground">{account.driver_type}</div>
                </div>
                <StatusBadge status={account.enabled === false ? "disabled" : account.status || "unknown"} />
              </button>
            ))}
            {!accounts.length ? <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">还没有存储账号。</div> : null}
          </CardContent>
        </Card>

        <div className="grid gap-5">
          <QuickPanel icon={Database} title="缓存状态" action="缓存中心" onClick={() => onNavigate("cache")}>
            <div className="grid gap-2 text-sm">
              <InfoRow label="缓存条目" value={String(cacheStats.total_keys ?? 0)} />
              <InfoRow label="缓存大小" value={`${Number(cacheStats.total_size_bytes || 0) / 1024 / 1024 < 1 ? "< 1" : (Number(cacheStats.total_size_bytes || 0) / 1024 / 1024).toFixed(1)} MB`} />
              <InfoRow label="命中率" value={`${Number(cacheStats.hit_rate || 0).toFixed(1)}%`} />
            </div>
          </QuickPanel>
          <QuickPanel icon={ListChecks} title="媒体任务" action="媒体管理" onClick={() => onNavigate("media")}>
            <div className="text-sm text-muted-foreground">当前读取到 {strmTasks.length} 个 STRM 任务。</div>
          </QuickPanel>
          <QuickPanel icon={Bell} title="通知" action="查看日志" onClick={() => onNavigate("logs")}>
            <div className="grid gap-2">
              {notifications.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-md border p-2 text-sm">
                  <div className="font-medium">{item.title}</div>
                  <div className="line-clamp-1 text-xs text-muted-foreground">{item.message}</div>
                </div>
              ))}
              {!notifications.length ? <div className="text-sm text-muted-foreground">暂无通知。</div> : null}
            </div>
          </QuickPanel>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border px-3 py-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  )
}

function QuickPanel({ icon: Icon, title, action, onClick, children }: { icon: typeof AlertTriangle; title: string; action: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="size-4 text-primary" />
          {title}
        </CardTitle>
        <Button variant="ghost" size="sm" onClick={onClick}>{action}</Button>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}
