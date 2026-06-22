export type ThemeMode = "light" | "dark" | "auto"

const THEME_STORAGE_KEY = "litepan-theme"
const themeModes: ThemeMode[] = ["light", "dark", "auto"]

function isThemeMode(value: string | null): value is ThemeMode {
  return Boolean(value && themeModes.includes(value as ThemeMode))
}

export function getSystemTheme() {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
}

export function getStoredTheme(fallback: ThemeMode = "light"): ThemeMode {
  if (typeof window === "undefined") return fallback
  const datasetTheme = document.documentElement.dataset.theme
  if (isThemeMode(datasetTheme || null)) return datasetTheme as ThemeMode
  const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
  return isThemeMode(storedTheme) ? storedTheme : fallback
}

export function applyTheme(theme: ThemeMode) {
  const resolved = theme === "auto" ? getSystemTheme() : theme
  document.documentElement.classList.toggle("dark", resolved === "dark")
  document.documentElement.dataset.theme = theme
  if (typeof window !== "undefined") {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme)
  }
  return resolved
}

export function nextTheme(theme: ThemeMode): ThemeMode {
  if (theme === "dark") return "light"
  return "dark"
}
