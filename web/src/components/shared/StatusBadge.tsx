import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

interface StatusBadgeProps {
  status?: string | boolean | null
  className?: string
}

const statusMap: Record<string, { label: string; className: string }> = {
  connected: { label: "在线", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  active: { label: "启用", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  enabled: { label: "启用", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  success: { label: "完成", className: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300" },
  running: { label: "运行中", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300" },
  scanning: { label: "扫描中", className: "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300" },
  queued: { label: "排队中", className: "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-300" },
  idle: { label: "空闲", className: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300" },
  paused: { label: "暂停", className: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300" },
  failed: { label: "失败", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" },
  error: { label: "异常", className: "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300" },
  warning: { label: "警告", className: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300" },
  disabled: { label: "停用", className: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300" },
  unknown: { label: "未知", className: "border-zinc-200 bg-zinc-50 text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300" },
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = typeof status === "boolean" ? (status ? "active" : "disabled") : String(status || "unknown").toLowerCase()
  const config = statusMap[key] || { label: String(status || "未知"), className: statusMap.unknown.className }

  return (
    <Badge variant="outline" className={cn("gap-1.5", config.className, className)}>
      {config.label}
    </Badge>
  )
}
