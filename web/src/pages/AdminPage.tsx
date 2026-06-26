import { useEffect, useMemo, useState } from "react"
import { Navigate, useParams, useSearchParams } from "react-router-dom"
import { ArrowLeftRight, Bell, Database, Files, Film, HardDrive, LayoutDashboard, Menu, Puzzle, Server, Settings, Video, Workflow } from "lucide-react"
import { AppShell } from "@/components/layout/AppShell"
import { AccountsPanel } from "@/components/admin/AccountsPanel"
import { AdminDashboard } from "@/components/admin/AdminDashboard"
import { CachePanel } from "@/components/admin/CachePanel"
import { CrossTransferPanel } from "@/components/admin/CrossTransferPanel"
import { EmbyPanel } from "@/components/admin/EmbyPanel"
import { LogsPanel } from "@/components/admin/LogsPanel"
import { MediaOrganizePanel } from "@/components/admin/MediaOrganizePanel"
import { IngestPanel } from "@/components/admin/IngestPanel"
import { PluginsPanel } from "@/components/admin/PluginsPanel"
import { StrmPanel } from "@/components/admin/StrmPanel"
import { SettingsPanel } from "@/components/admin/SettingsPanel"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { adminApi, authApi } from "@/lib/api"
import { nextTheme, type ThemeMode } from "@/lib/theme"
import { cn } from "@/lib/utils"
import type { AuthStatus } from "@/types/api"

const navItems = [
  { id: "dashboard", label: "仪表盘", icon: LayoutDashboard },
  { id: "accounts", label: "存储管理", icon: HardDrive },
  { id: "settings", label: "系统设置", icon: Settings },
  { id: "cache", label: "缓存管理", icon: Database },
  { id: "strm",  label: "STRM 管理",  icon: Video   },
  { id: "media", label: "媒体整理",   icon: Film    },
  { id: "ingest", label: "入库流程", icon: Workflow },
  { id: "emby",  label: "Emby 代理",  icon: Server  },
  { id: "cross-transfer", label: "跨盘秒传", icon: ArrowLeftRight },
  { id: "logs", label: "系统日志", icon: Files },
  { id: "plugins", label: "插件中心", icon: Puzzle },
]

interface AdminPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function AdminPage({ theme, onThemeChange }: AdminPageProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const routeParams = useParams()
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [mobileOpen, setMobileOpen] = useState(false)
  const page = routeParams.page || searchParams.get("page") || "dashboard"

  useEffect(() => {
    void authApi.status().then((response) => setAuth(response.data)).catch(() => setAuth({ is_admin: false }))
  }, [])

  const title = useMemo(() => navItems.find((item) => item.id === page)?.label || "管理后台", [page])

  if (!auth) {
    return (
      <AppShell title={title} theme={theme} onThemeToggle={() => onThemeChange(nextTheme(theme))}>
        <div className="mx-auto max-w-[1440px] bg-background px-4 py-6 sm:px-6">
          <Skeleton className="h-[80dvh] w-full" />
        </div>
      </AppShell>
    )
  }

  if (!auth.is_admin) {
    return <Navigate to="/login" replace />
  }

  const navigate = (nextPage: string) => {
    setSearchParams({ page: nextPage })
    setMobileOpen(false)
  }

  const panel = renderPanel(page, navigate, onThemeChange)

  return (
    <AppShell title={title} isAdmin mustChangePassword={auth.must_change_password} theme={theme} onThemeToggle={() => {
      const value = nextTheme(theme)
      onThemeChange(value)
      void adminApi.theme(value).catch(() => null)
    }}>
      <div className="mx-auto grid max-w-[1440px] gap-0 bg-background px-4 py-6 sm:px-6 lg:grid-cols-[250px_minmax(0,1fr)] lg:gap-6">
        <aside className="hidden lg:block">
          <div className="sticky top-24 rounded-lg border bg-card p-2">
            <NavList active={page} onNavigate={navigate} />
          </div>
        </aside>
        <section className="min-w-0 bg-background">
          <div className="mb-4 flex items-center gap-3 lg:hidden">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon"><Menu /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <div className="mt-8">
                  <NavList active={page} onNavigate={navigate} />
                </div>
              </SheetContent>
            </Sheet>
            <div>
              <div className="text-sm text-muted-foreground">管理后台</div>
              <h1 className="text-xl font-semibold">{title}</h1>
            </div>
          </div>
          {auth.must_change_password ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
              <Bell className="size-4" />
              当前凭据需要修改，请在系统设置中更新管理员密码。
            </div>
          ) : null}
          {panel}
        </section>
      </div>
    </AppShell>
  )
}

function NavList({ active, onNavigate }: { active: string; onNavigate: (page: string) => void }) {
  return (
    <nav className="grid gap-1">
      {navItems.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.id}
            className={cn(
              "flex h-10 items-center gap-3 rounded-md px-3 text-left text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              active === item.id && "bg-accent text-foreground",
            )}
            onClick={() => onNavigate(item.id)}
          >
            <Icon className="size-4" />
            {item.label}
          </button>
        )
      })}
    </nav>
  )
}

function renderPanel(page: string, navigate: (page: string) => void, setTheme: (theme: ThemeMode) => void) {
  switch (page) {
    case "accounts":
      return <AccountsPanel />
    case "settings":
      return <SettingsPanel onThemeChange={setTheme} />
    case "cache":
      return <CachePanel />
    case "strm":
      return <StrmPanel />
    case "media":
      return <MediaOrganizePanel />
    case "ingest":
      return <IngestPanel />
    case "emby":
      return <EmbyPanel />
    case "cross-transfer":
      return <CrossTransferPanel />
    case "logs":
      return <LogsPanel />
    case "plugins":
      return <PluginsPanel />
    default:
      return <AdminDashboard onNavigate={navigate} />
  }
}
