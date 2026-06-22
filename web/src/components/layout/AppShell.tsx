import { PropsWithChildren } from "react"
import { Link, NavLink } from "react-router-dom"
import { Database, Files, LayoutDashboard, LogIn, Monitor, Moon, Settings, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { AppLogo } from "@/components/shared/AppLogo"
import { NotificationCenter } from "@/components/layout/NotificationCenter"
import { authApi } from "@/lib/api"
import { getSystemTheme } from "@/lib/theme"
import { cn } from "@/lib/utils"

interface AppShellProps extends PropsWithChildren {
  title?: string
  isAdmin?: boolean
  mustChangePassword?: boolean
  onThemeToggle?: () => void
  theme?: "light" | "dark" | "auto"
}

export function AppShell({ children, title = "LitePan", isAdmin, mustChangePassword, onThemeToggle, theme = "light" }: AppShellProps) {
  const resolvedTheme = theme === "auto" ? getSystemTheme() : theme

  const logout = async () => {
    await authApi.logout().catch(() => null)
    window.location.assign("/")
  }

  return (
    <TooltipProvider>
      <div className="min-h-[100dvh] bg-background">
        <header className="sticky top-0 z-40 border-b bg-background/92 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex min-w-0 items-center gap-3">
              <AppLogo theme={theme} className="h-8 w-auto" />
              <div className="hidden min-w-0 sm:block">
                <div className="text-sm font-semibold leading-4">LitePan</div>
                <div className="text-xs text-muted-foreground">{title}</div>
              </div>
            </Link>
            <nav className="hidden items-center gap-1 md:flex">
              <HeaderLink to="/" icon={Files} label="文件" />
              <HeaderLink to="/admin" icon={LayoutDashboard} label="控制台" />
            </nav>
            <div className="flex items-center gap-2">
              {mustChangePassword ? <span className="hidden rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 sm:inline">需改密</span> : null}
              <NotificationCenter enabled={isAdmin} />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onThemeToggle} aria-label="切换主题">
                    {theme === "auto" ? <Monitor /> : resolvedTheme === "dark" ? <Moon /> : <Sun />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{theme === "auto" ? `跟随系统，当前${resolvedTheme === "dark" ? "深色" : "浅色"}` : "切换主题"}</TooltipContent>
              </Tooltip>
              {isAdmin ? (
                <Button variant="outline" size="sm" onClick={logout}>
                  退出
                </Button>
              ) : (
                <Button asChild size="sm">
                  <Link to="/login">
                    <LogIn />
                    登录
                  </Link>
                </Button>
              )}
            </div>
          </div>
        </header>
        <main>{children}</main>
      </div>
    </TooltipProvider>
  )
}

function HeaderLink({ to, icon: Icon, label }: { to: string; icon: typeof Database; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          "inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
          isActive && "bg-accent text-foreground",
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  )
}
