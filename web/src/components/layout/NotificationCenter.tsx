import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { Bell, CheckCheck, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { NotificationItem } from "@/types/api"

export function NotificationCenter({ enabled }: { enabled?: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const navigate = useNavigate()

  const visibleItems = useMemo(() => items.slice(0, 10), [items])

  useEffect(() => {
    if (!enabled) return
    void load(true)
    const timer = window.setInterval(() => void load(true), 30000)
    return () => window.clearInterval(timer)
  }, [enabled])

  const load = async (silent = false) => {
    if (!enabled) return
    try {
      const [notifications, count] = await Promise.all([adminApi.notifications(), adminApi.unreadCount()])
      setItems(notifications.data || [])
      const countValue = typeof count.data === "number" ? count.data : Number(count.data?.count || 0)
      setUnread(countValue)
    } catch (err) {
      if (!silent) toast.error(getMessage(err, "通知加载失败"))
    }
  }

  const markAllRead = async () => {
    try {
      await adminApi.markAllRead()
      toast.success("通知已全部标记为已读")
      await load(true)
    } catch (err) {
      toast.error(getMessage(err, "操作失败"))
    }
  }

  const remove = async (id: number) => {
    try {
      await adminApi.deleteNotification(id)
      toast.success("通知已删除")
      await load(true)
    } catch (err) {
      toast.error(getMessage(err, "删除失败"))
    }
  }

  const openItem = async (item: NotificationItem) => {
    try {
      if (!item.read) await adminApi.markNotificationRead(item.id)
      if (item.action_route) navigate(`/admin?page=${encodeURIComponent(item.action_route.replace(/^\/+/, "") || "dashboard")}`)
      await load(true)
    } catch (err) {
      toast.error(getMessage(err, "通知处理失败"))
    }
  }

  if (!enabled) return null

  return (
    <DropdownMenu onOpenChange={(open) => open && load(true)}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="通知">
          <Bell />
          {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{unread > 99 ? "99+" : unread}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px]">
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0">通知</DropdownMenuLabel>
          {unread > 0 ? <Button variant="ghost" size="sm" onClick={markAllRead}><CheckCheck className="size-4" />全部已读</Button> : null}
        </div>
        <DropdownMenuSeparator />
        {visibleItems.map((item) => (
          <DropdownMenuItem key={item.id} className="flex items-start gap-3 py-3" onSelect={(event) => event.preventDefault()}>
            <button className="min-w-0 flex-1 text-left" onClick={() => openItem(item)}>
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{item.title}</span>
                {!item.read ? <Badge variant="default" className="h-5 px-1.5 text-[10px]">新</Badge> : null}
              </div>
              <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.message}</div>
              <div className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(item.created_at)}</div>
            </button>
            <Button variant="ghost" size="icon" className="size-7" onClick={() => remove(item.id)}><Trash2 className="size-3.5" /></Button>
          </DropdownMenuItem>
        ))}
        {!visibleItems.length ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无通知</div> : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
