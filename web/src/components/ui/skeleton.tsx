import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-[var(--skeleton)]",
        "after:absolute after:inset-0 after:-translate-x-full after:bg-linear-to-r after:from-transparent after:via-[var(--skeleton-highlight)] after:to-transparent after:opacity-70 after:animate-[litepan-skeleton-shimmer_1.25s_ease-in-out_infinite]",
        className,
      )}
      {...props}
    />
  )
}

export { Skeleton }
