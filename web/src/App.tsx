import { useEffect, useState } from "react"
import { BrowserRouter, Route, Routes } from "react-router-dom"
import { AdminPage } from "@/pages/AdminPage"
import { IndexPage } from "@/pages/IndexPage"
import { LoginPage } from "@/pages/LoginPage"
import { Toaster } from "@/components/ui/sonner"
import { ConfirmProvider } from "@/components/shared/ConfirmProvider"
import { publicApi } from "@/lib/api"
import { applyTheme, getStoredTheme, type ThemeMode } from "@/lib/theme"

export function App() {
  const [theme, setTheme] = useState<ThemeMode>(() => getStoredTheme())

  useEffect(() => {
    applyTheme(theme)
    if (theme !== "auto") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => applyTheme("auto")
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [theme])

  useEffect(() => {
    void publicApi.systemConfig().then((response) => {
      const nextTheme = response.data?.theme || "light"
      setTheme(nextTheme)
      applyTheme(nextTheme)
    }).catch(() => null)
  }, [])

  return (
    <ConfirmProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<IndexPage theme={theme} onThemeChange={setTheme} />} />
          <Route path="/login" element={<LoginPage theme={theme} />} />
          <Route path="/admin" element={<AdminPage theme={theme} onThemeChange={setTheme} />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors closeButton position="top-right" />
    </ConfirmProvider>
  )
}
