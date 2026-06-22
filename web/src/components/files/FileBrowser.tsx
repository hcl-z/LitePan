import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react"
import { toast } from "sonner"
import {
  ArrowDownUp,
  Copy,
  Download,
  Eye,
  File,
  Film,
  Folder,
  FolderPlus,
  Grid2X2,
  List,
  MoreHorizontal,
  MoveRight,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { EmptyState } from "@/components/shared/EmptyState"
import { DriverAvatar } from "@/components/shared/DriverAvatar"
import { FolderPicker } from "@/components/shared/FolderPicker"
import { useConfirm } from "@/components/shared/ConfirmProvider"
import { UploadTaskCenter } from "@/components/files/UploadTaskCenter"
import { adminApi, filesApi, getMessage, publicApi } from "@/lib/api"
import { formatDateTime, formatEntrySize } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Account, FileEntry } from "@/types/api"

type ViewMode = "table" | "grid"
type SortKey = "name" | "size" | "modified"

interface BreadcrumbItem {
  id: string
  name: string
}

export function FileBrowser({ isAdmin }: { isAdmin: boolean }) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | null>(null)
  const [files, setFiles] = useState<FileEntry[]>([])
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([{ id: "0", name: "根目录" }])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [query, setQuery] = useState("")
  const [viewMode, setViewMode] = useState<ViewMode>("table")
  const [sortKey, setSortKey] = useState<SortKey>("name")
  const [sortAsc, setSortAsc] = useState(true)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const [newFolderName, setNewFolderName] = useState("")
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null)
  const [renameValue, setRenameValue] = useState("")
  const [transferMode, setTransferMode] = useState<"move" | "copy" | null>(null)
  const [previewFile, setPreviewFile] = useState<FileEntry | null>(null)
  const [textPreview, setTextPreview] = useState("")
  const [busyMessage, setBusyMessage] = useState("")
  const uploadRef = useRef<HTMLInputElement>(null)
  const uploadFolderRef = useRef<HTMLInputElement>(null)
  const confirm = useConfirm()

  const currentPath = breadcrumbs[breadcrumbs.length - 1]?.id || "0"
  const selectedAccount = accounts.find((account) => account.id === accountId)

  const visibleFiles = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const filtered = normalized ? files.filter((file) => file.name.toLowerCase().includes(normalized)) : files
    return [...filtered].sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1
      const av = sortKey === "size" ? Number(a.size || 0) : String(a[sortKey] || a.name).toLowerCase()
      const bv = sortKey === "size" ? Number(b.size || 0) : String(b[sortKey] || b.name).toLowerCase()
      const result = av > bv ? 1 : av < bv ? -1 : 0
      return sortAsc ? result : -result
    })
  }, [files, query, sortAsc, sortKey])

  const stats = useMemo(() => {
    const folders = files.filter((file) => file.is_dir).length
    return { folders, files: files.length - folders }
  }, [files])

  const selectedFiles = useMemo(() => files.filter((file) => selectedIds.has(file.id)), [files, selectedIds])
  const allVisibleSelected = visibleFiles.length > 0 && visibleFiles.every((file) => selectedIds.has(file.id))

  useEffect(() => {
    void loadAccounts()
  }, [])

  useEffect(() => {
    if (accountId) void loadFiles(accountId, currentPath)
  }, [accountId, currentPath])

  const loadAccounts = async () => {
    setLoading(true)
    setError("")
    try {
      const response = await publicApi.accounts()
      const list = response.data || []
      setAccounts(list)
      const preferred = list.find((account) => account.is_default) || list[0]
      setAccountId(preferred?.id || null)
    } catch (err) {
      const text = getMessage(err, "账号加载失败")
      setError(text)
      toast.error(text)
    } finally {
      setLoading(false)
    }
  }

  const loadFiles = async (nextAccountId = accountId, path = currentPath, forceRefresh = false) => {
    if (!nextAccountId) return
    setLoading(true)
    setError("")
    try {
      const response = await filesApi.list({ account_id: nextAccountId, path, force_refresh: forceRefresh })
      setFiles(response.data || [])
      setSelectedIds(new Set())
    } catch (err) {
      const text = getMessage(err, "文件加载失败")
      setFiles([])
      setError(text)
      toast.error(text)
    } finally {
      setLoading(false)
    }
  }

  const enterFolder = (file: FileEntry) => {
    if (!file.is_dir) return
    setBreadcrumbs((items) => [...items, { id: file.id, name: file.name }])
  }

  const jumpTo = (index: number) => {
    setBreadcrumbs((items) => items.slice(0, index + 1))
  }

  const runAction = async (message: string, runner: () => Promise<unknown>, reload = true) => {
    if (!accountId) return
    setBusyMessage(message)
    setError("")
    try {
      const response = await runner()
      const text = response && typeof response === "object" && "message" in response ? String((response as { message?: string }).message || `${message}完成`) : `${message}完成`
      toast.success(text)
      if (reload) await loadFiles(accountId, currentPath, true)
    } catch (err) {
      const text = getMessage(err, `${message}失败`)
      setError(text)
      toast.error(text)
    } finally {
      setBusyMessage("")
    }
  }

  const createFolder = async () => {
    if (!accountId || !newFolderName.trim()) return
    await runAction("创建文件夹", () => filesApi.createFolder({ account_id: accountId, path: currentPath, name: newFolderName.trim() }))
    setNewFolderName("")
  }

  const renameFile = async () => {
    if (!accountId || !renameTarget || !renameValue.trim()) return
    await runAction("重命名", () => filesApi.rename({ account_id: accountId, old_path: renameTarget.id, new_name: renameValue.trim() }))
    setRenameTarget(null)
  }

  const deleteFiles = async (targets: FileEntry[]) => {
    if (!accountId || targets.length === 0) return
    const ok = await confirm({
      title: targets.length === 1 ? `删除「${targets[0].name}」？` : `删除选中的 ${targets.length} 项？`,
      description: "删除后将无法从 LitePan 直接恢复，请确认网盘侧也允许该操作。",
      confirmText: "删除",
      destructive: true,
    })
    if (!ok) return
    await runAction("删除", () => filesApi.delete({ account_id: accountId, file_ids: targets.map((file) => file.id), parent_id: currentPath }))
  }

  const uploadFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!accountId || !event.target.files?.length) return
    await runAction("上传", () => filesApi.upload({ account_id: accountId, path: currentPath, files: event.target.files as FileList }))
    event.target.value = ""
  }

  const uploadFolder = async (event: ChangeEvent<HTMLInputElement>) => {
    if (!accountId || !event.target.files?.length) return
    const list = Array.from(event.target.files)
    await runAction("创建上传任务", async () => {
      for (const file of list) {
        await filesApi.uploadTask({
          account_id: accountId,
          path: currentPath,
          file,
          relative_path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        })
      }
      return { message: `已创建 ${list.length} 个上传任务` }
    })
    event.target.value = ""
  }

  const changeSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((value) => !value)
    else {
      setSortKey(key)
      setSortAsc(true)
    }
  }

  const toggleSelected = (file: FileEntry, checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (checked) next.add(file.id)
      else next.delete(file.id)
      return next
    })
  }

  const toggleAllVisible = (checked: boolean) => {
    setSelectedIds((current) => {
      const next = new Set(current)
      visibleFiles.forEach((file) => {
        if (checked) next.add(file.id)
        else next.delete(file.id)
      })
      return next
    })
  }

  const transferSelected = async (target: { id: string; path: string }) => {
    if (!accountId || !transferMode || selectedFiles.length === 0) return
    const payload = {
      account_id: accountId,
      source_account_id: accountId,
      target_account_id: accountId,
      file_ids: selectedFiles.map((file) => file.id),
      files: selectedFiles.map((file) => ({ id: file.id, name: file.name, is_dir: file.is_dir })),
      parent_id: currentPath,
      target_parent_id: target.id,
      target_path: target.path,
    }
    await runAction(transferMode === "move" ? "移动" : "复制", () => transferMode === "move" ? filesApi.move(payload) : filesApi.copy(payload))
    setTransferMode(null)
  }

  const generateCurrentDirectoryStrm = async () => {
    if (!accountId) return
    await runAction("生成 STRM", () => adminApi.generateCurrentDirectoryStrm({
      account_id: accountId,
      parent_id: currentPath,
      path: breadcrumbs.map((item) => item.name).slice(1).join("/") || "/",
    }), false)
  }

  const openPreview = async (file: FileEntry) => {
    if (file.is_dir) return
    setPreviewFile(file)
    setTextPreview("")
    if (isTextFile(file) && accountId) {
      try {
        setTextPreview(await filesApi.previewText(accountId, file))
      } catch (err) {
        setTextPreview(getMessage(err, "文本预览加载失败"))
      }
    }
  }

  return (
    <section className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
      <div className="mb-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">文件浏览</h1>
          <p className="mt-1 text-sm text-muted-foreground">统一查看已接入网盘，支持预览、批量操作、上传和 STRM 生成。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={accountId ? String(accountId) : ""}
            onValueChange={(value) => {
              setAccountId(Number(value))
              setBreadcrumbs([{ id: "0", name: "根目录" }])
            }}
          >
            <SelectTrigger className="w-[220px]"><SelectValue placeholder="选择账号" /></SelectTrigger>
            <SelectContent>
              {accounts.map((account) => <SelectItem key={account.id} value={String(account.id)}>{account.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={() => accountId && loadFiles(accountId, currentPath, true)} disabled={loading || !accountId}>
            <RefreshCw className={cn(loading && "animate-spin")} />
            刷新
          </Button>
        </div>
      </div>

      <Card className="mb-4 overflow-hidden">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            {selectedAccount ? <DriverAvatar name={selectedAccount.driver_card_name || selectedAccount.name} color={selectedAccount.driver_card_color} logo={selectedAccount.driver_card_logo} /> : null}
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{selectedAccount?.name || "未选择账号"}</div>
              <div className="text-xs text-muted-foreground">{stats.folders} 个文件夹，{stats.files} 个文件</div>
            </div>
            <div className="ml-0 flex min-w-0 flex-wrap items-center gap-1 lg:ml-4">
              {breadcrumbs.map((item, index) => (
                <button key={`${item.id}-${index}`} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onClick={() => jumpTo(index)}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input className="w-full pl-8 sm:w-[240px]" placeholder="搜索当前目录" value={query} onChange={(event) => setQuery(event.target.value)} />
            </div>
            {isAdmin ? (
              <>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline"><FolderPlus />新建</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>新建文件夹</DialogTitle>
                      <DialogDescription>在当前目录创建一个文件夹。</DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-2">
                      <Label htmlFor="folder-name">文件夹名称</Label>
                      <Input id="folder-name" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} />
                    </div>
                    <DialogFooter><Button onClick={createFolder} disabled={!newFolderName.trim() || !!busyMessage}>创建</Button></DialogFooter>
                  </DialogContent>
                </Dialog>
                <input ref={uploadRef} className="hidden" type="file" multiple onChange={uploadFiles} />
                <input ref={uploadFolderRef} className="hidden" type="file" multiple onChange={uploadFolder} {...{ webkitdirectory: "", directory: "" }} />
                <Button onClick={() => uploadRef.current?.click()}><Upload />上传文件</Button>
                <Button variant="outline" onClick={() => uploadFolderRef.current?.click()}><FolderPlus />上传文件夹</Button>
                <UploadTaskCenter />
                <Button variant="outline" onClick={generateCurrentDirectoryStrm} disabled={!accountId || !!busyMessage}><Film />生成 STRM</Button>
              </>
            ) : null}
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("table")} aria-label="列表视图"><List /></Button>
            <Button variant={viewMode === "grid" ? "secondary" : "ghost"} size="icon" onClick={() => setViewMode("grid")} aria-label="网格视图"><Grid2X2 /></Button>
          </div>
        </CardContent>
      </Card>

      {busyMessage ? <div className="mb-4 rounded-md border bg-accent px-3 py-2 text-sm text-accent-foreground">{busyMessage}...</div> : null}
      {error ? <div className="mb-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div> : null}

      {isAdmin && selectedFiles.length > 0 ? (
        <Card className="mb-4">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
            <div className="text-sm font-medium">已选择 {selectedFiles.length} 项</div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setTransferMode("move")}><MoveRight className="size-4" />移动</Button>
              <Button variant="outline" size="sm" onClick={() => setTransferMode("copy")}><Copy className="size-4" />复制</Button>
              <Button variant="destructive" size="sm" onClick={() => deleteFiles(selectedFiles)}><Trash2 className="size-4" />删除</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}><X className="size-4" />取消选择</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {loading ? <FileSkeleton /> : !accountId ? (
        <EmptyState icon={Folder} title="没有可用账号" description="管理员添加并启用存储账号后，文件会显示在这里。" />
      ) : visibleFiles.length === 0 ? (
        <EmptyState icon={Search} title="当前目录为空" description="换个账号或返回上级目录查看其它内容。" />
      ) : viewMode === "table" ? (
        <FileTable
          files={visibleFiles}
          selectedIds={selectedIds}
          allVisibleSelected={allVisibleSelected}
          isAdmin={isAdmin}
          sortKey={sortKey}
          onSort={changeSort}
          onSelectAll={toggleAllVisible}
          onSelect={toggleSelected}
          onOpen={enterFolder}
          onPreview={openPreview}
          onRename={(file) => { setRenameTarget(file); setRenameValue(file.name) }}
          onDelete={(file) => deleteFiles([file])}
          accountId={accountId}
        />
      ) : (
        <FileGrid
          files={visibleFiles}
          selectedIds={selectedIds}
          isAdmin={isAdmin}
          onSelect={toggleSelected}
          onOpen={enterFolder}
          onPreview={openPreview}
          onRename={(file) => { setRenameTarget(file); setRenameValue(file.name) }}
          onDelete={(file) => deleteFiles([file])}
          accountId={accountId}
        />
      )}

      <Dialog open={!!renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重命名</DialogTitle>
            <DialogDescription>修改当前项目的显示名称。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="rename-value">名称</Label>
            <Input id="rename-value" value={renameValue} onChange={(event) => setRenameValue(event.target.value)} />
          </div>
          <DialogFooter><Button onClick={renameFile} disabled={!renameValue.trim() || !!busyMessage}>保存</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transferMode)} onOpenChange={(open) => !open && setTransferMode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transferMode === "move" ? "移动到目录" : "复制到目录"}</DialogTitle>
            <DialogDescription>选择目标目录后会对当前选中的 {selectedFiles.length} 项执行操作。</DialogDescription>
          </DialogHeader>
          <FolderPicker
            accountId={accountId || ""}
            value={{ id: currentPath, path: "/" }}
            title="选择目标目录"
            description="选择移动或复制的目标目录。"
            onSelect={transferSelected}
          />
        </DialogContent>
      </Dialog>

      <FilePreviewDialog file={previewFile} accountId={accountId} textPreview={textPreview} onOpenChange={(open) => !open && setPreviewFile(null)} />
    </section>
  )
}

function FileSkeleton() {
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="h-11 w-full" />)}
      </CardContent>
    </Card>
  )
}

