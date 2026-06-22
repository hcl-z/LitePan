import { useEffect, useState } from "react"
import { getSystemTheme, type ThemeMode } from "@/lib/theme"

interface AppLogoProps {
  className?: string
  theme?: ThemeMode
}

export function AppLogo({ className = "h-8 w-auto", theme = "light" }: AppLogoProps) {
  const [systemTheme, setSystemTheme] = useState(getSystemTheme)

  useEffect(() => {
    if (theme !== "auto") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const handler = () => setSystemTheme(getSystemTheme())
    handler()
    media.addEventListener("change", handler)
    return () => media.removeEventListener("change", handler)
  }, [theme])

  const resolved = theme === "auto" ? systemTheme : theme
  const src = resolved === "dark" ? "/static/img/logo.png" : "/static/img/logo-dark.png"
  return <img src={src} alt="LitePan" className={className} />
}
