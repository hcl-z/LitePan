import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { ExternalLink, KeyRound, MoreHorizontal, Plus, QrCode, RefreshCw, Save, Search, Trash2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { DriverAvatar } from "@/components/shared/DriverAvatar"
import { EmptyState } from "@/components/shared/EmptyState"
import { StatusBadge } from "@/components/shared/StatusBadge"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import type { Account, ConfigField, DriverInfo } from "@/types/api"

type SchemaMap = Record<string, ConfigField>

const HIDDEN_FIELDS = new Set(["operation_delay", "download_url_ttl"])

export function AccountsPanel() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [drivers, setDrivers] = useState<Record<string, DriverInfo>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")
  const [query, setQuery] = useState("")
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const confirm = useConfirm()

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setLoading(true)
    setMessage("")
    try {
      const [accountRes, driverRes] = await Promise.all([adminApi.accounts(), adminApi.drivers()])
      setAccounts(accountRes.data || [])
      setDrivers(driverRes.data || {})
    } catch (err) {
      const text = getMessage(err, "账号加载失败")
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

  const deleteAccount = async (account: Account) => {
    const ok = await confirm({
      title: `删除「${account.name}」？`,
      description: "相关缓存保持和 STRM 任务也会同步清理。",
      confirmText: "删除",
      destructive: true,
    })
    if (ok) await action(() => adminApi.deleteAccount(account.id), "账号已删除")
  }

  const visible = accounts.filter((account) => {
    const haystack = `${account.name} ${account.driver_type} ${account.status || ""} ${account.error_message || ""}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">存储管理</h2>
          <p className="text-sm text-muted-foreground">添加账号、授权、测试连接、启停账号和维护下载缓存。</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className="size-4" />
            刷新
          </Button>
          <Dialog open={dialogOpen} onOpenChange={(open) => {
            setDialogOpen(open)
            if (!open) setEditing(null)
          }}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="size-4" />
                添加账号
              </Button>
            </DialogTrigger>
            <AccountDialog
              account={editing}
              drivers={drivers}
              onSaved={async (text) => {
                setDialogOpen(false)
                setEditing(null)
                setMessage(text)
                await load()
              }}
            />
          </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input className="pl-8" placeholder="搜索账号、驱动或状态" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <Badge variant="outline">{accounts.length} 个账号</Badge>
        <Badge variant="outline">{accounts.filter((item) => item.enabled !== false).length} 个启用</Badge>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      {loading ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">正在加载账号...</CardContent></Card>
      ) : visible.length === 0 ? (
        <EmptyState icon={Plus} title="没有匹配账号" description="添加一个存储账号后，LitePan 会在首页展示文件。" onAction={() => setDialogOpen(true)} actionLabel="添加账号" />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>账号</TableHead>
                <TableHead className="w-40">驱动</TableHead>
                <TableHead className="w-32">状态</TableHead>
                <TableHead className="w-44">最近测试</TableHead>
                <TableHead className="w-14 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((account) => (
                <TableRow key={account.id}>
                  <TableCell>
                    <div className="flex min-w-0 items-center gap-3">
                      <DriverAvatar name={account.driver_card_name || account.name} color={account.driver_card_color} logo={account.driver_card_logo} />
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-medium">{account.name}</span>
                          {account.is_default ? <Badge variant="secondary">默认</Badge> : null}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{account.error_message || "配置由驱动 schema 管理"}</div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{drivers[account.driver_type]?.display_name || account.driver_type}</TableCell>
                  <TableCell><StatusBadge status={account.enabled === false ? "disabled" : account.status || "unknown"} /></TableCell>
                  <TableCell className="text-xs text-muted-foreground">{formatDateTime(account.last_tested)}</TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon"><MoreHorizontal className="size-4" /></Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => {
                          setEditing(account)
                          setDialogOpen(true)
                        }}>编辑配置</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.testAccount(account.id), "测试完成")}>测试连接</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.refreshAccountAuth(account.id), "认证刷新完成")}>刷新认证</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.toggleAccount(account.id))}>{account.enabled === false ? "启用账号" : "停用账号"}</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.setDefaultAccount(account.id))}>设为默认</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => action(() => adminApi.clearDownloadCache(account.id), "下载缓存已清空")}>清下载缓存</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => deleteAccount(account)}>
                          <Trash2 className="size-4" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  )
}

function AccountDialog({ account, drivers, onSaved }: { account: Account | null; drivers: Record<string, DriverInfo>; onSaved: (message: string) => void | Promise<void> }) {
  const driverEntries = useMemo(() => Object.entries(drivers), [drivers])
  const [step, setStep] = useState(account ? 2 : 1)
  const [search, setSearch] = useState("")
  const [driverType, setDriverType] = useState(account?.driver_type || driverEntries[0]?.[0] || "")
  const [schema, setSchema] = useState<SchemaMap>({})
  const [name, setName] = useState(account?.name || "")
  const [config, setConfig] = useState<Record<string, unknown>>(account?.config || {})
  const [rawMode, setRawMode] = useState(false)
  const [rawJson, setRawJson] = useState("{}")
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [qr, setQr] = useState<Record<string, unknown> | null>(null)
  const [polling, setPolling] = useState(false)

  useEffect(() => {
    setStep(account ? 2 : 1)
    setDriverType(account?.driver_type || driverEntries[0]?.[0] || "")
    setName(account?.name || "")
    setConfig(account?.config || {})
    setRawJson(JSON.stringify(account?.config || {}, null, 2))
    setMessage("")
    setQr(null)
  }, [account, driverEntries])

  useEffect(() => {
    if (!driverType) return
    void loadSchema(driverType)
  }, [driverType])

  const loadSchema = async (nextDriver: string) => {
    setMessage("")
    try {
      const response = await adminApi.driverSchema(nextDriver)
      const data = response.data || {}
      const nextSchema = normalizeSchema(data as Record<string, ConfigField>)
      setSchema(nextSchema)
      setConfig((prev) => {
        const next = account?.driver_type === nextDriver ? { ...(account?.config || {}) } : { ...prev }
        Object.entries(nextSchema).forEach(([key, field]) => {
          if (next[key] === undefined && field.default !== undefined) next[key] = field.default
        })
        return next
      })
    } catch (err) {
      setSchema({})
      setMessage(getMessage(err, "驱动配置结构加载失败"))
    }
  }

  const driver = drivers[driverType]
  const fields = useMemo(() => Object.entries(schema).filter(([key]) => !HIDDEN_FIELDS.has(key)), [schema])
  const filteredDrivers = driverEntries.filter(([key, item]) => `${key} ${item.display_name} ${item.description || ""}`.toLowerCase().includes(search.toLowerCase()))

  const setField = (key: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const applyQrConfig = (data: Record<string, unknown>) => {
    const nextConfig = (data.config && typeof data.config === "object" ? data.config : data) as Record<string, unknown>
    setConfig((prev) => ({ ...prev, ...nextConfig }))
    setRawJson(JSON.stringify({ ...config, ...nextConfig }, null, 2))
  }

  const startQrLogin = async () => {
    if (!driverType) return
    setMessage("")
    try {
      const response = await adminApi.qrLoginStart(driverType)
      const data = (response.data || {}) as Record<string, unknown>
      setQr(data)
      void pollQr(data)
    } catch (err) {
      setMessage(getMessage(err, "二维码生成失败"))
    }
  }

  const pollQr = async (state: Record<string, unknown>) => {
    const stateId = String(state.state_id || "")
    if (!stateId) return
    setPolling(true)
    for (let i = 0; i < 90; i += 1) {
      try {
        const response = await adminApi.qrLoginStatus(stateId, driverType)
        const data = (response.data || {}) as Record<string, unknown>
        const status = String(data.status || "")
        if (status === "success") {
          applyQrConfig(data)
          setMessage("扫码登录成功，配置已填入表单")
          setPolling(false)
          return
        }
        if (status === "failed" || status === "expired") {
          setMessage(String(data.message || "扫码登录未完成"))
          setPolling(false)
          return
        }
      } catch (err) {
        setMessage(getMessage(err, "扫码状态查询失败"))
      }
      await new Promise((resolve) => window.setTimeout(resolve, 2500))
    }
    setPolling(false)
  }

  const startOAuth = async () => {
    setMessage("")
    try {
      const response = await adminApi.oauthQuickAuth(driverType)
      const url = response.data?.oauth_url
      if (url) {
        window.open(url, "_blank", "noopener,noreferrer")
        setMessage("已打开 OAuth 授权页。完成后复制返回的 token 到表单对应字段。")
      }
    } catch (err) {
      setMessage(getMessage(err, "OAuth 启动失败"))
    }
  }

  const save = async () => {
    setSaving(true)
    setMessage("")
    try {
      const finalConfig = rawMode ? JSON.parse(rawJson || "{}") : config
      if (!name.trim()) throw new Error("账号名称不能为空")
      for (const [key, field] of fields) {
        if (field.required && (finalConfig[key] === undefined || finalConfig[key] === "" || finalConfig[key] === null)) {
          throw new Error(`${field.label || key} 为必填项`)
        }
      }
      const response = account
        ? await adminApi.updateAccount(account.id, { name: name.trim(), config: finalConfig })
        : await adminApi.createAccount({ name: name.trim(), driver_type: driverType, config: finalConfig })
      if (!response.success) throw new Error(response.message || "保存失败")
      await onSaved(response.message || "账号已保存")
    } catch (err) {
      setMessage(getMessage(err, "保存失败，请检查配置"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <DialogContent className="max-h-[88dvh] overflow-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{account ? "编辑存储账号" : step === 1 ? "选择网盘驱动" : "配置账号信息"}</DialogTitle>
        <DialogDescription>{account ? "修改账号名称和驱动配置，保存前会重新测试连接。" : "按驱动 schema 填写字段，支持 OAuth 或扫码的驱动可直接启动授权。"}</DialogDescription>
      </DialogHeader>

      {step === 1 ? (
        <div className="grid gap-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="搜索驱动" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="grid max-h-[460px] gap-3 overflow-auto sm:grid-cols-2 lg:grid-cols-3">
            {filteredDrivers.map(([key, item]) => (
              <button
                key={key}
                type="button"
                className={`rounded-lg border p-4 text-left transition-colors hover:bg-accent ${driverType === key ? "border-primary bg-accent" : ""}`}
                onClick={() => setDriverType(key)}
              >
                <div className="flex items-center gap-3">
                  <DriverAvatar name={item.card_name || item.display_name || key} color={item.card_color} logo={item.card_logo} />
                  <div className="min-w-0">
                    <div className="truncate font-medium">{item.display_name || key}</div>
                    <div className="truncate text-xs text-muted-foreground">{item.description || "云盘驱动"}</div>
                  </div>
                </div>
                <div className="mt-3 flex gap-2">
                  {item.auto_oauth ? <Badge variant="outline">OAuth</Badge> : null}
                  {item.supports_qr_login ? <Badge variant="outline">扫码</Badge> : null}
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3">
            <div className="flex items-center gap-3">
              <DriverAvatar name={driver?.card_name || driver?.display_name || driverType} color={driver?.card_color} logo={driver?.card_logo} />
              <div>
                <div className="font-medium">{driver?.display_name || driverType}</div>
                <div className="text-xs text-muted-foreground">{driver?.description || "驱动配置"}</div>
              </div>
            </div>
            {!account ? <Button variant="outline" onClick={() => setStep(1)}>重新选择</Button> : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="account-name">账号名称</Label>
            <Input id="account-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：我的 115 网盘" />
          </div>

          <div className="flex flex-wrap gap-2">
            {driver?.auto_oauth ? (
              <Button type="button" variant="outline" onClick={startOAuth}>
                <ExternalLink className="size-4" />
                打开 OAuth 授权
              </Button>
            ) : null}
            {driver?.supports_qr_login ? (
              <Button type="button" variant="outline" onClick={startQrLogin} disabled={polling}>
                <QrCode className="size-4" />
                {polling ? "等待扫码" : "扫码登录"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => {
              const next = !rawMode
              setRawMode(next)
              setRawJson(JSON.stringify(config, null, 2))
            }}>
              <KeyRound className="size-4" />
              {rawMode ? "返回表单" : "高级 JSON"}
            </Button>
          </div>

          {qr ? (
            <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[180px_minmax(0,1fr)]">
              {String(qr.qr_image_base64 || "").startsWith("data:image") ? <img className="h-40 w-40 rounded-md border bg-white p-2" src={String(qr.qr_image_base64)} alt="扫码登录二维码" /> : null}
              <div className="grid content-start gap-2 text-sm">
                <div className="font-medium">请使用对应网盘 App 扫码确认</div>
                <div className="text-muted-foreground">二维码有效期约 {String(qr.expires_in || 300)} 秒，确认后会自动把凭据填入表单。</div>
                {qr.qr_url ? <a className="text-primary underline-offset-4 hover:underline" href={String(qr.qr_url)} target="_blank" rel="noreferrer">打开二维码链接</a> : null}
              </div>
            </div>
          ) : null}

          {rawMode ? (
            <div className="grid gap-2">
              <Label htmlFor="account-config-json">配置 JSON</Label>
              <Textarea id="account-config-json" className="min-h-72 font-mono text-xs" value={rawJson} onChange={(event) => setRawJson(event.target.value)} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {fields.map(([key, field]) => (
                <ConfigInput key={key} fieldKey={key} field={field} value={config[key]} onChange={(value) => setField(key, value)} />
              ))}
              {!fields.length ? <div className="rounded-lg border p-4 text-sm text-muted-foreground md:col-span-2">该驱动没有公开表单字段。</div> : null}
            </div>
          )}
        </div>
      )}

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <DialogFooter>
        {step === 1 ? (
          <Button disabled={!driverType} onClick={() => setStep(2)}>下一步</Button>
        ) : (
          <Button disabled={saving || !name || !driverType} onClick={save}>
            <Save className="size-4" />
            {saving ? "保存中" : "保存账号"}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  )
}

function ConfigInput({ fieldKey, field, value, onChange }: { fieldKey: string; field: ConfigField; value: unknown; onChange: (value: unknown) => void }) {
  const id = `config-${fieldKey}`
  const type = field.type || "text"
  const label = field.label || fieldKey
  const canBrowseLocal = /(^|_)(path|root|dir|directory|folder)(_id)?$/i.test(fieldKey) || /本地|目录|路径/.test(label)

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}{field.required ? <span className="text-destructive"> *</span> : null}</Label>
      {type === "select" ? (
        <Select value={String(value ?? field.default ?? "")} onValueChange={(next) => onChange(coerceSelectValue(next, field))}>
          <SelectTrigger id={id}><SelectValue placeholder={`请选择${label}`} /></SelectTrigger>
          <SelectContent>
            {(field.options || []).map((option) => {
              const item = typeof option === "string" ? { label: option, value: option } : option
              return <SelectItem key={String(item.value)} value={String(item.value)}>{item.label}</SelectItem>
            })}
          </SelectContent>
        </Select>
      ) : type === "textarea" ? (
        <Textarea id={id} value={String(value ?? "")} onChange={(event) => onChange(event.target.value)} placeholder={field.placeholder} />
      ) : type === "number" ? (
        <Input id={id} type="number" value={value === undefined || value === null ? "" : Number(value)} min={field.min} max={field.max} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} />
      ) : type === "boolean" ? (
        <div className="flex h-10 items-center gap-2 rounded-md border px-3">
          <Switch id={id} checked={Boolean(value ?? field.default)} onCheckedChange={onChange} />
          <span className="text-sm text-muted-foreground">{Boolean(value ?? field.default) ? "开启" : "关闭"}</span>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input id={id} type={type === "password" ? "password" : "text"} value={String(value ?? "")} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} autoComplete={type === "password" ? "new-password" : "off"} />
          {canBrowseLocal ? <LocalDirButton onSelect={(path) => onChange(path)} /> : null}
        </div>
      )}
      {field.description ? <p className="text-xs leading-5 text-muted-foreground">{field.description}</p> : null}
    </div>
  )
}

function LocalDirButton({ onSelect }: { onSelect: (path: string) => void }) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState("")
  const [items, setItems] = useState<Array<{ name?: string; path?: string; is_dir?: boolean }>>([])

  const browse = async (nextPath = path) => {
    try {
      const response = await adminApi.localFsBrowse(nextPath ? { path: nextPath } : undefined)
      const data = response.data as Record<string, unknown> | Array<{ name?: string; path?: string; is_dir?: boolean }>
      const list = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items as Array<{ name?: string; path?: string; is_dir?: boolean }> : []
      setItems(list)
      if (!Array.isArray(data) && typeof data?.path === "string") setPath(data.path)
      else setPath(nextPath)
    } catch (err) {
      toast.error(getMessage(err, "本地目录加载失败"))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => {
      setOpen(next)
      if (next) void browse(path)
    }}>
      <DialogTrigger asChild><Button type="button" variant="outline">选择</Button></DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader><DialogTitle>选择本地目录</DialogTitle><DialogDescription>浏览服务器本地文件系统目录。</DialogDescription></DialogHeader>
        <div className="flex gap-2">
          <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/data" />
          <Button type="button" variant="outline" onClick={() => browse(path)}>打开</Button>
        </div>
        <div className="max-h-80 overflow-auto rounded-md border">
          {items.map((item, index) => (
            <button key={`${item.path || item.name}-${index}`} type="button" className="flex w-full items-center justify-between border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-accent" onClick={() => item.is_dir ? browse(String(item.path || "")) : null}>
              <span>{item.name || item.path}</span>
              <span className="text-xs text-muted-foreground">{item.is_dir ? "目录" : "文件"}</span>
            </button>
          ))}
          {!items.length ? <div className="px-3 py-8 text-center text-sm text-muted-foreground">暂无目录内容</div> : null}
        </div>
        <DialogFooter><Button type="button" onClick={() => { onSelect(path); setOpen(false) }}>使用当前目录</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function normalizeSchema(data: Record<string, ConfigField>) {
  const out: SchemaMap = {}
  Object.entries(data || {}).forEach(([key, field]) => {
    if (!field || typeof field !== "object") return
    out[key] = { ...field, name: field.name || key }
  })
  return out
}

function coerceSelectValue(value: string, field: ConfigField) {
  const option = (field.options || []).find((item) => String(typeof item === "string" ? item : item.value) === value)
  const raw = typeof option === "string" ? option : option?.value
  if (typeof raw === "boolean") return raw
  if (typeof raw === "number") return raw
  if (value === "true") return true
  if (value === "false") return false
  return value
}
