export function formatDateTime(value?: string | number | null, fallback = "-") {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleString("zh-CN")
}

export function formatDate(value?: string | number | null, fallback = "-") {
  if (!value) return fallback
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return fallback
  return date.toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
}

export function formatFileSize(bytes?: number | string | null) {
  if (bytes === null || bytes === undefined || bytes === "") return "-"
  const value = Number(bytes)
  if (!Number.isFinite(value)) return "-"
  if (value === 0) return "0 B"
  const units = ["B", "KB", "MB", "GB", "TB", "PB"]
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  return `${(value / 1024 ** index).toFixed(index === 0 ? 0 : 2)} ${units[index]}`
}

export function formatEntrySize(entry?: { size?: number | string | null; is_dir?: boolean }) {
  if (!entry) return "-"
  const size = Number(entry.size)
  if (entry.is_dir && (!Number.isFinite(size) || size <= 0)) return "-"
  return formatFileSize(size)
}

export function compactNumber(value?: number | string | null) {
  const number = Number(value || 0)
  if (!Number.isFinite(number)) return "0"
  return new Intl.NumberFormat("zh-CN", { notation: "compact", maximumFractionDigits: 1 }).format(number)
}
