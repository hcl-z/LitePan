import { useEffect, useMemo, useState } from "react"
import { ChevronRight, Folder, RefreshCw, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { adminApi, getMessage } from "@/lib/api"
import { formatDateTime } from "@/lib/format"
import { cn } from "@/lib/utils"

export interface FolderSelection {
  id: string
  path: string
}

interface DirectoryEntry {
  id: string
  name: string
  path?: string
  modified_time?: string | null
}

interface Breadcrumb {
  id: string
  name: string
}

interface FolderPickerProps {
  accountId?: number | string
  value?: FolderSelection
  title?: string
  description?: string
  buttonLabel?: string
  disabled?: boolean
  onSelect: (folder: FolderSelection) => void
}

export function FolderPicker({
  accountId,
  value,
  title = "选择目录",
  description = "从网盘目录树中选择当前任务使用的文件夹。",
  buttonLabel = "选择目录",
  disabled,
  onSelect,
}: FolderPickerProps) {
  const [open, setOpen] = useState(false)
  const [directories, setDirectories] = useState<DirectoryEntry[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<Breadcrumb[]>([{ id: "root", name: "根目录" }])
  const [keyword, setKeyword] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  const effectiveAccountId = Number(accountId || 0)
  const current = breadcrumbs[breadcrumbs.length - 1] || { id: "root", name: "根目录" }
  const currentId = current.id === "root" ? "0" : current.id
  const currentPath = pathFromBreadcrumbs(breadcrumbs)

  const visibleDirectories = useMemo(() => {
    const normalized = keyword.trim().toLowerCase()
    const list = normalized ? directories.filter((dir) => dir.name.toLowerCase().includes(normalized)) : directories
    return [...list].sort((a, b) => a.name.localeCompare(b.name, "zh-CN", { numeric: true, sensitivity: "base" }))
  }, [directories, keyword])

  useEffect(() => {
    if (!open || !effectiveAccountId) return
    void load("root")
  }, [open, effectiveAccountId])

  const load = async (parentId = current.id, forceRefresh = false) => {
    if (!effectiveAccountId) return
    setLoading(true)
    setError("")
    try {
      const response = await adminApi.cacheRetentionDirectories(effectiveAccountId, {
        parent_id: parentId === "root" ? "0" : parentId,
        force_refresh: forceRefresh,
      })
      setDirectories((response.data || []) as DirectoryEntry[])
    } catch (err) {
      setDirectories([])
      setError(getMessage(err, "目录加载失败"))
    } finally {
      setLoading(false)
    }
  }

  const openDirectory = async (dir: DirectoryEntry) => {
    const next = [...breadcrumbs, { id: String(dir.id), name: String(dir.name) }]
    setBreadcrumbs(next)
    setKeyword("")
    await load(String(dir.id))
  }

  const jumpTo = async (index: number) => {
    const next = breadcrumbs.slice(0, index + 1)
    setBreadcrumbs(next)
    setKeyword("")
    await load(next[next.length - 1]?.id || "root")
  }

  const resetAndOpen = () => {
    setBreadcrumbs([{ id: "root", name: "根目录" }])
    setDirectories([])
    setKeyword("")
    setError("")
    setOpen(true)
  }

  const confirm = () => {
    onSelect({ id: currentId, path: currentPath })
    setOpen(false)
  }

  return (
    <>
      <div className="flex gap-2">
        <Input readOnly value={value?.path || ""} placeholder="请选择目录" className="bg-muted/30" />
        <Button type="button" variant="outline" onClick={resetAndOpen} disabled={disabled || !effectiveAccountId}>
          <Folder className="size-4" />
          {buttonLabel}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-hidden p-0 sm:max-w-3xl">
          <div className="border-b px-5 py-4">
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
          </div>

          <div className="grid gap-3 px-5 py-4">
            <div className="flex flex-wrap items-center gap-2">
              {breadcrumbs.map((item, index) => (
                <button
                  key={`${item.id}-${index}`}
                  type="button"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground",
                    index === breadcrumbs.length - 1 && "bg-accent text-foreground",
                  )}
                  onClick={() => jumpTo(index)}
                >
                  {index > 0 ? <ChevronRight className="size-3" /> : null}
                  {item.name}
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                <Input className="pl-8" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="筛选当前目录文件夹" />
              </div>
              <Button type="button" variant="outline" onClick={() => load(current.id, true)} disabled={loading}>
                <RefreshCw className={cn("size-4", loading && "animate-spin")} />
                刷新
              </Button>
            </div>

            {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

            <div className="max-h-[420px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead className="w-44">修改时间</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow><TableCell colSpan={2} className="h-32 text-center text-muted-foreground">正在加载目录...</TableCell></TableRow>
                  ) : visibleDirectories.length ? visibleDirectories.map((dir) => (
                    <TableRow key={dir.id} className="cursor-pointer" onClick={() => openDirectory(dir)}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Folder className="size-4 text-primary" />
                          <span className="font-medium">{dir.name}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDateTime(dir.modified_time)}</TableCell>
                    </TableRow>
                  )) : (
                    <TableRow><TableCell colSpan={2} className="h-32 text-center text-muted-foreground">{keyword ? "当前目录没有匹配的文件夹" : "没有子目录"}</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="border-t px-5 py-4">
            <div className="mr-auto min-w-0 truncate text-sm text-muted-foreground">当前选择：{currentPath}</div>
            <Button type="button" onClick={confirm} disabled={loading}>选择当前目录</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function pathFromBreadcrumbs(items: Breadcrumb[]) {
  const names = items.slice(1).map((item) => item.name).filter(Boolean)
  return names.length ? `/${names.join("/")}` : "/"
}
