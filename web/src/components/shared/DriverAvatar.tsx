import { HardDrive } from "lucide-react"
import { cn } from "@/lib/utils"

interface DriverAvatarProps {
  name?: string
  color?: string
  logo?: string
  className?: string
}

export function DriverAvatar({ name, color, logo, className }: DriverAvatarProps) {
  return (
    <div
      className={cn("flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted text-xs font-semibold", className)}
      style={{ borderColor: color ? `${color}55` : undefined, backgroundColor: color ? `${color}14` : undefined, color: color || undefined }}
    >
      {logo ? <img src={logo} alt={name || "driver"} className="size-full object-contain p-1" /> : name ? <span>{name.slice(0, 2).toUpperCase()}</span> : <HardDrive className="size-4" />}
    </div>
  )
}