function FileTable(props: {
  files: FileEntry[]
  selectedIds: Set<string>
  allVisibleSelected: boolean
  isAdmin: boolean
  sortKey: SortKey
  onSort: (key: SortKey) => void
  onSelectAll: (checked: boolean) => void
  onSelect: (file: FileEntry, checked: boolean) => void
  onOpen: (file: FileEntry) => void
  onPreview: (file: FileEntry) => void
  onRename: (file: FileEntry) => void
  onDelete: (file: FileEntry) => void
  accountId: number
}) {
  return (
    <Card className="overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            {props.isAdmin ? <TableHead className="w-10"><Checkbox checked={props.allVisibleSelected} onCheckedChange={(checked) => props.onSelectAll(checked === true)} /></TableHead> : null}
            <TableHead><button className="inline-flex items-center gap-1" onClick={() => props.onSort("name")}>名称 <ArrowDownUp className="size-3" /></button></TableHead>
            <TableHead className="hidden w-36 sm:table-cell"><button className="inline-flex items-center gap-1" onClick={() => props.onSort("size")}>大小 <ArrowDownUp className="size-3" /></button></TableHead>
            <TableHead className="hidden w-52 md:table-cell"><button className="inline-flex items-center gap-1" onClick={() => props.onSort("modified")}>修改时间 <ArrowDownUp className="size-3" /></button></TableHead>
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {props.files.map((file) => (
            <TableRow key={file.id}>
              {props.isAdmin ? <TableCell><Checkbox checked={props.selectedIds.has(file.id)} onCheckedChange={(checked) => props.onSelect(file, checked === true)} /></TableCell> : null}
              <TableCell>
                <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => (file.is_dir ? props.onOpen(file) : props.onPreview(file))}>
                  <FileIcon file={file} />
                  <span className="truncate font-medium">{file.name}</span>
                </button>
              </TableCell>
              <TableCell className="hidden text-muted-foreground sm:table-cell">{formatEntrySize(file)}</TableCell>
              <TableCell className="hidden text-muted-foreground md:table-cell">{formatDateTime(file.modified)}</TableCell>
              <TableCell><FileActions file={file} isAdmin={props.isAdmin} accountId={props.accountId} onPreview={props.onPreview} onRename={props.onRename} onDelete={props.onDelete} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function FileGrid(props: {
  files: FileEntry[]
  selectedIds: Set<string>
  isAdmin: boolean
  onSelect: (file: FileEntry, checked: boolean) => void
  onOpen: (file: FileEntry) => void
  onPreview: (file: FileEntry) => void
  onRename: (file: FileEntry) => void
  onDelete: (file: FileEntry) => void
  accountId: number
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
      {props.files.map((file) => (
        <Card key={file.id} className="group overflow-hidden">
          <CardContent className="p-4">
            {props.isAdmin ? <Checkbox className="mb-2" checked={props.selectedIds.has(file.id)} onCheckedChange={(checked) => props.onSelect(file, checked === true)} /> : null}
            <button className="flex w-full flex-col items-start gap-3 text-left" onClick={() => (file.is_dir ? props.onOpen(file) : props.onPreview(file))}>
              <FileIcon file={file} large />
              <span className="line-clamp-2 min-h-10 text-sm font-medium">{file.name}</span>
              <span className="text-xs text-muted-foreground">{formatEntrySize(file)}</span>
            </button>
            <div className="mt-3 flex justify-end opacity-100 lg:opacity-0 lg:transition-opacity lg:group-hover:opacity-100">
              <FileActions file={file} isAdmin={props.isAdmin} accountId={props.accountId} onPreview={props.onPreview} onRename={props.onRename} onDelete={props.onDelete} />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FileIcon({ file, large }: { file: FileEntry; large?: boolean }) {
  const Icon = file.is_dir ? Folder : File
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-md border", large ? "size-12" : "size-9", file.is_dir ? "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300" : "bg-muted text-muted-foreground")}>
      <Icon className={large ? "size-6" : "size-4"} />
    </span>
  )
}

function FileActions(props: {
  file: FileEntry
  isAdmin: boolean
  accountId: number
  onPreview: (file: FileEntry) => void
  onRename: (file: FileEntry) => void
  onDelete: (file: FileEntry) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {!props.file.is_dir ? <DropdownMenuItem onClick={() => props.onPreview(props.file)}><Eye className="size-4" />预览</DropdownMenuItem> : null}
        {!props.file.is_dir ? <DropdownMenuItem onClick={() => window.open(filesApi.downloadUrl(props.accountId, props.file), "_blank")}><Download className="size-4" />下载</DropdownMenuItem> : null}
        {props.isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => props.onRename(props.file)}>重命名</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => props.onDelete(props.file)}><Trash2 className="size-4" />删除</DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FilePreviewDialog({ file, accountId, textPreview, onOpenChange }: { file: FileEntry | null; accountId: number | null; textPreview: string; onOpenChange: (open: boolean) => void }) {
  const kind = file ? previewKind(file) : "unknown"
  const url = file && accountId ? filesApi.previewUrl(accountId, file) : ""
  return (
    <Dialog open={Boolean(file)} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle className="truncate">{file?.name || "文件预览"}</DialogTitle>
          <DialogDescription>预览支持图片、视频、音频、PDF 和文本文件。</DialogDescription>
        </DialogHeader>
        <div className="min-h-[320px] rounded-lg border bg-muted/30 p-3">
          {kind === "image" ? <img src={url} alt={file?.name || ""} className="mx-auto max-h-[68dvh] rounded-md object-contain" /> : null}
          {kind === "video" ? <video src={url} controls className="mx-auto max-h-[68dvh] w-full rounded-md" /> : null}
          {kind === "audio" ? <div className="flex min-h-60 items-center justify-center"><audio src={url} controls className="w-full max-w-xl" /></div> : null}
          {kind === "pdf" ? <iframe src={url} title={file?.name} className="h-[68dvh] w-full rounded-md bg-background" /> : null}
          {kind === "text" ? <pre className="max-h-[68dvh] overflow-auto whitespace-pre-wrap rounded-md bg-background p-4 text-sm">{textPreview || "正在加载文本..."}</pre> : null}
          {kind === "unknown" ? (
            <div className="grid min-h-60 place-items-center text-center text-sm text-muted-foreground">
              <div><File className="mx-auto mb-3 size-10" />当前文件类型不支持内嵌预览，可以直接下载查看。</div>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          {file && accountId ? <Button variant="outline" onClick={() => window.open(filesApi.downloadUrl(accountId, file), "_blank")}><Download className="size-4" />下载</Button> : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function previewKind(file: FileEntry) {
  const name = file.name.toLowerCase()
  if (/\.(png|jpe?g|gif|webp|bmp|svg)$/.test(name)) return "image"
  if (/\.(mp4|webm|ogg|mkv|mov|m4v)$/.test(name)) return "video"
  if (/\.(mp3|wav|flac|m4a|aac|ogg)$/.test(name)) return "audio"
  if (/\.pdf$/.test(name)) return "pdf"
  if (isTextFile(file)) return "text"
  return "unknown"
}

function isTextFile(file: FileEntry) {
  return /\.(txt|md|json|yaml|yml|xml|csv|log|srt|ass|ini|conf|py|js|ts|tsx|jsx|css|html)$/.test(file.name.toLowerCase())
}
