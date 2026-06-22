import { FormEvent, useEffect, useState } from "react"
import { toast } from "sonner"
import { Bot, Cloud, Home, KeyRound, Save, Settings, ShieldCheck, SlidersHorizontal, TestTube2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { adminApi, getMessage } from "@/lib/api"
import type { ThemeMode } from "@/lib/theme"
import type { SystemConfig } from "@/types/api"

const defaultConfig: SystemConfig = {
  admin_username: "admin",
  session_timeout: 2,
  oauth_server_url: "https://oauth.litepan.top",
  public_index_enabled: true,
  index_account_switch_mode: "dropdown",
  admin_home_return_mode: "top_icon",
  theme: "light",
  upload_task_concurrency: 3,
  log_retention_days: 30,
  auth_active_refresh_enabled: true,
  feishu_bot_enabled: false,
  feishu_app_id: "",
  feishu_allowed_chat_ids: "",
  feishu_allowed_user_ids: "",
  feishu_command_prefix: "/lp",
  webdav_enabled: true,
  webdav_smart_chunk_enabled: true,
  webdav_chunk_size: 256,
  webdav_cache_enabled: true,
}

export function SettingsPanel({ onThemeChange }: { onThemeChange: (theme: ThemeMode) => void }) {
  const [config, setConfig] = useState<SystemConfig>(defaultConfig)
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [message, setMessage] = useState("")
  const [saving, setSaving] = useState(false)
  const [testingFeishu, setTestingFeishu] = useState(false)

  useEffect(() => {
    void load()
  }, [])

  const load = async () => {
    setMessage("")
    try {
      const response = await adminApi.systemConfig()
      setConfig({ ...defaultConfig, ...(response.data || {}) })
    } catch (err) {
      const text = getMessage(err, "设置加载失败")
      setMessage(text)
      toast.error(text)
    }
  }

  const update = <K extends keyof SystemConfig>(key: K, value: SystemConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  const saveSettings = async (event?: FormEvent) => {
    event?.preventDefault()
    setSaving(true)
    setMessage("")
    try {
      if (password && password !== confirmPassword) throw new Error("两次输入的密码不一致")
      const payload: Record<string, unknown> = {
        admin_username: config.admin_username,
        admin_password: password,
        session_timeout: Number(config.session_timeout),
        oauth_server_url: config.oauth_server_url,
        public_index_enabled: config.public_index_enabled,
        upload_task_concurrency: Number(config.upload_task_concurrency),
        log_retention_days: Number(config.log_retention_days),
        auth_active_refresh_enabled: config.auth_active_refresh_enabled,
        feishu_bot_enabled: config.feishu_bot_enabled,
        feishu_app_id: config.feishu_app_id,
        feishu_app_secret: config.feishu_app_secret || "",
        feishu_allowed_chat_ids: config.feishu_allowed_chat_ids,
        feishu_allowed_user_ids: config.feishu_allowed_user_ids,
        feishu_command_prefix: config.feishu_command_prefix,
        index_account_switch_mode: config.index_account_switch_mode,
        admin_home_return_mode: config.admin_home_return_mode,
        theme: config.theme,
      }
      const response = await adminApi.updateCredentials(payload)
      onThemeChange(config.theme)
      setPassword("")
      setConfirmPassword("")
      const text = response.message || "系统设置已保存"
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err, "保存失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  const saveWebdav = async () => {
    setSaving(true)
    setMessage("")
    try {
      const response = await adminApi.updateWebdavConfig({
        webdav_enabled: config.webdav_enabled,
        webdav_smart_chunk_enabled: config.webdav_smart_chunk_enabled,
        webdav_chunk_size: config.webdav_chunk_size,
        webdav_cache_enabled: config.webdav_cache_enabled,
      })
      const text = response.message || "WebDAV 设置已保存"
      setMessage(text)
      toast.success(text)
      await load()
    } catch (err) {
      const text = getMessage(err, "WebDAV 保存失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setSaving(false)
    }
  }

  const testFeishu = async () => {
    setTestingFeishu(true)
    setMessage("")
    try {
      const response = await adminApi.testFeishu({
        feishu_app_id: config.feishu_app_id,
        feishu_app_secret: config.feishu_app_secret,
      })
      const text = response.message || "飞书连接测试完成"
      setMessage(text)
      toast.success(text)
    } catch (err) {
      const text = getMessage(err, "飞书测试失败")
      setMessage(text)
      toast.error(text)
    } finally {
      setTestingFeishu(false)
    }
  }

  return (
    <form className="grid gap-4" onSubmit={saveSettings}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">系统设置</h2>
          <p className="text-sm text-muted-foreground">账号安全、认证服务、WebDAV、首页交互和运行参数。</p>
        </div>
        <Button type="submit" disabled={saving}>
          <Save className="size-4" />
          {saving ? "保存中" : "保存设置"}
        </Button>
      </div>

      {message ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{message}</div> : null}

      <Tabs defaultValue="security">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="security"><ShieldCheck className="size-4" />账号与安全</TabsTrigger>
          <TabsTrigger value="auth"><KeyRound className="size-4" />认证与授权</TabsTrigger>
          <TabsTrigger value="webdav"><Cloud className="size-4" />WebDAV</TabsTrigger>
          <TabsTrigger value="homepage"><Home className="size-4" />首页</TabsTrigger>
          <TabsTrigger value="other"><SlidersHorizontal className="size-4" />其他</TabsTrigger>
        </TabsList>

        <TabsContent value="security" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-primary" />账号与安全</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="管理员用户名">
                <Input value={config.admin_username} onChange={(event) => update("admin_username", event.target.value)} required />
              </Field>
              <NumberField label="会话超时时间（小时）" value={config.session_timeout} min={0.5} max={24} step={0.5} onChange={(value) => update("session_timeout", value)} />
              <Field label="新密码">
                <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="留空表示不修改" autoComplete="new-password" />
              </Field>
              <Field label="确认新密码">
                <Input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="再次输入新密码" autoComplete="new-password" />
              </Field>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="auth" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-primary" />授权服务</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <Field label="OAuth 代理服务地址" description="用于相关驱动的授权、刷新和回调地址处理。">
                  <Input value={config.oauth_server_url} onChange={(event) => update("oauth_server_url", event.target.value)} placeholder="https://oauth.litepan.top" />
                </Field>
                <SwitchField label="智能主动认证刷新" description="常驻服务建议开启，临时桌面使用或同账号被其他工具使用时可关闭。" checked={config.auth_active_refresh_enabled} onChange={(value) => update("auth_active_refresh_enabled", value)} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Bot className="size-4 text-primary" />飞书机器人</CardTitle></CardHeader>
              <CardContent className="grid gap-4">
                <SwitchField label="启用飞书机器人" description="通过飞书长连接接收命令，仅响应白名单群或用户。" checked={config.feishu_bot_enabled} onChange={(value) => update("feishu_bot_enabled", value)} />
                <Field label="App ID"><Input value={config.feishu_app_id} onChange={(event) => update("feishu_app_id", event.target.value)} placeholder="cli_xxx" /></Field>
                <Field label="App Secret">
                  <div className="flex gap-2">
                    <Input type="password" value={config.feishu_app_secret || ""} onChange={(event) => update("feishu_app_secret", event.target.value)} placeholder={config.feishu_app_secret_configured ? "已配置，留空表示不修改" : "飞书应用 App Secret"} autoComplete="new-password" />
                    <Button type="button" variant="outline" onClick={testFeishu} disabled={testingFeishu}>
                      <TestTube2 className="size-4" />
                      测试
                    </Button>
                  </div>
                </Field>
                <Field label="命令前缀"><Input value={config.feishu_command_prefix} onChange={(event) => update("feishu_command_prefix", event.target.value)} placeholder="/lp" /></Field>
                <Field label="允许的群 ID"><Textarea value={config.feishu_allowed_chat_ids} onChange={(event) => update("feishu_allowed_chat_ids", event.target.value)} rows={3} /></Field>
                <Field label="允许的用户 ID"><Textarea value={config.feishu_allowed_user_ids} onChange={(event) => update("feishu_allowed_user_ids", event.target.value)} rows={3} /></Field>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="webdav" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Cloud className="size-4 text-primary" />WebDAV 设置</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SwitchField label="启用 WebDAV" checked={config.webdav_enabled} onChange={(value) => update("webdav_enabled", value)} />
              <SwitchField label="启用 WebDAV 缓存" checked={config.webdav_cache_enabled} onChange={(value) => update("webdav_cache_enabled", value)} />
              <SwitchField label="智能分片" description="客户端支持 Range 请求时按需分片，降低大文件读取压力。" checked={config.webdav_smart_chunk_enabled} onChange={(value) => update("webdav_smart_chunk_enabled", value)} />
              <NumberField label="分片大小（KB）" value={config.webdav_chunk_size} min={64} max={8192} onChange={(value) => update("webdav_chunk_size", value)} />
              <div className="md:col-span-2">
                <Button type="button" onClick={saveWebdav} disabled={saving}><Save className="size-4" />保存 WebDAV 设置</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="homepage" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Home className="size-4 text-primary" />首页访问与交互</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <SwitchField label="允许匿名访问文件列表" description="关闭后未登录用户访问首页会跳转到登录页。" checked={config.public_index_enabled} onChange={(value) => update("public_index_enabled", value)} />
              <SelectField label="账号切换方式" value={config.index_account_switch_mode} onChange={(value) => update("index_account_switch_mode", value as SystemConfig["index_account_switch_mode"])} options={[["dropdown", "下拉选择"], ["floating", "悬浮切换"]]} />
              <SelectField label="管理后台返回首页入口" value={config.admin_home_return_mode} onChange={(value) => update("admin_home_return_mode", value as SystemConfig["admin_home_return_mode"])} options={[["top_icon", "顶部图标"], ["sidebar", "侧栏入口"], ["both", "同时显示"]]} />
              <SelectField label="界面主题" value={config.theme} onChange={(value) => {
                const theme = value as SystemConfig["theme"]
                update("theme", theme)
                onThemeChange(theme)
              }} options={[["light", "浅色"], ["dark", "深色"], ["auto", "跟随系统"]]} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="other" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Settings className="size-4 text-primary" />运行参数</CardTitle></CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <NumberField label="上传任务并发数" value={config.upload_task_concurrency} min={1} max={5} onChange={(value) => update("upload_task_concurrency", value)} />
              <NumberField label="日志保留天数" value={config.log_retention_days} min={1} max={365} onChange={(value) => update("log_retention_days", value)} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </form>
  )
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <Label>{label}</Label>
      {children}
      {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
    </div>
  )
}

function NumberField({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min?: number; max?: number; step?: number; onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <Input type="number" value={value} min={min} max={max} step={step} onChange={(event) => onChange(Number(event.target.value || 0))} />
    </Field>
  )
}

function SwitchField({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-md border p-3">
      <div className="grid gap-1">
        <Label>{label}</Label>
        {description ? <p className="text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: Array<[string, string]>; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map(([optionValue, labelText]) => <SelectItem key={optionValue} value={optionValue}>{labelText}</SelectItem>)}
        </SelectContent>
      </Select>
    </Field>
  )
}
