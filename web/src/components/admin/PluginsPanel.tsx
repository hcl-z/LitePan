import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { MoreHorizontal, Play, Puzzle, RefreshCw, Save, Search, TestTube2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { adminApi, getMessage } from "@/lib/api"
import type { ConfigField, PluginInfo } from "@/types/api"

export function PluginsPanel() {
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState("")
  const [editing, setEditing] = useState<PluginInfo | null>(null)
  const [runtimePlugin, setRuntimePlugin] = useState<PluginInfo | null>(null)
  const [searchKeyword, setSearchKeyword] = useState("")
  const [searchResult, setSearchResult] = useState<unknown>(null)
  const [searchJobId, setSearchJobId] = useState("")

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setMessage("")
    try {
      const response = await adminApi.plugins()
      setPlugins(response.data || [])
    } catch (err) {
      const text = getMessage(err, "插件加载失败")
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

  const rescan = () => action(() => adminApi.rescanPlugins(), "插件扫描完成")
  const visible = plugins.filter((plugin) => `${plugin.id || ""} ${plugin.name || ""} ${plugin.description || ""}`.toLowerCase().includes(query.toLowerCase()))
  const searchPlugins = plugins.filter((plugin) => Boolean(plugin.id) && (String(plugin.id).includes("search") || String(plugin.name || "").includes("搜索")))

  const runSearch = async () => {
    setMessage("")
    try {
      const start = await adminApi.startPluginSearchJob({ keyword: searchKeyword, plugin_id: searchPlugins[0]?.id, page: 1 })
      const jobId = String((start.data as Record<string, unknown>)?.job_id || (start.data as Record<string, unknown>)?.id || "")
      setSearchJobId(jobId)
      if (!jobId) {
        const response = await adminApi.searchPlugins({ keyword: searchKeyword, plugin_id: searchPlugins[0]?.id, page: 1 })
        setSearchResult(response.data)
        setMessage(response.message || "搜索完成")
        toast.success(response.message || "搜索完成")
        return
      }
      for (let i = 0; i < 60; i += 1) {
        const current = await adminApi.pluginSearchJob(jobId)
        setSearchResult(current.data)
        const status = String((current.data as Record<string, unknown>)?.status || "")
        if (["success", "failed", "canceled", "finished", "done"].includes(status)) break
        await new Promise((resolve) => window.setTimeout(resolve, 1500))
      }
      setMessage("搜索任务已更新")
      toast.success("搜索任务已更新")
    } catch (err) {
      const text = getMessage(err, "搜索失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const cancelSearch = async () => {
    if (!searchJobId) return
    await action(() => adminApi.cancelPluginSearchJob(searchJobId), "搜索任务已取消")
    setSearchJobId("")
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">插件中心</h2>
          <p className="text-sm text-muted-foreground">管理插件启停、配置、动作、资源搜索和索引同步。</p>
        </div>
        <Button variant="outline" onClick={rescan}><RefreshCw className="size-4" />重新扫描</Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_420px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="搜索插件" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <div className="flex gap-2">
          <Input placeholder="资源搜索关键词" value={searchKeyword} onChange={(event) => setSearchKeyword(event.target.value)} />
          <Button variant="outline" onClick={runSearch} disabled={!searchKeyword}><Search className="size-4" />搜索</Button>
          {searchJobId ? <Button variant="ghost" onClick={cancelSearch}>取消</Button> : null}
        </div>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>插件</TableHead>
              <TableHead className="w-36">版本</TableHead>
              <TableHead className="w-32">状态</TableHead>
              <TableHead className="w-40">启用</TableHead>
              <TableHead className="w-14 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map((plugin, index) => {
              const id = pluginId(plugin, index)
              return (
                <TableRow key={id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="rounded-md border bg-muted p-2 text-primary"><Puzzle className="size-4" /></div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{plugin.name || plugin.id || "未命名插件"}</span>
                          {plugin.author ? <Badge variant="outline">{String(plugin.author)}</Badge> : null}
                        </div>
                        <div className="line-clamp-1 text-xs text-muted-foreground">{plugin.description || "暂无描述"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{plugin.version || "-"}</TableCell>
                  <TableCell><StatusBadge status={String(plugin.status || (plugin.enabled ? "enabled" : "disabled"))} /></TableCell>
                  <TableCell>
                    <Switch checked={plugin.enabled !== false} onCheckedChange={(value) => action(() => adminApi.togglePlugin(id, value), "插件状态已更新")} />
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setRuntimePlugin(plugin)}><Play className="size-4" />打开运行界面</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setEditing(plugin)}><Save className="size-4" />编辑配置</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.testPluginConnection(id), "连通性测试完成")}><TestTube2 className="size-4" />测试连接</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.syncPlugin(id, true), "同步完成")}><RefreshCw className="size-4" />同步索引</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {pluginActions(plugin).map((item) => (
                          <DropdownMenuItem key={item.name} onClick={() => action(() => adminApi.executePluginAction(id, item.name), "动作已执行")}>
                            <Play className="size-4" />
                            {item.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              )
            })}
            {!visible.length ? <TableRow><TableCell colSpan={5} className="h-32 text-center text-muted-foreground">未找到插件</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>

      {searchResult ? (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium">搜索结果</div>
            <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">{JSON.stringify(searchResult, null, 2)}</pre>
          </CardContent>
        </Card>
      ) : null}

      <PluginConfigDialog plugin={editing} onOpenChange={(open) => !open && setEditing(null)} onSaved={async (text) => {
        setEditing(null)
        setMessage(text)
        toast.success(text)
        await load()
      }} />
      <PluginRuntimeDialog plugin={runtimePlugin} onOpenChange={(open) => !open && setRuntimePlugin(null)} />
    </div>
  )
}

function PluginRuntimeDialog({ plugin, onOpenChange }: { plugin: PluginInfo | null; onOpenChange: (open: boolean) => void }) {
  const url = pluginAssetUrl(plugin, "runtime_url") || pluginAssetUrl(plugin, "runtime") || pluginAssetUrl(plugin, "ui_url") || pluginAssetUrl(plugin, "config_url")
  return (
    <Dialog open={Boolean(plugin)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-5xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{plugin?.name || plugin?.id || "插件运行界面"}</DialogTitle>
          <DialogDescription>插件提供的运行时页面会在隔离 iframe 中打开。</DialogDescription>
        </DialogHeader>
        {url ? <iframe src={url} title={String(plugin?.name || plugin?.id || "plugin")} className="h-[72dvh] w-full bg-background" /> : (
          <div className="grid h-72 place-items-center text-sm text-muted-foreground">该插件没有声明可打开的运行界面。</div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function PluginConfigDialog({ plugin, onOpenChange, onSaved }: { plugin: PluginInfo | null; onOpenChange: (open: boolean) => void; onSaved: (message: string) => void | Promise<void> }) {
  const [config, setConfig] = useState<Record<string, unknown>>({})
  const [json, setJson] = useState("{}")
  const [message, setMessage] = useState("")

  useEffect(() => {
    setConfig(plugin?.config || {})
    setJson(JSON.stringify(plugin?.config || {}, null, 2))
    setMessage("")
  }, [plugin])

  const fields = useMemo(() => normalizeSchema(plugin?.config_schema), [plugin])
  const hasFields = fields.length > 0

  const save = async () => {
    if (!plugin) return
    setMessage("")
    try {
      const payload = hasFields ? config : JSON.parse(json || "{}")
      const response = await adminApi.updatePluginConfig(pluginId(plugin), payload)
      await onSaved(response.message || "插件配置已保存")
    } catch (err) {
      setMessage(getMessage(err, "插件配置保存失败"))
    }
  }

  return (
    <Dialog open={Boolean(plugin)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>插件配置</DialogTitle>
          <DialogDescription>{plugin?.name || plugin?.id || "插件"} 的运行配置。</DialogDescription>
        </DialogHeader>
        {hasFields ? (
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map(([key, field]) => (
              <div key={key} className="grid gap-2">
                <Label>{field.label || key}</Label>
                <Input value={String(config[key] ?? field.default ?? "")} placeholder={field.placeholder} onChange={(event) => setConfig((prev) => ({ ...prev, [key]: event.target.value }))} />
                {field.description ? <p className="text-xs text-muted-foreground">{field.description}</p> : null}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid gap-2">
            <Label>配置 JSON</Label>
            <Textarea className="min-h-72 font-mono text-xs" value={json} onChange={(event) => setJson(event.target.value)} />
          </div>
        )}
        {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
        <DialogFooter><Button onClick={save}><Save className="size-4" />保存配置</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function pluginId(plugin: PluginInfo, fallbackIndex = 0) {
  return String(plugin.id || plugin.name || fallbackIndex)
}

function pluginAssetUrl(plugin: PluginInfo | null, key: string) {
  if (!plugin) return ""
  const raw = plugin[key]
  if (typeof raw === "string") return raw
  const assets = plugin.assets
  if (assets && typeof assets === "object" && typeof (assets as Record<string, unknown>)[key] === "string") {
    return String((assets as Record<string, unknown>)[key])
  }
  return ""
}

function pluginActions(plugin: PluginInfo) {
  const actions = plugin.actions || []
  return actions.map((action) => {
    if (typeof action === "string") return { name: action, label: action }
    return { name: String(action.name || action.label || "run"), label: String(action.label || action.name || "执行动作") }
  })
}

function normalizeSchema(schema: PluginInfo["config_schema"]): Array<[string, ConfigField]> {
  if (!schema) return []
  if (Array.isArray(schema)) return schema.reduce<Array<[string, ConfigField]>>((acc, field) => {
    if (field.name) acc.push([field.name, field])
    return acc
  }, [])
  return Object.entries(schema)
}
