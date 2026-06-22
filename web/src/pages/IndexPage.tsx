import { useEffect, useState } from "react"
import { AppShell } from "@/components/layout/AppShell"
import { FileBrowser } from "@/components/files/FileBrowser"
import { adminApi, authApi } from "@/lib/api"
import { nextTheme, type ThemeMode } from "@/lib/theme"
import type { AuthStatus } from "@/types/api"

interface IndexPageProps {
  theme: ThemeMode
  onThemeChange: (theme: ThemeMode) => void
}

export function IndexPage({ theme, onThemeChange }: IndexPageProps) {
  const [auth, setAuth] = useState<AuthStatus>({ is_admin: false })

  useEffect(() => {
    void authApi.status().then((response) => setAuth(response.data)).catch(() => null)
  }, [])

  const toggleTheme = () => {
    const value = nextTheme(theme)
    onThemeChange(value)
    if (auth.is_admin) {
      void adminApi.theme(value).catch(() => null)
    }
  }

  return (
    <AppShell title="文件浏览" isAdmin={auth.is_admin} mustChangePassword={auth.must_change_password} theme={theme} onThemeToggle={toggleTheme}>
      <FileBrowser isAdmin={auth.is_admin} />
    </AppShell>
  )
}
