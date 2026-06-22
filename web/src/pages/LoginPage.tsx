import { FormEvent, useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { Eye, EyeOff, KeyRound, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { AppLogo } from "@/components/shared/AppLogo"
import { authApi, getMessage } from "@/lib/api"
import type { ThemeMode } from "@/lib/theme"

interface LoginPageProps {
  theme: ThemeMode
}

export function LoginPage({ theme }: LoginPageProps) {
  const navigate = useNavigate()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [remember, setRemember] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [resetOpen, setResetOpen] = useState(false)
  const [resetMessage, setResetMessage] = useState("")

  useEffect(() => {
    void authApi.status().then((response) => {
      if (response.data?.is_admin) navigate("/admin", { replace: true })
    }).catch(() => null)
  }, [navigate])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError("")
    setLoading(true)
    try {
      const response = await authApi.login({ username, password, remember })
      if (!response.success) throw new Error(response.message || "登录失败")
      navigate("/admin", { replace: true })
    } catch (err) {
      setError(getMessage(err, "登录失败"))
    } finally {
      setLoading(false)
    }
  }

  const resetPassword = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await authApi.resetPassword()
      setResetMessage(response.message || "已生成临时密码，请查看容器日志。")
    } catch (err) {
      setResetMessage(getMessage(err, "重置失败"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-[100dvh] bg-background lg:grid-cols-[1.05fr_0.95fr]">
      <section className="hidden border-r bg-muted/30 p-10 lg:flex lg:flex-col lg:justify-between">
        <Link to="/" className="flex items-center gap-3">
          <AppLogo theme={theme} className="h-9 w-auto" />
          <span className="text-sm font-semibold">LitePan</span>
        </Link>
        <div className="max-w-xl">
          <div className="mb-6 inline-flex rounded-lg border bg-background p-3 text-primary">
            <ShieldCheck className="size-7" />
          </div>
          <h1 className="text-4xl font-semibold tracking-normal">统一管理你的多云存储。</h1>
          <p className="mt-4 max-w-[52ch] text-base leading-7 text-muted-foreground">
            登录后可以管理账号、缓存、WebDAV、STRM 与媒体整理任务。界面已经切换到 React 与 shadcn。
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {["账号授权", "缓存策略", "媒体任务"].map((item) => (
            <div key={item} className="rounded-lg border bg-background p-4 font-medium">{item}</div>
          ))}
        </div>
      </section>

      <section className="flex items-center justify-center px-4 py-10">
        <Card className="w-full max-w-md">
          <CardHeader>
            <div className="mb-4 flex items-center gap-3 lg:hidden">
              <AppLogo theme={theme} className="h-8 w-auto" />
              <span className="text-sm font-semibold">LitePan</span>
            </div>
            <CardTitle className="text-2xl">管理员登录</CardTitle>
          </CardHeader>
          <CardContent>
            <form className="grid gap-5" onSubmit={submit}>
              <div className="grid gap-2">
                <Label htmlFor="username">用户名</Label>
                <Input id="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="password">密码</Label>
                <div className="relative">
                  <Input id="password" className="pr-10" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-0 top-0" onClick={() => setShowPassword((value) => !value)} aria-label="显示或隐藏密码">
                    {showPassword ? <EyeOff /> : <Eye />}
                  </Button>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Checkbox checked={remember} onCheckedChange={(checked) => setRemember(checked === true)} />
                  保持登录 30 天
                </label>
                <button type="button" className="text-sm font-medium text-primary hover:underline" onClick={() => setResetOpen(true)}>
                  忘记密码
                </button>
              </div>
              {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}
              <Button type="submit" size="lg" disabled={loading || !username || !password}>
                <KeyRound />
                {loading ? "登录中..." : "登录"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </section>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>生成临时密码</DialogTitle>
            <DialogDescription>系统会在容器控制台日志中输出临时管理员密码，有效期为 10 分钟。</DialogDescription>
          </DialogHeader>
          {resetMessage ? <div className="rounded-md border bg-muted px-3 py-2 text-sm">{resetMessage}</div> : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetOpen(false)}>关闭</Button>
            <Button onClick={resetPassword} disabled={loading}>生成临时密码</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  )
}
