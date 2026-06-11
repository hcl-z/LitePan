import { ref, computed } from 'vue'
import axios from 'axios'
import UploadNoticeDialog from '../components/index/UploadNoticeDialog.vue'
import UploadConflictDialog from '../components/index/UploadConflictDialog.vue'
import UploadTaskDeleteDialog from '../components/index/UploadTaskDeleteDialog.vue'
import BatchUploadTaskDeleteDialog from '../components/index/BatchUploadTaskDeleteDialog.vue'

const UPLOAD_NOTICE_STORAGE_KEY = 'litepan:index:upload-server-transfer-notice-hidden'

export function useUploadTasks(deps) {
  const {
    selectedAccountId,
    selectedAccountName,
    accounts,
    currentPath,
    breadcrumbItems,
    selectedFilesList,
    files,
    uploadFileInput,
    uploadFolderInput,
    refreshFiles,
    loadFiles,
    selectAccount,
    getRootId,
    wait,
    getCurrentBreadcrumbNameParts,
    custom,
    relay,
  } = deps

  const {
    relayTasks,
    relayTaskView,
    filteredRelayTasks,
    activeRelayCount,
    fetchRelayTasks,
    openRelayMonitoring,
    closeRelayMonitoring,
    connectRelayStream,
    disconnectRelayStream,
    batchDeleteRelayTasks,
  } = relay

  const uploadTasks = ref([])
  const localUploadTasks = ref([])
  const uploadTaskPanelOpen = ref(false)
  const taskPanelCategory = ref('upload')
  const uploadTaskView = ref('running')
  const uploadTaskPanelLoading = ref(false)
  const uploadTaskPanelLoadingText = ref('正在准备上传任务...')
  const uploadTaskOrderMap = ref({})
  let uploadTaskPollingTimer = null
  let uploadTaskEventSource = null
  let uploadTaskSseReconnectTimer = null
  const localUploadTaskControllers = new Map()
  const localUploadTaskPayloads = new Map()
  const uploadTaskMetaCache = new Map()
  const canceledLocalUploadTaskIds = new Set()
  const pausedLocalUploadTaskIds = new Set()
  const localDispatchingTaskIds = new Set()
  const pendingRemoteResumeTaskIds = new Set()
  const hiddenUploadTaskKeys = new Set()
  const batchPauseInProgress = ref(false)
  let singleDeleteWithFileChain = Promise.resolve()
  let uploadTaskOrderCounter = 0
  const uploadTaskServerConcurrency = ref(3)
  let uploadTaskSchedulerRunning = false

const getUploadTaskStableKey = (task) => String(task?.client_task_id || task?.task_id || '')

const ensureUploadTaskDisplayOrder = (task) => {
  const taskKey = getUploadTaskStableKey(task)
  if (!taskKey || uploadTaskOrderMap.value[taskKey]) {
    return
  }
  const preferredOrder = Number(task?.queue_order || 0)
  const nextOrder = preferredOrder > 0 ? preferredOrder : uploadTaskOrderCounter + 1
  uploadTaskOrderCounter = Math.max(uploadTaskOrderCounter, nextOrder)
  uploadTaskOrderMap.value = {
    ...uploadTaskOrderMap.value,
    [taskKey]: nextOrder
  }
}

const removeUploadTaskDisplayOrder = (task) => {
  const taskKey = typeof task === 'string' ? task : getUploadTaskStableKey(task)
  if (!taskKey || !uploadTaskOrderMap.value[taskKey]) {
    return
  }
  const nextMap = { ...uploadTaskOrderMap.value }
  delete nextMap[taskKey]
  uploadTaskOrderMap.value = nextMap
}

const sortUploadTasksForDisplay = (tasks) => {
  return [...tasks].sort((a, b) => {
    const orderA = uploadTaskOrderMap.value[getUploadTaskStableKey(a)]
    const orderB = uploadTaskOrderMap.value[getUploadTaskStableKey(b)]
    if (orderA && orderB && orderA !== orderB) {
      return orderA - orderB
    }

    const queueOrderA = Number(a?.queue_order || 0)
    const queueOrderB = Number(b?.queue_order || 0)
    if (queueOrderA > 0 && queueOrderB > 0 && queueOrderA !== queueOrderB) {
      return queueOrderA - queueOrderB
    }

    const createdAtA = Number(a?.created_at || 0)
    const createdAtB = Number(b?.created_at || 0)
    if (createdAtA !== createdAtB) {
      return createdAtA - createdAtB
    }

    return Number(orderA || Number.MAX_SAFE_INTEGER) - Number(orderB || Number.MAX_SAFE_INTEGER)
  })
}

const displayUploadTasks = computed(() => {
  return sortUploadTasksForDisplay(
    [...localUploadTasks.value, ...uploadTasks.value]
      .filter(task => !hiddenUploadTaskKeys.has(getUploadTaskStableKey(task)))
  )
})

const activeUploadTasks = computed(() => {
  return displayUploadTasks.value.filter(task => ['pending', 'running'].includes(task.status))
})

const runningUploadTasks = computed(() => {
  return displayUploadTasks.value.filter(task => ['pending', 'running', 'failed', 'paused', 'canceled'].includes(task.status))
})

const completedUploadTasks = computed(() => {
  return displayUploadTasks.value.filter(task => ['success', 'skipped'].includes(task.status))
})

const filteredUploadTasks = computed(() => {
  return uploadTaskView.value === 'completed'
    ? completedUploadTasks.value
    : runningUploadTasks.value
})

const canBatchPause = computed(() => {
  return filteredUploadTasks.value.some(task => ['pending', 'running'].includes(task.status))
})

const canBatchResume = computed(() => {
  return filteredUploadTasks.value.some(task => ['failed', 'paused', 'canceled'].includes(task.status))
})

const canBatchToggle = computed(() => {
  return canBatchPause.value || canBatchResume.value
})

const canBatchDelete = computed(() => {
  return filteredUploadTasks.value.length > 0
})

const batchToggleMode = computed(() => {
  return canBatchResume.value ? 'resume' : 'pause'
})

const batchToggleLabel = computed(() => {
  return batchToggleMode.value === 'pause' ? '全部暂停' : '全部开始'
})

const batchToggleTitle = computed(() => {
  if (!canBatchToggle.value) {
    return '当前没有可操作的任务'
  }
  return batchToggleMode.value === 'pause'
    ? '暂停当前页签中的任务'
    : '继续当前页签中的任务'
})

const batchDeleteLabel = computed(() => {
  return uploadTaskView.value === 'completed' ? '全部清空' : '全部删除'
})

const uploadTaskEmptyText = computed(() => {
  return uploadTaskView.value === 'completed'
    ? '暂无已完成任务'
    : '暂无进行中的上传任务'
})

const failedRelayTasks = computed(() => {
  return relayTasks.value.filter(task => task.status === 'failed')
})

const uploadTaskBadgeText = computed(() => {
  const runningCount = activeUploadTasks.value.length
  if (runningCount > 0) {
    return `上传中 ${runningCount}`
  }

  const relayRunningCount = activeRelayCount.value
  if (relayRunningCount > 0) {
    return `跨盘中 ${relayRunningCount}`
  }

  const failedCount = displayUploadTasks.value.filter(task => task.status === 'failed').length
  if (failedCount > 0) {
    return `失败 ${failedCount}`
  }

  const relayFailedCount = failedRelayTasks.value.length
  if (relayFailedCount > 0) {
    return `跨盘失败 ${relayFailedCount}`
  }

  const pausedCount = displayUploadTasks.value.filter(task => task.status === 'paused').length
  if (pausedCount > 0) {
    return `已暂停 ${pausedCount}`
  }

  const successCount = displayUploadTasks.value.filter(task => task.status === 'success').length
  if (successCount > 0) {
    return `上传完成 ${successCount}`
  }

  return ''
})

const hasTransferPanelActivity = computed(() => (
  activeUploadTasks.value.length > 0 ||
  activeRelayCount.value > 0 ||
  displayUploadTasks.value.some(task => ['failed', 'paused', 'success'].includes(task.status)) ||
  failedRelayTasks.value.length > 0 ||
  relayTasks.value.some(task => task.status === 'success')
))

const uploadTaskTitle = computed(() => {
  if (hasTransferPanelActivity.value) {
    return uploadTaskBadgeText.value || '传输列表'
  }
  return '传输列表'
})

const uploadTaskLabel = computed(() => {
  if (activeUploadTasks.value.length > 0) {
    return uploadTaskBadgeText.value
  }
  if (activeRelayCount.value > 0) {
    return uploadTaskBadgeText.value
  }
  if (displayUploadTasks.value.some(task => task.status === 'failed')) {
    return uploadTaskBadgeText.value || '传输失败'
  }
  if (failedRelayTasks.value.length > 0) {
    return uploadTaskBadgeText.value || '跨盘失败'
  }
  if (displayUploadTasks.value.some(task => task.status === 'paused')) {
    return uploadTaskBadgeText.value || '传输已暂停'
  }
  if (displayUploadTasks.value.some(task => task.status === 'success')) {
    return uploadTaskBadgeText.value || '上传完成'
  }
  return '暂无传输任务'
})

const getActiveUploadSlotUsage = () => (
  localDispatchingTaskIds.size +
  uploadTasks.value.filter(task => {
    const taskId = String(task?.task_id || '')
    const status = String(task?.status || '')
    if (status === 'running') {
      return true
    }
    if (status === 'pending') {
      return !pendingRemoteResumeTaskIds.has(taskId)
    }
    return false
  }).length
)

const isRemoteTaskWaitingResume = (task) => {
  const taskId = String(task?.task_id || '')
  return Boolean(taskId) && pendingRemoteResumeTaskIds.has(taskId)
}

const getUploadTaskStatusText = (status) => {
  if (status === 'pending') return '等待中'
  if (status === 'running') return '上传中'
  if (status === 'paused') return '已暂停'
  if (status === 'success') return '已完成'
  if (status === 'skipped') return '已跳过'
  if (status === 'failed') return '失败'
  return '已取消'
}

const getUploadTaskMessage = (task) => {
  if (isRemoteTaskWaitingResume(task)) {
    return '等待继续上传'
  }
  return task.message || '-'
}

const formatUploadPart = (task) => {
  if (String(task?.status || '') !== 'running') return ''
  const m = String(task?.message || '').match(/分片[（(]\s*(\d+)\s*\/\s*(\d+)\s*[)）]/)
  return m ? `分片 ${m[1]}/${m[2]}` : ''
}

const formatUploadSpeed = (bytesPerSecond) => {
  const speed = Number(bytesPerSecond || 0)
  if (!Number.isFinite(speed) || speed <= 0) {
    return ''
  }
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let value = speed
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }
  const precision = value >= 100 || unitIndex === 0 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(precision)} ${units[unitIndex]}`
}

const getUploadTaskSpeedText = (task) => {
  if (String(task?.status || '') !== 'running') {
    return ''
  }
  return formatUploadSpeed(task?.speed_bytes_per_second)
}

const getUploadTaskDriverType = (task) => {
  const taskDriverType = String(task?.driver_type || '').trim().toLowerCase()
  if (taskDriverType) {
    return taskDriverType
  }
  const account = accounts.value.find(item => String(item.id) === String(task?.account_id))
  return String(account?.driver_type || '').trim().toLowerCase()
}

const getUploadTaskDriverBadge = (task) => {
  const driverType = getUploadTaskDriverType(task)
  const account = accounts.value.find(item => {
    const sameId = task?.account_id != null && String(item.id) === String(task.account_id)
    const sameType = driverType && String(item.driver_type || '').toLowerCase() === driverType
    return sameId || sameType
  })
  const fallbackTitle = task?.account_name ? String(task.account_name) : '上传目标网盘'
  if (account) {
    return {
      logo: account.driver_card_logo || '',
      color: account.driver_card_color || '#64748b',
      name: account.driver_card_name || (task?.account_name ? String(task.account_name).slice(0, 2) : '网盘'),
      title: fallbackTitle,
    }
  }
  return {
    logo: '',
    color: '#64748b',
    name: task?.account_name ? String(task.account_name).slice(0, 2) : '网盘',
    title: fallbackTitle,
  }
}

const translateUploadErrorMessage = (message) => {
  const text = String(message || '').trim()
  if (!text) return '上传失败'
  if (text.includes('Server disconnected')) return '服务器连接已断开'
  if (text.includes('Connection timeout')) return '连接服务器超时'
  if (text.includes('Timeout')) return '请求超时'
  if (text.includes('Network Error')) return '网络连接异常'
  if (text.includes('Failed to fetch')) return '网络请求失败'
  return text
}

const normalizeUploadRelativePath = (file) => {
  const rawPath = String(file?.webkitRelativePath || file?.name || '').replace(/\\/g, '/')
  return rawPath
    .split('/')
    .filter(Boolean)
    .join('/')
}

const splitUploadRelativePath = (relativePath) => (
  String(relativePath || '')
    .split('/')
    .filter(Boolean)
)

const SYSTEM_UPLOAD_JUNK_FILE_NAMES = new Set([
  '.ds_store',
  '.localized',
  'thumbs.db',
  'ehthumbs.db',
  'desktop.ini'
])

const SYSTEM_UPLOAD_JUNK_DIRECTORY_NAMES = new Set([
  '__macosx',
  '.spotlight-v100',
  '.trashes',
  '.fseventsd',
  '$recycle.bin',
  'system volume information',
  'recycler',
  '.trash',
  'lost+found'
])

const getSystemUploadJunkReason = (relativePath) => {
  const parts = splitUploadRelativePath(relativePath)
  if (parts.length === 0) {
    return ''
  }

  const directoryParts = parts.slice(0, -1)
  const ignoredDirectory = directoryParts.find(part => {
    const normalizedPart = String(part || '').trim().toLowerCase()
    return (
      SYSTEM_UPLOAD_JUNK_DIRECTORY_NAMES.has(normalizedPart) ||
      /^\.trash-\d+$/.test(normalizedPart)
    )
  })
  if (ignoredDirectory) {
    return '系统生成目录，已跳过'
  }

  const fileName = String(parts[parts.length - 1] || '').trim()
  const normalizedFileName = fileName.toLowerCase()
  if (
    SYSTEM_UPLOAD_JUNK_FILE_NAMES.has(normalizedFileName) ||
    normalizedFileName.startsWith('._') ||
    /^\.nfs[0-9a-f]+$/i.test(fileName)
  ) {
    return '系统生成文件，已跳过'
  }

  return ''
}

const getUploadRelativeDirectory = (relativePath) => {
  const parts = splitUploadRelativePath(relativePath)
  parts.pop()
  return parts.join('/')
}

const getUploadFolderRootName = (relativePath) => splitUploadRelativePath(relativePath)[0] || ''

const buildUploadTargetDisplayPath = (relativeDirectory = '') => {
  const currentParts = getCurrentBreadcrumbNameParts()
  const relativeParts = splitUploadRelativePath(relativeDirectory)
  return [...currentParts, ...relativeParts].join('/')
}

const createSkippedUploadTask = (file, reason, options = {}) => ({
  task_id: `local-skip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  account_id: selectedAccountId.value,
  account_name: selectedAccountName.value,
  file_name: options.displayName || file.name,
  target_path: options.targetPath || currentPath.value,
  target_display_path: options.targetDisplayPath || '',
  status: 'skipped',
  progress: 0,
  message: reason,
  error: ''
})

