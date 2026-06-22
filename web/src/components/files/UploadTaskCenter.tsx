import { useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import { Pause, Play, RefreshCw, Trash2, UploadCloud } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { filesApi, getMessage } from "@/lib/api"
import { formatEntrySize } from "@/lib/format"
import type { UploadTask } from "@/types/api"

export function UploadTaskCenter() {
  const [open, setOpen] = useState(false)
  const [tasks, setTasks] = useState<UploadTask[]>([])
  const [loading, setLoading] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)

  const activeCount = useMemo(() => tasks.filter((task) => ["pending", "running", "paused"].includes(String(task.status || ""))).length, [tasks])

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!open) {
      eventSourceRef.current?.close()
      eventSourceRef.current = null
      return
    }
    if (!window.EventSource || eventSourceRef.current) return
    const source = new EventSource("/api/files/upload/tasks/stream")
    eventSourceRef.current = source
    source.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        const list = Array.isArray(data) ? data : Array.isArray(data?.tasks) ? data.tasks : data?.task ? [data.task] : []
        if (list.length) mergeTasks(list)
      } catch {
        void load(true)
      }
    }
    source.onerror = () => {
      source.close()
      eventSourceRef.current = null
      setTimeout(() => open && void load(true), 1500)
    }
    return () => {
      source.close()
      eventSourceRef.current = null
    }
  }, [open])

  const mergeTasks = (incoming: UploadTask[]) => {
    setTasks((current) => {
      const map = new Map(current.map((task) => [task.task_id || task.client_task_id || String(task.file_name), task]))
      incoming.forEach((task) => map.set(task.task_id || task.client_task_id || String(task.file_name), { ...map.get(task.task_id || ""), ...task }))
      return Array.from(map.values())
    })
  }

  const load = async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const response = await filesApi.uploadTasks()
      setTasks(response.data || [])
    } catch (err) {
      if (!silent) toast.error(getMessage(err, "上传任务加载失败"))
    } finally {
      setLoading(false)
    }
  }

  const action = async (runner: () => Promise<unknown>, ok: string) => {
    try {
      const response = await runner()
      toast.success(response && typeof response === "object" && "message" in response ? String((response as { message?: string }).message || ok) : ok)
      await load(true)
    } catch (err) {
      toast.error(getMessage(err))
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <UploadCloud className="size-4" />
          上传任务{activeCount ? ` ${activeCount}` : ""}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-auto sm:max-w-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center justify-between">
            上传任务
            <Button variant="outline" size="sm" onClick={() => load()} disabled={loading}><RefreshCw className="size-4" />刷新</Button>
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>文件</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="w-44">进度</TableHead>
                <TableHead className="w-28 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks.map((task) => {
                const id = String(task.task_id || task.client_task_id || task.file_name || "")
                const progress = Number(task.progress ?? (task.total ? (Number(task.uploaded || 0) / Number(task.total || 1)) * 100 : 0))
                return (
                  <TableRow key={id}>
                    <TableCell>
                      <div className="font-medium">{task.file_name || task.name || id}</div>
                      <div className="text-xs text-muted-foreground">{task.relative_path || task.path || task.target_path || ""}</div>
                      {task.message || task.error ? <div className="mt-1 text-xs text-muted-foreground">{String(task.error || task.message)}</div> : null}
                    </TableCell>
                    <TableCell><Badge variant="outline">{statusText(task.status)}</Badge></TableCell>
                    <TableCell>
                      <Progress value={Math.max(0, Math.min(100, progress))} />
                      <div className="mt-1 text-xs text-muted-foreground">{Math.round(progress)}% · {formatEntrySize({ is_dir: false, size: Number(task.total || task.size || 0) })}</div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {task.status === "paused" ? <Button variant="ghost" size="icon" onClick={() => action(() => filesApi.resumeUploadTask(id), "已恢复")}><Play className="size-4" /></Button> : null}
                        {["pending", "running"].includes(String(task.status || "")) ? <Button variant="ghost" size="icon" onClick={() => action(() => filesApi.pauseUploadTask(id), "已暂停")}><Pause className="size-4" /></Button> : null}
                        <Button variant="ghost" size="icon" onClick={() => action(() => filesApi.deleteUploadTask(id), "已删除")}><Trash2 className="size-4" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {!tasks.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">暂无上传任务</TableCell></TableRow> : null}
            </TableBody>
          </Table>
        </div>
      </SheetContent>
    </Sheet>
  )
}

function statusText(status?: string) {
  if (status === "running") return "上传中"
  if (status === "pending") return "等待中"
  if (status === "paused") return "已暂停"
  if (status === "success") return "已完成"
  if (status === "failed") return "失败"
  if (status === "canceled") return "已取消"
  return status || "未知"
}
