import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"

export const activeMediaStatuses = new Set(["running", "planning", "stopping"])

export type MediaLogEntry = {
  time?: string
  message?: string
}

export type MediaRunResult = {
  total?: number
  renamed?: number
  moved?: number
  skipped?: number
  failed?: number
  stopped?: boolean
  [key: string]: unknown
}

export type MediaPlanAction = {
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

export type MediaPlan = {
  actions?: MediaPlanAction[]
  skipped?: Array<Record<string, unknown>>
  diagnostics?: Record<string, unknown>
  [key: string]: unknown
}

export function isActiveMediaStatus(status?: string) {
  return activeMediaStatuses.has(String(status || ""))
}

export function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

export function normalizePlan(value: unknown): MediaPlan | null {
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

export function planActionMeta(action: MediaPlanAction) {
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

export function scanModeText(mode?: string) {
  if (mode === "incremental_missing") return "仅补缺失"
  if (mode === "full_sync") return "全量同步"
  return "增量更新"
}

export function Metric({ title, value, small }: { title: string; value: string | number; small?: boolean }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{title}</div>
        <div className={small ? "mt-1 truncate text-sm font-medium" : "mt-1 font-mono text-2xl font-semibold"}>{value}</div>
      </CardContent>
    </Card>
  )
}

export function PlanMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border bg-card p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 truncate font-mono text-lg font-semibold">{value}</div>
    </div>
  )
}

export function PlanProgress({ progress }: { progress: Record<string, unknown> }) {
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

export function PlanSection({ title, items, muted }: { title: string; items: string[]; muted?: boolean }) {
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

export function RunResultSummary({ result }: { result: MediaRunResult | null }) {
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

export function TextField({ label, value, onChange, placeholder, type = "text" }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} />
    </div>
  )
}

export function NumberField({ label, value, min, max, onChange }: { label: string; value: number; min?: number; max?: number; onChange: (value: number) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <Input type="number" value={value} min={min} max={max} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </div>
  )
}

export function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
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

export function SwitchField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      <div className="flex h-10 items-center rounded-md border px-3">
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  )
}