const isLocalUploadTask = (task) => String(task?.task_id || '').startsWith('local-')

const isSendingToLitePanServerTask = (task) => (
  isLocalUploadTask(task) && String(task?.status || '') === 'pending'
)

const hasStartedUploadTask = (task) => {
  const status = String(task?.status || '')
  if (['running', 'paused'].includes(status)) {
    return true
  }
  return Number(task?.progress || 0) > 0
}

const shouldShowUploadTaskProgressBar = (task) => {
  const status = String(task?.status || '')
  return !['pending', 'canceled', 'success', 'skipped'].includes(status) && hasStartedUploadTask(task)
}

const shouldShowUploadTaskMetaPercent = (task) => {
  const status = String(task?.status || '')
  if (['canceled', 'success', 'skipped'].includes(status)) return false
  if (status === 'pending' && isLocalUploadTask(task)) return true
  return shouldShowUploadTaskProgressBar(task)
}

const shouldShowUploadTaskHairline = (task) => String(task?.status || '') === 'running'

const isUploadTaskActive = (task) => ['pending', 'running', 'paused'].includes(String(task?.status || ''))

const getUploadTaskPhaseLabel = (task) => {
  const status = String(task?.status || '')
  if (status === 'paused') return '已暂停'
  if (status === 'running') return '上传到网盘'
  if (status === 'pending') {
    if (isRemoteTaskWaitingResume(task)) return '等待继续'
    if (isSendingToLitePanServerTask(task)) return '发送至服务器'
    return '等待中'
  }
  return getUploadTaskStatusText(status)
}

