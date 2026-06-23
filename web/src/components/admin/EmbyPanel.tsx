import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Copy, MoreHorizontal, Plus, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { adminApi, getMessage } from "@/lib/api"
import type { EmbyProxy } from "@/types/api"
import { TextField, SwitchField } from "./media-shared"

export function EmbyPanel() {
  const [proxies, setProxies] = useState<EmbyProxy[]>([])
  const [message, setMessage] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<EmbyProxy | null>(null)

  useEffect(() => { void load() }, [])

  const load = async () => {
    try {
      const res = await adminApi.embyProxies()
      setProxies(res.data || [])
    } catch (err) {
      toast.error(getMessage(err, "Emby 代理加载失败"))
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

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Emby 代理</h2>
          <p className="text-sm text-muted-foreground">管理 Emby 反向代理配置。</p>
        </div>
        <Button variant="outline" onClick={load}><RefreshCw className="size-4" />刷新</Button>
      </div>
      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}
      <Card className="overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Emby 代理</CardTitle>
          <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) setEditing(null) }}>
            <DialogTrigger asChild><Button onClick={() => setEditing(null)}><Plus className="size-4" />新增代理</Button></DialogTrigger>
            <EmbyProxyDialog proxy={editing} onSaved={async (msg) => {
              setDialogOpen(false); toast.success(msg); await load()
            }} />
          </Dialog>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>地址</TableHead>
              <TableHead className="w-28">状态</TableHead>
              <TableHead className="w-14 text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proxies.map((proxy) => (
              <TableRow key={proxy.id}>
                <TableCell className="font-medium">{proxy.name || proxy.proxy_name || `代理 ${proxy.id}`}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{proxy.emby_url || proxy.server_url || "-"}</TableCell>
                <TableCell><StatusBadge status={proxy.enabled === false ? "disabled" : proxy.status || "enabled"} /></TableCell>
                <TableCell className="text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild><Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => { setEditing(proxy); setDialogOpen(true) }}>编辑</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => action(() => adminApi.toggleEmbyProxy(proxy.id), "状态已切换")}>启停</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => action(() => adminApi.testEmbyProxy(proxy.id), "测试完成")}>测试</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => navigator.clipboard?.writeText(String(proxy.proxy_url || proxy.url || proxy.emby_url || ""))}><Copy className="size-4" />复制地址</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => action(() => adminApi.deleteEmbyProxy(proxy.id), "代理已删除")}><Trash2 className="size-4" />删除</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
            {!proxies.length ? <TableRow><TableCell colSpan={4} className="h-32 text-center text-muted-foreground">尚未配置 Emby 代理</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

function EmbyProxyDialog({ proxy, onSaved }: { proxy: EmbyProxy | null; onSaved: (message: string) => void | Promise<void> }) {
  const [form, setForm] = useState<Record<string, unknown>>({})

  useEffect(() => setForm(proxy || { name: "", emby_url: "", token: "", enabled: true }), [proxy])

  const save = async () => {
    try {
      const response = proxy ? await adminApi.updateEmbyProxy(proxy.id, form) : await adminApi.createEmbyProxy(form)
      await onSaved(response.message || "Emby 代理已保存")
    } catch (err) {
      toast.error(getMessage(err, "保存失败"))
    }
  }

  return (
    <DialogContent className="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{proxy ? "编辑 Emby 代理" : "新增 Emby 代理"}</DialogTitle>
        <DialogDescription>配置 Emby 反向代理地址、Token 和路径映射。</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 md:grid-cols-2">
        <TextField label="名称" value={String(form.name || form.proxy_name || "")} onChange={(value) => setForm((prev) => ({ ...prev, name: value, proxy_name: value }))} />
        <TextField label="Emby 地址" value={String(form.emby_url || form.server_url || "")} onChange={(value) => setForm((prev) => ({ ...prev, emby_url: value, server_url: value }))} />
        <TextField label="Token" value={String(form.token || "")} onChange={(value) => setForm((prev) => ({ ...prev, token: value }))} />
        <SwitchField label="启用" checked={form.enabled !== false} onChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))} />
        <div className="grid gap-2 md:col-span-2">
          <Label>路径映射</Label>
          <Textarea value={String(form.path_mapping || "")} onChange={(event) => setForm((prev) => ({ ...prev, path_mapping: event.target.value }))} rows={5} />
        </div>
      </div>
      <DialogFooter><Button onClick={save}>保存代理</Button></DialogFooter>
    </DialogContent>
  )
}