const shouldShowRelayTaskMetaPercent = (task) => {
  if (['success', 'failed', 'canceled'].includes(String(task?.status || ''))) {
    return false
  }
  return task?.phase === 'downloading' || task?.phase === 'uploading'
}

const shouldShowRelayTaskHairline = (task) => {
  if (['success', 'failed', 'canceled'].includes(String(task?.status || ''))) return false
  return task?.phase === 'uploading'
}

const isRelayTaskActive = (task) => !['success', 'failed', 'canceled'].includes(String(task?.status || ''))

const getRelayPhaseLabel = (task) => {
  if (task?.phase === 'downloading') return '源盘下载中'
  if (task?.phase === 'uploading') return '目标盘上传中'
  return '等待中'
}

const shouldSkipUploadNotice = () => {
  try {
    return localStorage.getItem(UPLOAD_NOTICE_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

const markUploadNoticeSkipped = () => {
  try {
    localStorage.setItem(UPLOAD_NOTICE_STORAGE_KEY, 'true')
  } catch {
  }
}

const clearUploadNoticeSkipped = () => {
  try {
    localStorage.removeItem(UPLOAD_NOTICE_STORAGE_KEY)
  } catch {
  }
}

const showUploadNoticeDialog = () => {
  if (shouldSkipUploadNotice()) {
    return Promise.resolve(true)
  }
  return openUploadNoticeDialog()
}

const openUploadNoticeDialog = async () => {
  const result = await custom({
    title: '',
    size: 'medium',
    closable: false,
    hideFooter: true,
    component: UploadNoticeDialog,
    componentProps: {
      skipChecked: shouldSkipUploadNotice()
    }
  }).catch(() => null)

  if (!result?.confirmed) {
    return false
  }

  if (result.skipNextTime) {
    markUploadNoticeSkipped()
  } else {
    clearUploadNoticeSkipped()
  }

  return true
}

const ensureUploadNoticeConfirmed = async () => {
  return await showUploadNoticeDialog()
}

const openUploadNoticeFromPanel = async () => {
  await openUploadNoticeDialog()
}

const showUploadConflictDialog = async (fileName) => {
  return await custom({
    title: '',
    size: 'medium',
    closable: false,
    hideFooter: true,
    component: UploadConflictDialog,
    componentProps: {
      fileName
    }
  }).catch(() => null)
}

const showUploadTaskDeleteDialog = async (task) => {
  return await custom({
    title: '',
    size: 'medium',
    closable: false,
    hideFooter: true,
    component: UploadTaskDeleteDialog,
    componentProps: {
      taskName: task.file_name,
      allowDeleteUploadedFile: task.status === 'success'
    }
  }).catch(() => null)
}

const showBatchUploadTaskDeleteDialog = async (tasks) => {
  const successCount = tasks.filter(task => task.status === 'success').length
  return await custom({
    title: '',
    size: 'medium',
    closable: false,
    hideFooter: true,
    component: BatchUploadTaskDeleteDialog,
    componentProps: {
      taskCount: tasks.length,
      successCount
    }
  }).catch(() => null)
}

const canHandleUploadTaskPrimaryAction = (task) => {
  return ['success', 'skipped', 'pending', 'running', 'failed', 'paused', 'canceled'].includes(task.status)
}

const getUploadTaskPrimaryActionTitle = (task) => {
  if (['success', 'skipped'].includes(task.status)) {
    return '打开所在目录'
  }
  if (['pending', 'running'].includes(task.status)) {
    return '暂停上传任务'
  }
  return '继续上传任务'
}

const getUploadTaskPrimaryActionLabel = (task) => {
  if (['success', 'skipped'].includes(task.status)) {
    return '打开'
  }
  if (['pending', 'running'].includes(task.status)) {
    return '暂停'
  }
  return '继续'
}

const getUploadTaskPrimaryActionIconClass = (task) => {
  if (['success', 'skipped'].includes(task.status)) {
    return 'fas fa-folder-open'
  }
  if (['pending', 'running'].includes(task.status)) {
    return 'fas fa-pause'
  }
  return 'fas fa-play'
}

const getUploadTaskOpenPath = (task) => (
  String(task?.result?.parent_id || task?.result?.parent_path || task?.target_path || '0')
)

const isUploadTaskInCurrentPath = (task) => (
  String(task?.account_id) === String(selectedAccountId.value) &&
  getUploadTaskOpenPath(task) === String(currentPath.value || '0')
)

const getUploadTaskDirectorySegments = (task) => {
  const meta = getUploadTaskMeta(task)
  const targetDisplayPath = String(task?.target_display_path || meta?.targetDisplayPath || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
  if (targetDisplayPath.length > 0) {
    return targetDisplayPath
  }

  return String(task?.file_name || '')
    .replace(/\\/g, '/')
    .split('/')
    .filter(Boolean)
    .slice(0, -1)
}

const buildUploadTaskBreadcrumb = async (account, task) => {
  const rootId = getRootId(account?.config || {})
  const targetPath = getUploadTaskOpenPath(task)
  if (targetPath === rootId || (targetPath === '0' && rootId === '0')) {
    return [{ name: '根目录', path: rootId }]
  }

  const directorySegments = getUploadTaskDirectorySegments(task)
  if (directorySegments.length === 0) {
    return [
      { name: '根目录', path: rootId },
      { name: '当前目录', path: targetPath }
    ]
  }

  const breadcrumb = [{ name: '根目录', path: rootId }]
  let currentParentId = rootId

  for (let index = 0; index < directorySegments.length; index += 1) {
    const segment = directorySegments[index]
    const isLast = index === directorySegments.length - 1
    try {
      const response = await axios.get('/api/files/list', {
        params: {
          account_id: account.id,
          path: currentParentId
        }
      })
      const files = Array.isArray(response.data?.data) ? response.data.data : []
      const matchedFolder = files.find(item => item?.is_dir && String(item?.name || '') === segment)
      const resolvedPath = matchedFolder?.id ? String(matchedFolder.id) : (isLast ? targetPath : currentParentId)
      breadcrumb.push({
        name: segment,
        path: resolvedPath
      })
      currentParentId = resolvedPath
    } catch (error) {
      breadcrumb.push({
        name: segment,
        path: isLast ? targetPath : currentParentId
      })
    }
  }

  if (breadcrumb[breadcrumb.length - 1]?.path !== targetPath) {
    breadcrumb[breadcrumb.length - 1] = {
      ...breadcrumb[breadcrumb.length - 1],
      path: targetPath
    }
  }

  return breadcrumb
}

const canDeleteUploadTask = (task) => {
  return Boolean(task?.task_id)
}

const pauseUploadTask = async (task, silent = false) => {
  if (isLocalUploadTask(task)) {
    pauseLocalUploadTask(task.task_id)
    return
  }
  clearPendingRemoteResumeTask(task.task_id)
  try {
    patchRemoteUploadTask(task.task_id, {
      status: 'paused',
      message: '上传已暂停',
      error: ''
    })
    const response = await axios.post(`/api/files/upload/tasks/${task.task_id}/pause`)
    if (!response.data?.success) {
      await fetchUploadTasks()
      if (!silent) {
        window.appNotification.error(response.data?.message || '暂停上传任务失败')
      }
      return
    }
    await fetchUploadTasks()
  } catch (error) {
    console.error('暂停上传任务失败:', error)
    if (!silent) {
      window.appNotification.error(error.response?.data?.message || '暂停上传任务失败')
    }
  }
}

const resumeUploadTask = async (task, silent = false) => {
  if (isLocalUploadTask(task)) {
    const payload = getLocalUploadTaskPayload(task.task_id)
    if (!payload?.file) {
      updateLocalUploadTask(task.task_id, {
        status: 'failed',
        message: '继续上传失败',
        error: '缺少本地上传数据，无法继续'
      })
      if (!silent) {
        window.appNotification.error('缺少本地上传数据，无法继续')
      }
      return
    }

    clearLocalUploadTaskPausedState(task.task_id)
    clearLocalUploadTaskCanceledState(task.task_id)
    updateLocalUploadTask(task.task_id, {
      status: 'pending',
      message: '等待上传',
      error: ''
    })
    uploadTaskView.value = 'running'
    startUploadTaskScheduler()
    return
  }
  pendingRemoteResumeTaskIds.add(String(task.task_id))
  patchRemoteUploadTask(task.task_id, {
    message: '等待继续上传',
    error: ''
  })
  startUploadTaskPolling()
  uploadTaskView.value = 'running'
  startUploadTaskScheduler()
}

const handleDeleteUploadTask = async (task, options = {}) => {
  const { silent = false, deleteUploadedFile = null, skipDialog = false } = options
  if (!canDeleteUploadTask(task)) {
    return
  }

  if (isLocalUploadTask(task)) {
    if (!skipDialog) {
      const deleteResult = await showUploadTaskDeleteDialog(task)
      if (!deleteResult) {
        return
      }
    }
    hideUploadTask(task)
    cancelLocalUploadTask(task.task_id)
    return
  }

  const deleteResult = skipDialog
    ? { deleteUploadedFile: Boolean(deleteUploadedFile) }
    : await showUploadTaskDeleteDialog(task)
  if (!deleteResult) {
    return
  }

  const runDelete = async () => {
    try {
      hideUploadTask(task)
      removeRemoteUploadTask(task.task_id)
      const response = await axios.delete(`/api/files/upload/tasks/${task.task_id}`, {
        params: {
          delete_uploaded_file: deleteResult.deleteUploadedFile ? 'true' : 'false'
        }
      })
      if (!response.data?.success) {
        showUploadTask(task)
        await fetchUploadTasks()
        if (!silent) {
          window.appNotification.error(response.data?.message || '删除上传任务失败')
        }
        return
      }

      await fetchUploadTasks()
      if (
        deleteResult.deleteUploadedFile &&
        isUploadTaskInCurrentPath(task)
      ) {
        await loadFiles(true)
      }
      removeUploadTaskDisplayOrder(task)
    } catch (error) {
      showUploadTask(task)
      await fetchUploadTasks()
      console.error('删除上传任务失败:', error)
      if (!silent) {
        window.appNotification.error(error.response?.data?.message || '删除上传任务失败')
      }
    }
  }

  const shouldSerializeDeleteWithFile = deleteResult.deleteUploadedFile && task.status === 'success'
  if (shouldSerializeDeleteWithFile) {
    const runner = async () => runDelete()
    const chainedPromise = singleDeleteWithFileChain.then(runner, runner)
    singleDeleteWithFileChain = chainedPromise.catch(() => {})
    await chainedPromise
    return
  }

  await runDelete()
}

const handleUploadTaskPrimaryAction = async (task) => {
  if (['pending', 'running'].includes(task.status)) {
    await pauseUploadTask(task)
    return
  }

  if (['failed', 'paused', 'canceled'].includes(task.status)) {
    await resumeUploadTask(task)
    return
  }

  if (!['success', 'skipped'].includes(task.status)) {
    return
  }

  const account = accounts.value.find(item => String(item.id) === String(task.account_id))
  if (!account) {
    window.appNotification.warning('未找到对应账号')
    return
  }

  try {
    if (String(selectedAccountId.value) !== String(task.account_id)) {
      await selectAccount(account)
    }

    currentPath.value = getUploadTaskOpenPath(task)
    breadcrumbItems.value = await buildUploadTaskBreadcrumb(account, task)
    selectedFilesList.value = []
    await loadFiles(true)
    closeUploadTaskPanel()
  } catch (error) {
    console.error('打开上传目录失败:', error)
    window.appNotification.error('打开目录失败')
  }
}

const getBatchTasksByStatus = (statuses) => {
  return filteredUploadTasks.value.filter(task => statuses.includes(task.status))
}

const handleBatchPause = async () => {
  batchPauseInProgress.value = true
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const tasks = getBatchTasksByStatus(['pending', 'running'])
      if (tasks.length === 0) {
        break
      }
      for (const task of tasks) {
        await pauseUploadTask(task, true)
      }
      await wait(150)
      await fetchUploadTasks()
    }
  } finally {
    batchPauseInProgress.value = false
  }
}

const handleBatchResume = async () => {
  const tasks = getBatchTasksByStatus(['failed', 'paused', 'canceled'])
  if (tasks.length === 0) {
    return
  }
  for (const task of tasks) {
    await resumeUploadTask(task, true)
  }
}

const handleBatchToggle = async () => {
  if (batchToggleMode.value === 'pause') {
    await handleBatchPause()
    return
  }
  await handleBatchResume()
}

const handleBatchDelete = async () => {
  const tasks = [...filteredUploadTasks.value]
  if (tasks.length === 0) {
    return
  }

  const hasRemoteTasks = tasks.some(task => !isLocalUploadTask(task))
  let deleteUploadedFile = false
  if (hasRemoteTasks) {
    const deleteResult = await showBatchUploadTaskDeleteDialog(tasks)
    if (!deleteResult) {
      return
    }
    deleteUploadedFile = Boolean(deleteResult.deleteUploadedFile)
  }

  const localTasks = tasks.filter(task => isLocalUploadTask(task))
  const remoteTasks = tasks.filter(task => !isLocalUploadTask(task))
  const shouldShowDeleteFileLoading = deleteUploadedFile && remoteTasks.some(task => task.status === 'success')

  localTasks.forEach(task => {
    handleDeleteUploadTask(task, { silent: true, skipDialog: true })
  })

  if (remoteTasks.length > 0) {
    if (shouldShowDeleteFileLoading) {
      uploadTaskPanelLoading.value = true
      uploadTaskPanelLoadingText.value = '正在删除文件...'
    }
    try {
      const removedRemoteTasks = [...remoteTasks]
      remoteTasks.forEach(task => {
        hideUploadTask(task)
        removeRemoteUploadTask(task.task_id)
      })

      let hasFailedDelete = false
      let hasRejectedResponse = false
      try {
        const response = await axios.post('/api/files/upload/tasks/batch-delete', {
          task_ids: remoteTasks.map(task => task.task_id),
          delete_uploaded_file: deleteUploadedFile,
        })

        if (!response.data?.success) {
          hasRejectedResponse = true
          remoteTasks.forEach(task => showUploadTask(task))
        } else {
          const deletedTaskIdSet = new Set(response.data.data?.deleted_task_ids || [])
          remoteTasks.forEach(task => {
            if (deletedTaskIdSet.has(task.task_id)) {
              removeUploadTaskDisplayOrder(task)
            } else {
              showUploadTask(task)
            }
          })
          hasRejectedResponse = Boolean((response.data.data?.failed_task_ids || []).length)
        }
      } catch (error) {
        hasFailedDelete = true
        remoteTasks.forEach(task => showUploadTask(task))
      }

      if (hasFailedDelete || hasRejectedResponse) {
        await fetchUploadTasks()
        if (removedRemoteTasks.some(task =>
          deleteUploadedFile &&
          task.status === 'success' &&
          isUploadTaskInCurrentPath(task)
        )) {
          await loadFiles(true)
        }
      } else if (removedRemoteTasks.some(task =>
        deleteUploadedFile &&
        task.status === 'success' &&
        isUploadTaskInCurrentPath(task)
      )) {
        await loadFiles(true)
      }
    } finally {
      if (shouldShowDeleteFileLoading) {
        uploadTaskPanelLoading.value = false
        uploadTaskPanelLoadingText.value = '正在准备上传任务...'
      }
    }
  }

}
const applyRemoteUploadTasks = async (serverTasks = []) => {
  const previousStatusMap = new Map(uploadTasks.value.map(task => [task.task_id, task.status]))
  const allTasks = (serverTasks || []).map(task => {
    const meta = getUploadTaskMeta(task)
    if (!meta) {
      return task
    }

    const serverPathDepth = String(task?.target_display_path || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .length
    const cachedPathDepth = String(meta?.targetDisplayPath || '')
      .replace(/\\/g, '/')
      .split('/')
      .filter(Boolean)
      .length

    if (cachedPathDepth > serverPathDepth) {
      return {
        ...task,
        target_display_path: meta.targetDisplayPath || task.target_display_path
      }
    }

    return task
  })

  allTasks.forEach(task => ensureUploadTaskDisplayOrder(task))
  const canceledRemoteTasks = allTasks.filter(task => isRemoteUploadTaskCanceledFromLocal(task))
  const existingTaskKeySet = new Set([
    ...localUploadTasks.value.map(task => getUploadTaskStableKey(task)),
    ...allTasks.map(task => getUploadTaskStableKey(task))
  ])

  if (canceledRemoteTasks.length > 0) {
    const deleteResults = await Promise.allSettled(
      canceledRemoteTasks.map(task => axios.delete(`/api/files/upload/tasks/${task.task_id}`))
    )
    canceledRemoteTasks.forEach((task, index) => {
      if (deleteResults[index]?.status === 'fulfilled' && task.client_task_id) {
        clearLocalUploadTaskCanceledState(task.client_task_id)
      }
    })
  }

  Array.from(hiddenUploadTaskKeys).forEach(taskKey => {
    if (!existingTaskKeySet.has(taskKey)) {
      hiddenUploadTaskKeys.delete(taskKey)
    }
  })

  uploadTasks.value = allTasks.filter(task =>
    !isRemoteUploadTaskCanceledFromLocal(task) &&
    !hiddenUploadTaskKeys.has(getUploadTaskStableKey(task))
  )

  const hasNewSuccessInCurrentPath = uploadTasks.value.some(task => {
    if (task.status !== 'success') {
      return false
    }
    if (previousStatusMap.get(task.task_id) === 'success') {
      return false
    }
    return String(task.account_id) === String(selectedAccountId.value) && task.target_path === currentPath.value
  })

  if (hasNewSuccessInCurrentPath) {
    refreshFiles(true)
  }

  if (activeUploadTasks.value.length === 0 && !uploadTaskPanelOpen.value) {
    stopUploadTaskPolling()
  }

  startUploadTaskScheduler()
}

const fetchUploadTasks = async (silent = true) => {
  try {
    const response = await axios.get('/api/files/upload/tasks')
    if (response.data?.success) {
      await applyRemoteUploadTasks(response.data.data || [])
    }
  } catch (error) {
    console.error('获取上传任务失败:', error)
  }
}

const refreshUploadTaskServerConcurrency = async () => {
  try {
    const response = await axios.get('/api/admin/system-config')
    if (response.data?.success) {
      const limit = Number(response.data?.data?.upload_task_concurrency || 3)
      uploadTaskServerConcurrency.value = Number.isFinite(limit) && limit > 0 ? limit : 3
    }
  } catch {
    uploadTaskServerConcurrency.value = 3
  }
}

const getNextUploadTaskCandidate = () => {
  return displayUploadTasks.value.find(task => {
    if (hiddenUploadTaskKeys.has(getUploadTaskStableKey(task))) {
      return false
    }

    if (isLocalUploadTask(task)) {
      return String(task?.status || '') === 'pending' &&
        !localDispatchingTaskIds.has(task.task_id) &&
        !isLocalUploadTaskCanceled(task.task_id) &&
        !isLocalUploadTaskPaused(task.task_id) &&
        Boolean(getLocalUploadTaskPayload(task.task_id)?.file)
    }

    const status = String(task?.status || '')
    return isRemoteTaskWaitingResume(task) && ['paused', 'failed', 'canceled'].includes(status)
  }) || null
}

const activateQueuedUploadTask = async (task) => {
  if (!task) {
    return false
  }

  if (isLocalUploadTask(task)) {
    const payload = getLocalUploadTaskPayload(task.task_id)
    if (!payload?.file) {
      return false
    }
    localDispatchingTaskIds.add(task.task_id)
    createSingleUploadTask(payload.file, payload.conflictPolicy, task, payload)
      .finally(() => {
        localDispatchingTaskIds.delete(task.task_id)
        startUploadTaskScheduler()
      })
    return true
  }

  clearPendingRemoteResumeTask(task.task_id)
  axios.post(`/api/files/upload/tasks/${task.task_id}/resume`)
    .then(async (response) => {
      if (!response.data?.success) {
        pendingRemoteResumeTaskIds.add(String(task.task_id))
        patchRemoteUploadTask(task.task_id, {
          message: response.data?.message || '继续上传任务失败'
        })
      }
      await fetchUploadTasks()
    })
    .catch((error) => {
      pendingRemoteResumeTaskIds.add(String(task.task_id))
      patchRemoteUploadTask(task.task_id, {
        message: error.response?.data?.message || '继续上传任务失败'
      })
    })
    .finally(() => {
      startUploadTaskScheduler()
    })

  return true
}

const startUploadTaskScheduler = async () => {
  if (uploadTaskSchedulerRunning) {
    return
  }

  uploadTaskSchedulerRunning = true
  try {
    await refreshUploadTaskServerConcurrency()
    while (true) {
      const capacity = Math.max(0, uploadTaskServerConcurrency.value - getActiveUploadSlotUsage())
      if (capacity <= 0) {
        break
      }

      const nextTask = getNextUploadTaskCandidate()
      if (!nextTask) {
        break
      }

      const activated = await activateQueuedUploadTask(nextTask)
      if (!activated) {
        break
      }
    }
  } finally {
    uploadTaskSchedulerRunning = false
  }
}

const clearUploadTaskSseReconnectTimer = () => {
  if (uploadTaskSseReconnectTimer) {
    clearTimeout(uploadTaskSseReconnectTimer)
    uploadTaskSseReconnectTimer = null
  }
}

const disconnectUploadTaskStream = () => {
  clearUploadTaskSseReconnectTimer()
  if (uploadTaskEventSource) {
    uploadTaskEventSource.close()
    uploadTaskEventSource = null
  }
}

const scheduleUploadTaskStreamReconnect = () => {
  if (!uploadTaskPanelOpen.value || uploadTaskSseReconnectTimer) {
    return
  }
  uploadTaskSseReconnectTimer = window.setTimeout(() => {
    uploadTaskSseReconnectTimer = null
    connectUploadTaskStream()
  }, 3000)
}

const connectUploadTaskStream = () => {
  if (!uploadTaskPanelOpen.value || uploadTaskEventSource) {
    return
  }
  if (typeof window === 'undefined' || !window.EventSource) {
    startUploadTaskPolling()
    return
  }

  try {
    const eventSource = new window.EventSource('/api/files/upload/tasks/stream')
    uploadTaskEventSource = eventSource

    eventSource.addEventListener('tasks', async (event) => {
      try {
        const payload = JSON.parse(event.data || '{}')
        await applyRemoteUploadTasks(payload.tasks || [])
      } catch (error) {
        console.error('处理上传任务SSE消息失败:', error)
      }
    })

    eventSource.addEventListener('ping', () => {})

    eventSource.onopen = () => {
      stopUploadTaskPolling()
      clearUploadTaskSseReconnectTimer()
    }

    eventSource.onerror = () => {
      disconnectUploadTaskStream()
      startUploadTaskPolling()
      scheduleUploadTaskStreamReconnect()
    }
  } catch (error) {
    console.error('建立上传任务SSE连接失败:', error)
    startUploadTaskPolling()
    scheduleUploadTaskStreamReconnect()
  }
}

const startUploadTaskPolling = () => {
  if (uploadTaskPollingTimer) {
    return
  }
  uploadTaskPollingTimer = window.setInterval(() => {
    fetchUploadTasks()
  }, 400)
}

const stopUploadTaskPolling = () => {
  if (uploadTaskPollingTimer) {
    clearInterval(uploadTaskPollingTimer)
    uploadTaskPollingTimer = null
  }
}

const openUploadTaskPanel = async (preferredCategory = '') => {
  uploadTaskPanelOpen.value = true
  await fetchUploadTasks(false)
  await fetchRelayTasks()
  if (preferredCategory === 'relay' || (activeRelayCount.value > 0 && runningUploadTasks.value.length === 0)) {
    taskPanelCategory.value = 'relay'
    relayTaskView.value = 'running'
  } else {
    uploadTaskView.value = runningUploadTasks.value.length > 0 ? 'running' : 'completed'
  }
  connectUploadTaskStream()
  connectRelayStream(true)
  if (!uploadTaskEventSource) {
    startUploadTaskPolling()
  }
}

const closeUploadTaskPanel = () => {
  uploadTaskPanelOpen.value = false
  disconnectUploadTaskStream()
  disconnectRelayStream()
  if (activeRelayCount.value > 0) {
    openRelayMonitoring({ value: false })
  } else {
    closeRelayMonitoring()
  }
  if (activeUploadTasks.value.length === 0) {
    stopUploadTaskPolling()
  }
}

const getRelayTaskDriverBadge = (task) => {
  return getUploadTaskDriverBadge({
    driver_type: task?.target_driver_type,
    account_id: task?.target_account_id,
    account_name: task?.target_account_name || '跨盘任务',
  })
}

const handleDeleteRelayTask = async (task) => {
  try {
    await batchDeleteRelayTasks([task.task_id])
    window.appNotification?.success?.('跨盘任务已删除')
  } catch (error) {
    window.appNotification?.error?.(error.message || '删除跨盘任务失败')
  }
}

const handleBatchDeleteRelayTasks = async () => {
  const ids = filteredRelayTasks.value.map(task => task.task_id)
  if (!ids.length) return
  try {
    await batchDeleteRelayTasks(ids)
    window.appNotification?.success?.('跨盘任务已删除')
  } catch (error) {
    window.appNotification?.error?.(error.message || '删除跨盘任务失败')
  }
}

const handleUploadFile = async () => {
  if (!selectedAccountId.value) {
    window.appNotification.warning('请先选择账号')
    return
  }
  const confirmed = await ensureUploadNoticeConfirmed()
  if (!confirmed) {
    return
  }
  uploadFileInput.value?.click()
}

const handleUploadFolder = async () => {
  if (!selectedAccountId.value) {
    window.appNotification.warning('请先选择账号')
    return
  }
  const confirmed = await ensureUploadNoticeConfirmed()
  if (!confirmed) {
    return
  }
  uploadFolderInput.value?.click()
}

const createLocalUploadTask = (file, options = {}) => ({
  task_id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  account_id: selectedAccountId.value,
  account_name: selectedAccountName.value,
  file_name: options.displayName || file.name,
  target_path: options.targetPath || currentPath.value,
  target_display_path: options.targetDisplayPath || '',
  status: 'pending',
  progress: 0,
  message: '等待发送到 LitePan 服务器',
  error: ''
})

const addLocalUploadTask = (task) => {
  ensureUploadTaskDisplayOrder(task)
  localUploadTasks.value = [task, ...localUploadTasks.value]
}

const updateLocalUploadTask = (taskId, patch) => {
  localUploadTasks.value = localUploadTasks.value.map(task => (
    task.task_id === taskId ? { ...task, ...patch } : task
  ))
}

const removeLocalUploadTask = (taskId) => {
  localUploadTasks.value = localUploadTasks.value.filter(task => task.task_id !== taskId)
}

const isRemoteUploadTaskCanceledFromLocal = (task) => {
  const clientTaskId = String(task?.client_task_id || '')
  return Boolean(clientTaskId) && canceledLocalUploadTaskIds.has(clientTaskId)
}

const isLocalUploadTaskCanceled = (taskId) => canceledLocalUploadTaskIds.has(taskId)
const isLocalUploadTaskPaused = (taskId) => pausedLocalUploadTaskIds.has(taskId)

const releaseLocalUploadTaskController = (taskId) => {
  localUploadTaskControllers.delete(taskId)
}

const setLocalUploadTaskPayload = (taskId, payload) => {
  localUploadTaskPayloads.set(taskId, payload)
}

const getLocalUploadTaskPayload = (taskId) => localUploadTaskPayloads.get(taskId)

const clearLocalUploadTaskPayload = (taskId) => {
  localUploadTaskPayloads.delete(taskId)
}

const setUploadTaskMeta = (taskId, meta) => {
  if (!taskId) {
    return
  }
  uploadTaskMetaCache.set(String(taskId), {
    displayName: String(meta?.displayName || ''),
    targetDisplayPath: String(meta?.targetDisplayPath || '')
  })
}

const getUploadTaskMeta = (task) => {
  const clientTaskId = String(task?.client_task_id || '')
  if (clientTaskId && uploadTaskMetaCache.has(clientTaskId)) {
    return uploadTaskMetaCache.get(clientTaskId)
  }

  const taskId = String(task?.task_id || '')
  if (taskId && uploadTaskMetaCache.has(taskId)) {
    return uploadTaskMetaCache.get(taskId)
  }

  return null
}

const clearUploadTaskMeta = (taskOrId) => {
  if (!taskOrId) {
    return
  }

  if (typeof taskOrId === 'string') {
    uploadTaskMetaCache.delete(String(taskOrId))
    return
  }

  const clientTaskId = String(taskOrId?.client_task_id || '')
  if (clientTaskId) {
    uploadTaskMetaCache.delete(clientTaskId)
  }

  const taskId = String(taskOrId?.task_id || '')
  if (taskId) {
    uploadTaskMetaCache.delete(taskId)
  }
}

const clearLocalUploadTaskCanceledState = (taskId) => {
  canceledLocalUploadTaskIds.delete(taskId)
}

const clearLocalUploadTaskPausedState = (taskId) => {
  pausedLocalUploadTaskIds.delete(taskId)
}

const clearPendingRemoteResumeTask = (taskId) => {
  pendingRemoteResumeTaskIds.delete(String(taskId || ''))
}

const cancelLocalUploadTask = (taskId) => {
  canceledLocalUploadTaskIds.add(taskId)
  clearLocalUploadTaskPausedState(taskId)
  const controller = localUploadTaskControllers.get(taskId)
  if (controller) {
    controller.abort()
  }
  removeLocalUploadTask(taskId)
  removeUploadTaskDisplayOrder(taskId)
  clearLocalUploadTaskPayload(taskId)
  clearUploadTaskMeta(taskId)
}

const pauseLocalUploadTask = (taskId) => {
  pausedLocalUploadTaskIds.add(taskId)
  clearLocalUploadTaskCanceledState(taskId)
  const controller = localUploadTaskControllers.get(taskId)
  if (controller) {
    controller.abort()
  }
  updateLocalUploadTask(taskId, {
    status: 'paused',
    message: '上传已暂停',
    error: ''
  })
}

const isLocalPauseRequested = (taskId) => batchPauseInProgress.value || isLocalUploadTaskPaused(taskId)

const patchRemoteUploadTask = (taskId, patch) => {
  uploadTasks.value = uploadTasks.value.map(task => (
    task.task_id === taskId ? { ...task, ...patch } : task
  ))
}

const removeRemoteUploadTask = (taskId) => {
  const removedTask = uploadTasks.value.find(task => task.task_id === taskId)
  uploadTasks.value = uploadTasks.value.filter(task => task.task_id !== taskId)
  if (removedTask) {
    clearUploadTaskMeta(removedTask)
  } else {
    clearUploadTaskMeta(taskId)
  }
}

const hideUploadTask = (taskOrKey) => {
  const taskKey = typeof taskOrKey === 'string' ? taskOrKey : getUploadTaskStableKey(taskOrKey)
  if (taskKey) {
    hiddenUploadTaskKeys.add(String(taskKey))
  }
}

const showUploadTask = (taskOrKey) => {
  const taskKey = typeof taskOrKey === 'string' ? taskOrKey : getUploadTaskStableKey(taskOrKey)
  if (taskKey) {
    hiddenUploadTaskKeys.delete(String(taskKey))
  }
}

const createSingleUploadTask = async (selectedFile, conflictPolicy = 'fail', localTask = null, options = {}) => {
  const task = localTask || createLocalUploadTask(selectedFile, options)
  const targetPath = options.targetPath || task.target_path || currentPath.value
  const displayName = options.displayName || task.file_name || selectedFile.name
  const targetDisplayPath = options.targetDisplayPath || task.target_display_path || buildUploadTargetDisplayPath()
  if (!localTask) {
    addLocalUploadTask(task)
  }
  setLocalUploadTaskPayload(task.task_id, {
    file: selectedFile,
    conflictPolicy,
    targetPath,
    displayName,
    targetDisplayPath
  })
  setUploadTaskMeta(task.task_id, {
    displayName,
    targetDisplayPath
  })
  if (isLocalUploadTaskCanceled(task.task_id)) {
    removeLocalUploadTask(task.task_id)
    clearLocalUploadTaskCanceledState(task.task_id)
    clearLocalUploadTaskPayload(task.task_id)
    return { success: false, canceled: true, message: '任务已取消' }
  }
  if (isLocalPauseRequested(task.task_id)) {
    updateLocalUploadTask(task.task_id, {
      status: 'paused',
      message: '上传已暂停',
      error: ''
    })
    return { success: false, paused: true, message: '任务已暂停' }
  }
  const formData = new FormData()
  formData.append('account_id', selectedAccountId.value)
  formData.append('path', targetPath)
  formData.append('file', selectedFile)
  formData.append('conflict_policy', conflictPolicy)
  formData.append('client_task_id', task.task_id)
  formData.append('display_name', displayName)
  formData.append('target_display_path', targetDisplayPath)
  const controller = new AbortController()
  localUploadTaskControllers.set(task.task_id, controller)

  try {
    const response = await axios.post('/api/files/upload-task', formData, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'multipart/form-data'
      },
      onUploadProgress: (progressEvent) => {
        if (isLocalUploadTaskCanceled(task.task_id)) {
          return
        }
        const loaded = progressEvent.loaded || 0
        const total = progressEvent.total || selectedFile.size || 0
        const progress = total > 0
          ? Math.min(99, Math.round((loaded / total) * 100))
          : 0
        const message = total > 0 && loaded >= total
          ? '文件已发送到 LitePan 服务器，正在创建上传任务'
          : `正在将文件发送给 LitePan 服务器 ${progress}%`
        updateLocalUploadTask(task.task_id, {
          status: 'pending',
          progress,
          message
        })
      }
    })

    if (response.data?.success) {
      const createdTaskId = response.data?.data?.task_id
      if (isLocalUploadTaskCanceled(task.task_id)) {
        if (createdTaskId) {
          try {
            await axios.delete(`/api/files/upload/tasks/${createdTaskId}`)
            clearLocalUploadTaskCanceledState(task.task_id)
          } catch (cleanupError) {
            console.error('清理已取消的上传任务失败:', cleanupError)
          }
        }
        removeLocalUploadTask(task.task_id)
        clearLocalUploadTaskPayload(task.task_id)
        return { success: false, canceled: true, message: '任务已取消' }
      }
      if (isLocalPauseRequested(task.task_id)) {
        if (createdTaskId) {
          try {
            await axios.post(`/api/files/upload/tasks/${createdTaskId}/pause`)
          } catch (pauseError) {
            console.error('同步暂停已创建的上传任务失败:', pauseError)
          }
          await fetchUploadTasks()
          startUploadTaskPolling()
          removeLocalUploadTask(task.task_id)
          clearLocalUploadTaskPayload(task.task_id)
          clearLocalUploadTaskPausedState(task.task_id)
          clearLocalUploadTaskCanceledState(task.task_id)
          return { success: false, paused: true, message: '任务已暂停' }
        }

        updateLocalUploadTask(task.task_id, {
          status: 'paused',
          message: '上传已暂停',
          error: ''
        })
        return { success: false, paused: true, message: '任务已暂停' }
      }
      updateLocalUploadTask(task.task_id, {
        status: 'pending',
        progress: 0,
        message: '上传任务已创建'
      })
      await fetchUploadTasks()
      removeLocalUploadTask(task.task_id)
      clearLocalUploadTaskPayload(task.task_id)
      clearLocalUploadTaskPausedState(task.task_id)
      clearLocalUploadTaskCanceledState(task.task_id)
      startUploadTaskPolling()
      return { success: true, message: response.data.message || '上传任务已创建' }
    }

    updateLocalUploadTask(task.task_id, {
      status: 'failed',
      message: '创建上传任务失败',
      error: translateUploadErrorMessage(response.data?.message || '创建上传任务失败')
    })
    return { success: false, message: response.data?.message || '创建上传任务失败' }
  } catch (error) {
    if (isLocalPauseRequested(task.task_id)) {
      updateLocalUploadTask(task.task_id, {
        status: 'paused',
        message: '上传已暂停',
        error: ''
      })
      return { success: false, paused: true, message: '任务已暂停' }
    }
    if (error?.code === 'ERR_CANCELED' || error?.name === 'CanceledError' || isLocalUploadTaskCanceled(task.task_id)) {
      removeLocalUploadTask(task.task_id)
      clearLocalUploadTaskPayload(task.task_id)
      return { success: false, canceled: true, message: '任务已取消' }
    }
    const errorMessage = error.response?.data?.message || error.message
    updateLocalUploadTask(task.task_id, {
      status: 'failed',
      message: '创建上传任务失败',
      error: translateUploadErrorMessage(errorMessage)
    })
    return { success: false, message: `创建上传任务失败: ${errorMessage}` }
  } finally {
    releaseLocalUploadTaskController(task.task_id)
  }
}

const resolveRemoteFolderByName = async (parentId, folderName, forceRefresh = false) => {
  const params = {
    account_id: selectedAccountId.value,
    path: parentId
  }

  if (forceRefresh) {
    params.force_refresh = true
  }

  const response = await axios.get('/api/files/list', { params })

  if (!response.data?.success) {
    throw new Error(response.data?.message || `获取目录 "${folderName}" 失败`)
  }

  const entries = Array.isArray(response.data?.data) ? response.data.data : []
  const existingFolder = entries.find(item => item?.is_dir && item?.name === folderName)
  if (existingFolder?.id) {
    return existingFolder.id
  }

  const existingFile = entries.find(item => !item?.is_dir && item?.name === folderName)
  if (existingFile) {
    throw new Error(`当前目录已存在同名文件：${folderName}`)
  }

  return null
}

const listRemoteEntries = async (path, forceRefresh = false) => {
  const params = {
    account_id: selectedAccountId.value,
    path
  }

  if (forceRefresh) {
    params.force_refresh = true
  }

  const response = await axios.get('/api/files/list', { params })

  if (!response.data?.success) {
    throw new Error(response.data?.message || '获取目录内容失败')
  }

  return Array.isArray(response.data?.data) ? response.data.data : []
}

const ensureRemoteFolder = async (parentId, folderName) => {
  if (!folderName) {
    return parentId
  }

  const formData = new FormData()
  formData.append('account_id', selectedAccountId.value)
  formData.append('path', parentId)
  formData.append('name', folderName)

  try {
    const response = await axios.post('/api/files/create-folder', formData)
    if (response.data?.success) {
      return (
        response.data?.data?.folder_id ||
        response.data?.data?.folder_path ||
        await resolveRemoteFolderByName(parentId, folderName)
      )
    }
  } catch (error) {
    await wait(800)
    const fallbackFolderId = await resolveRemoteFolderByName(parentId, folderName, true)
    if (fallbackFolderId) {
      return fallbackFolderId
    }
    const errorMessage = error.response?.data?.message || error.message
    throw new Error(errorMessage || `创建文件夹 "${folderName}" 失败`)
  }

  await wait(800)
  const fallbackFolderId = await resolveRemoteFolderByName(parentId, folderName, true)
  if (fallbackFolderId) {
    return fallbackFolderId
  }

  throw new Error(`创建文件夹 "${folderName}" 失败`)
}

const buildFolderUploadTaskPlans = async (selectedFiles) => {
  const normalizedFiles = selectedFiles
    .map(file => ({
      file,
      relativePath: normalizeUploadRelativePath(file)
    }))
    .filter(item => item.relativePath)

  if (normalizedFiles.length === 0) {
    throw new Error('未读取到可上传的文件，空文件夹暂不支持')
  }

  const rootFolderNames = [...new Set(normalizedFiles.map(item => getUploadFolderRootName(item.relativePath)).filter(Boolean))]
  if (rootFolderNames.length !== 1) {
    throw new Error('当前仅支持一次上传一个文件夹')
  }

  const rootFolderName = rootFolderNames[0]
  const folderIdMap = new Map()
  folderIdMap.set('', currentPath.value)
  const skippedTasks = []
  const uploadableFiles = []

  for (const item of normalizedFiles) {
    const skipReason = getSystemUploadJunkReason(item.relativePath)
    if (skipReason) {
      skippedTasks.push(createSkippedUploadTask(item.file, skipReason, {
        displayName: item.relativePath,
        targetPath: currentPath.value,
        targetDisplayPath: buildUploadTargetDisplayPath()
      }))
      continue
    }
    uploadableFiles.push(item)
  }

  if (uploadableFiles.length === 0) {
    return {
      rootFolderName,
      taskPlans: [],
      skippedTasks,
      hasUploadableFiles: false
    }
  }

  const relativeDirectories = new Set()
  for (const item of uploadableFiles) {
    const directoryPath = getUploadRelativeDirectory(item.relativePath)
    if (!directoryPath) {
      continue
    }
    const parts = splitUploadRelativePath(directoryPath)
    const currentParts = []
    for (const part of parts) {
      currentParts.push(part)
      relativeDirectories.add(currentParts.join('/'))
    }
  }

  const sortedDirectories = [...relativeDirectories].sort((a, b) => {
    return splitUploadRelativePath(a).length - splitUploadRelativePath(b).length
  })

  for (const relativeDirectory of sortedDirectories) {
    const parts = splitUploadRelativePath(relativeDirectory)
    const folderName = parts[parts.length - 1]
    const parentRelativeDirectory = parts.slice(0, -1).join('/')
    const parentId = folderIdMap.get(parentRelativeDirectory)
    if (!parentId) {
      throw new Error(`未找到上级目录：${parentRelativeDirectory || '根目录'}`)
    }
    const folderId = await ensureRemoteFolder(parentId, folderName)
    folderIdMap.set(relativeDirectory, folderId)
  }

  const remoteNameSetMap = new Map()
  const getRemoteNameSet = async (targetPath) => {
    if (!remoteNameSetMap.has(targetPath)) {
      const entries = await listRemoteEntries(targetPath)
      remoteNameSetMap.set(
        targetPath,
        new Set(entries.map(entry => String(entry?.name || '').toLowerCase()))
      )
    }
    return remoteNameSetMap.get(targetPath)
  }

  const taskPlans = []
  let batchConflictPolicy = null

  for (const item of uploadableFiles) {
    const relativeDirectory = getUploadRelativeDirectory(item.relativePath)
    const targetPath = folderIdMap.get(relativeDirectory) || currentPath.value
    const targetDisplayPath = buildUploadTargetDisplayPath(relativeDirectory)

    if (Number(item.file?.size || 0) <= 0) {
      skippedTasks.push(createSkippedUploadTask(item.file, '暂不支持上传空文件，已跳过', {
        displayName: item.relativePath,
        targetPath,
        targetDisplayPath
      }))
      continue
    }

    const remoteNameSet = await getRemoteNameSet(targetPath)
    let conflictPolicy = 'overwrite'

    if (remoteNameSet.has(String(item.file.name || '').toLowerCase())) {
      if (!batchConflictPolicy) {
        const conflictResult = await showUploadConflictDialog(item.relativePath)
        if (!conflictResult) {
          break
        }
        if (conflictResult.applyAll) {
          batchConflictPolicy = conflictResult.policy
        }
        conflictPolicy = conflictResult.policy
      } else {
        conflictPolicy = batchConflictPolicy
      }

      if (conflictPolicy === 'skip') {
        skippedTasks.push(createSkippedUploadTask(item.file, '检测到同名文件，已跳过', {
          displayName: item.relativePath,
          targetPath,
          targetDisplayPath
        }))
        continue
      }
    }

    taskPlans.push({
      file: item.file,
      conflictPolicy,
      targetPath,
      targetDisplayPath,
      displayName: item.relativePath,
      localTask: createLocalUploadTask(item.file, {
        displayName: item.relativePath,
        targetPath,
        targetDisplayPath
      })
    })
  }

  return {
    rootFolderName,
    taskPlans,
    skippedTasks,
    hasUploadableFiles: true
  }
}

const handleUploadFileChange = async (event) => {
  const target = event.target
  const selectedFiles = Array.from(target?.files || [])
  if (selectedFiles.length === 0) {
    return
  }

  try {
    uploadTaskPanelOpen.value = true
    uploadTaskView.value = 'running'
    await refreshUploadTaskServerConcurrency()
    let failedCount = 0
    let batchConflictPolicy = null
    const existingNameSet = new Set(files.value.map(file => String(file.name || '').toLowerCase()))
    const taskPlans = []

    for (const selectedFile of selectedFiles) {
      const skipReason = getSystemUploadJunkReason(normalizeUploadRelativePath(selectedFile))
      if (skipReason) {
        addLocalUploadTask(createSkippedUploadTask(selectedFile, skipReason))
        continue
      }

      if (Number(selectedFile?.size || 0) <= 0) {
        addLocalUploadTask(createSkippedUploadTask(selectedFile, '暂不支持上传空文件，已跳过'))
        continue
      }

      let conflictPolicy = 'overwrite'
      if (existingNameSet.has(selectedFile.name.toLowerCase())) {
        if (!batchConflictPolicy) {
          const conflictResult = await showUploadConflictDialog(selectedFile.name)
          if (!conflictResult) {
            break
          }
          if (conflictResult.applyAll) {
            batchConflictPolicy = conflictResult.policy
          }
          conflictPolicy = conflictResult.policy
        } else {
          conflictPolicy = batchConflictPolicy
        }

        if (conflictPolicy === 'skip') {
          addLocalUploadTask(createSkippedUploadTask(selectedFile, '检测到同名文件，已跳过'))
          failedCount += 1
          continue
        }
      }

      taskPlans.push({
        file: selectedFile,
        conflictPolicy,
        localTask: createLocalUploadTask(selectedFile)
      })
    }

    if (taskPlans.length > 0) {
      taskPlans.forEach(item => {
        setLocalUploadTaskPayload(item.localTask.task_id, {
          file: item.file,
          conflictPolicy: item.conflictPolicy
        })
      })
      taskPlans.forEach(item => ensureUploadTaskDisplayOrder(item.localTask))
      localUploadTasks.value = [...taskPlans.map(item => item.localTask), ...localUploadTasks.value]
      startUploadTaskScheduler()
    }

  } finally {
    if (target) {
      target.value = ''
    }
  }
}

const handleUploadFolderChange = async (event) => {
  const target = event.target
  const selectedFiles = Array.from(target?.files || [])
  if (selectedFiles.length === 0) {
    return
  }

  try {
    uploadTaskPanelOpen.value = true
    uploadTaskView.value = 'running'
    await refreshUploadTaskServerConcurrency()
    uploadTaskPanelLoading.value = true
    uploadTaskPanelLoadingText.value = '正在准备上传文件夹任务...'
    const folderPlan = await buildFolderUploadTaskPlans(selectedFiles)
    const taskPlans = folderPlan.taskPlans
    uploadTaskPanelLoadingText.value = folderPlan.rootFolderName
      ? `正在载入 ${folderPlan.rootFolderName} 的上传任务...`
      : '正在载入上传任务...'
    if (Array.isArray(folderPlan.skippedTasks) && folderPlan.skippedTasks.length > 0) {
      folderPlan.skippedTasks.forEach(task => addLocalUploadTask(task))
    }

    if (folderPlan.rootFolderName && folderPlan.hasUploadableFiles !== false) {
      await refreshFiles(true)
    }

    if (taskPlans.length === 0) {
      return
    }

    taskPlans.forEach(item => {
      setLocalUploadTaskPayload(item.localTask.task_id, {
        file: item.file,
        conflictPolicy: item.conflictPolicy,
        targetPath: item.targetPath,
        displayName: item.displayName
      })
    })
    taskPlans.forEach(item => ensureUploadTaskDisplayOrder(item.localTask))
    localUploadTasks.value = [...taskPlans.map(item => item.localTask), ...localUploadTasks.value]
    uploadTaskPanelLoading.value = false
    startUploadTaskScheduler()
  } catch (error) {
    console.error('上传文件夹准备失败:', error)
    window.appNotification.error(error.message || '准备上传文件夹失败')
  } finally {
    uploadTaskPanelLoading.value = false
    uploadTaskPanelLoadingText.value = '正在准备上传任务...'
    if (target) {
      target.value = ''
    }
  }
}

  const cleanupUploadTasks = () => {
    localUploadTaskControllers.forEach(controller => controller.abort())
    localUploadTaskControllers.clear()
    localUploadTaskPayloads.clear()
    uploadTaskMetaCache.clear()
    pausedLocalUploadTaskIds.clear()
    canceledLocalUploadTaskIds.clear()
    disconnectUploadTaskStream()
    stopUploadTaskPolling()
  }

  return {
    uploadTaskPanelOpen,
    taskPanelCategory,
    uploadTaskView,
    uploadTaskPanelLoading,
    uploadTaskPanelLoadingText,
    displayUploadTasks,
    activeUploadTasks,
    runningUploadTasks,
    completedUploadTasks,
    filteredUploadTasks,
    canBatchToggle,
    canBatchDelete,
    batchToggleMode,
    batchToggleLabel,
    batchToggleTitle,
    batchDeleteLabel,
    uploadTaskEmptyText,
    failedRelayTasks,
    uploadTaskTitle,
    uploadTaskLabel,
    getUploadTaskStatusText,
    formatUploadPart,
    getUploadTaskSpeedText,
    getUploadTaskDriverBadge,
    isUploadTaskActive,
    getUploadTaskPhaseLabel,
    shouldShowUploadTaskMetaPercent,
    shouldShowUploadTaskHairline,
    canHandleUploadTaskPrimaryAction,
    getUploadTaskPrimaryActionTitle,
    getUploadTaskPrimaryActionIconClass,
    canDeleteUploadTask,
    handleDeleteUploadTask,
    handleUploadTaskPrimaryAction,
    handleBatchToggle,
    handleBatchDelete,
    openUploadTaskPanel,
    closeUploadTaskPanel,
    openUploadNoticeFromPanel,
    handleUploadFile,
    handleUploadFolder,
    handleUploadFileChange,
    handleUploadFolderChange,
    fetchUploadTasks,
    startUploadTaskPolling,
    getRelayTaskDriverBadge,
    handleDeleteRelayTask,
    handleBatchDeleteRelayTasks,
    getRelayPhaseLabel,
    shouldShowRelayTaskMetaPercent,
    shouldShowRelayTaskHairline,
    isRelayTaskActive,
    cleanupUploadTasks,
  }
}
