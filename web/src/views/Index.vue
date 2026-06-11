<template>
  <div class="index-page">
    <div v-if="operationLoading" class="operation-loading-overlay">
      <div class="operation-loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-text">{{ operationMessage }}</div>
      </div>
    </div>
    <div class="header">
      <div class="content-container-fluid">
        <div class="header-content">
          <h1>
            <div class="logo-container">
              <img src="/static/img/logo.png" alt="LitePan" class="logo">
              <span v-if="isAdmin" class="admin-indicator">管理员</span>
              <span v-else-if="mustChangePassword" class="admin-indicator warning">需改密</span>
            </div>
          </h1>
          <div class="header-actions">
            <div id="auth-buttons">
              <template v-if="mustChangePassword">
                <a href="/admin" class="btn btn-warning">立即改密码</a>
                <button @click="handleLogout" class="btn btn-logout">退出登录</button>
              </template>
              <template v-else-if="isAdmin">
                <a href="/admin" class="btn">管理后台</a>
                <button @click="handleLogout" class="btn btn-logout">退出登录</button>
              </template>
              <router-link v-else to="/login" class="btn">管理员登录</router-link>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="main-content">
      <div class="content-container-fluid">
        <IndexTopNav
          :dropdown-open="dropdownOpen"
          :selected-account-id="selectedAccountId"
          :selected-account-name="selectedAccountName"
          :active-accounts="activeAccounts"
          :breadcrumb-items="breadcrumbItems"
          :max-breadcrumb-items="maxBreadcrumbItems"
          :hidden-breadcrumb-items="hiddenBreadcrumbItems"
          :visible-last-items="visibleLastItems"
          :account-switch-mode="accountSwitchMode"
          @toggle-dropdown="toggleDropdown"
          @select-account="selectAccount"
          @navigate-to-path="navigateToPath"
        />

        <div
          v-if="floatingAccountSwitchEnabled"
          class="floating-account-switcher"
          aria-label="账号切换"
        >
          <button
            v-for="account in activeAccounts"
            :key="account.id"
            type="button"
            class="floating-account-btn"
            :class="{ active: String(selectedAccountId) === String(account.id), 'has-logo': !!account.driver_card_logo }"
            :style="{ '--driver-color': getFloatingAccountColor(account) }"
            @click="selectAccount(account)"
          >
            <img
              v-if="account.driver_card_logo"
              :src="account.driver_card_logo"
              class="floating-account-logo"
              :alt="account.driver_card_name || account.name"
            >
            <span v-else class="floating-account-icon">{{ getFloatingAccountText(account) }}</span>
            <span class="floating-account-tooltip">{{ account.name }}</span>
          </button>
        </div>

      <div class="main-frame">
        <FileToolbar
          :is-admin="isAdmin"
          :selected-files-count="selectedFiles.size"
          :view-mode="fileViewMode"
          :response-time="responseTime"
          :cache-rate="cacheRate"
          :upload-task-count="displayUploadTasks.length"
          :upload-task-active="activeUploadTasks.length > 0 || activeRelayCount > 0"
          :upload-task-failed="displayUploadTasks.some(task => task.status === 'failed') || failedRelayTasks.length > 0"
          :upload-task-success="displayUploadTasks.some(task => task.status === 'success')"
          :upload-task-title="uploadTaskTitle"
          :upload-task-label="uploadTaskLabel"
          @create-folder="startInlineCreateFolder"
          @upload-file="handleUploadFile"
          @upload-folder="handleUploadFolder"
          @refresh="handleRefreshClick"
          @batch-move="handleBatchMove"
          @batch-copy="batchCopy"
          @batch-delete="handleBatchDelete"
          @update:view-mode="handleViewModeChange"
          @open-upload-tasks="openUploadTaskPanel"
        />

        <FileTable
          :is-admin="isAdmin"
          :selected-account-id="selectedAccountId"
          :loading="loading"
          :files="files"
          :sorted-files="sortedFiles"
          :selected-files-count="selectedFiles.size"
          :selected-files-list="selectedFilesList"
          :sort-key="sortKey"
          :sort-order="sortOrder"
          :view-mode="fileViewMode"
          :rename-file-inline="renameFileInline"
          :create-folder-request="createFolderRequest"
          :create-folder-inline="createFolderInline"
          :delete-file-inline="deleteFileInline"
          :move-file-inline="moveFileInline"
          :copy-file-inline="copyFileInline"
          :deleting-ids="batchDeletingIds"
          :moving-ids="batchMovingIds"
          @update:selected-files-list="selectedFilesList = $event"
          @sort-by="sortBy"
          @set-sort="handleSetSort"
          @file-click="handleFileClick"
          @download-file="handleFileDownload"
          @rename-file="renameFile"
          @delete-file="deleteFile"
          @move-file="moveFile"
          @copy-file="copyFile"
          @generate-current-strm="generateCurrentDirectoryStrm"
        />

        <FilePreviewModal
          :visible="previewVisible"
          :files="previewFiles"
          :current-index="previewIndex"
          :account-id="selectedAccountId"
          @close="closeFilePreview"
          @previous="showPreviousPreview"
          @next="showNextPreview"
          @download="handleFileDownload"
        />
      </div>
      </div>
    </div>

    <div class="footer">
      <div class="content-container-fluid">
        <p>
          2026 LitePan. {{ appVersion }}
          <span class="collab-divider">×</span>
          <a
            class="footer-link"
            href="https://haoyongzhai.com/"
            target="_blank"
            rel="noopener noreferrer"
          >
            好用斋
          </a>
          联合发布
        </p>
      </div>
    </div>



    <div id="message-container"></div>

    <input
      ref="uploadFileInput"
      type="file"
      multiple
      style="display: none"
      @change="handleUploadFileChange"
    >

    <input
      ref="uploadFolderInput"
      type="file"
      webkitdirectory
      directory
      multiple
      style="display: none"
      @change="handleUploadFolderChange"
    >


    <TaskPanel
      v-if="uploadTaskPanelOpen"
      :upload-api="uploadApi"
      :relay="relay"
    />

    <div v-if="globalLoading" class="loading-overlay">
      <div class="loading-content">
        <div class="loading-spinner loading-large"></div>
        <div class="loading-text">加载中...</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useModal } from '../composables/useModal.js'
import { useIndexFileActions } from '../composables/useIndexFileActions.js'
import { useCrossRelayTasks } from '../composables/useCrossRelayTasks.js'
import { useUploadTasks } from '../composables/useUploadTasks.js'
import IndexTopNav from '../components/index/IndexTopNav.vue'
import FileToolbar from '../components/index/FileToolbar.vue'
import FileTable from '../components/index/FileTable.vue'
import FilePreviewModal from '../components/index/FilePreviewModal.vue'
import TaskPanel from '../components/index/TaskPanel.vue'
import { APP_VERSION } from '../constants/app'
import { canPreviewFile, getPreviewKind, getPreviewableFiles } from '../utils/fileTypes.js'
import { applyTheme } from '../utils/theme'

const { confirm, form, custom, closeModal } = useModal()
import axios from 'axios'

const appVersion = APP_VERSION
const route = useRoute()
const router = useRouter()

const accounts = ref([])
const selectedAccountId = ref(null)
const selectedAccountName = ref('')
const LAZY_FOLDER_SIZE_DRIVER = '115_open'
const dropdownOpen = ref(false)
const files = ref([])
const loading = ref(false)
const globalLoading = ref(false)
const operationLoading = ref(false)
const operationMessage = ref('正在处理文件操作...')
const uploadFileInput = ref(null)
const uploadFolderInput = ref(null)
const relay = useCrossRelayTasks()
const {
  activeRelayCount,
  fetchRelayTasks,
  openRelayMonitoring,
} = relay
const publicIndexEnabled = ref(true)
const accountSwitchMode = ref('dropdown')



const operationMessages = {
  create_folder: '正在创建文件夹...',
  delete_file: '正在删除文件...',
  delete_folder: '正在删除文件夹...',
  rename_file: '正在重命名文件...',
  rename_folder: '正在重命名文件夹...',
  move: '正在移动项目...',
  move_file: '正在移动文件...',
  move_folder: '正在移动文件夹...',
  batch_delete: '正在删除项目...',
  upload_file: '正在上传文件...',
  download_file: '正在准备下载...',
  copy_file: '正在复制文件...',
  copy_folder: '正在复制文件夹...'
}

const setOperationLoading = (isLoading, operationType = null, customMessage = null, itemName = null) => {
  operationLoading.value = isLoading
  if (isLoading) {
    if (customMessage) {
      operationMessage.value = customMessage
    } else if (operationType && operationMessages[operationType]) {
      let message = operationMessages[operationType]
      if (itemName) {
        message = message.replace('...', ` "${itemName}"...`)
      }
      operationMessage.value = message
    } else {
      operationMessage.value = '正在处理文件操作...'
    }
  }
}
const isAdmin = ref(false)
const mustChangePassword = ref(false)
const selectedFiles = ref(new Set())
const selectedFilesList = ref([])
const batchDeletingIds = ref([])
const batchMovingIds = ref([])
const createFolderRequest = ref(0)
const currentPath = ref('0')
const breadcrumbItems = ref([{ name: '根目录', path: '0' }])
const maxBreadcrumbItems = ref(4)
const sortKey = ref('name')
const sortOrder = ref('asc')
const fileViewMode = ref('list')
const responseTime = ref('-')
const cacheRate = ref('-')
const previewVisible = ref(false)
const previewFiles = ref([])
const previewIndex = ref(0)
const FILE_VIEW_MODE_STORAGE_KEY = 'litepan:index:file-view-mode'

const activeAccounts = computed(() => {
  return accounts.value.filter(account => account.is_active === 1 || account.is_active === true || account.enabled === 1 || account.enabled === true)
})

const firstActiveAccount = computed(() => {
  return activeAccounts.value[0] || null
})

const floatingAccountSwitchEnabled = computed(() => (
  accountSwitchMode.value === 'floating' && activeAccounts.value.length > 1
))

const selectedAccountDriverType = computed(() => {
  const account = accounts.value.find(item => String(item.id) === String(selectedAccountId.value))
  return String(account?.driver_type || '').trim().toLowerCase()
})

const currentDirectoryInitialPath = computed(() => {
  const segments = breadcrumbItems.value
    .slice(1)
    .map(item => String(item.name || '').trim())
    .filter(Boolean)
  return segments.join('/')
})

const usesLazyFolderSizes = () => selectedAccountDriverType.value === LAZY_FOLDER_SIZE_DRIVER

const mergeFolderSizeEntries = (fileList, entries) => {
  if (!entries || !Object.keys(entries).length) return fileList
  return fileList.map(file => {
    if (!file.is_dir) return file
    const entry = entries[String(file.id)]
    if (!entry) return file
    return {
      ...file,
      size: entry.size ?? file.size,
      modified: entry.modified ?? file.modified
    }
  })
}

const applyCachedFolderSizes = async (accountId, path) => {
  if (!usesLazyFolderSizes()) return
  const folderIds = (files.value || [])
    .filter(file => file.is_dir && (!Number(file.size) || Number(file.size) <= 0))
    .map(file => String(file.id))
  if (!folderIds.length) return

  try {
    const response = await axios.post('/api/files/folder-sizes', {
      account_id: accountId,
      parent_id: path,
      file_ids: folderIds,
      fetch_missing: false
    })
    if (String(selectedAccountId.value) !== String(accountId) || currentPath.value !== path) return
    if (!response.data?.success) return
    files.value = mergeFolderSizeEntries(files.value, response.data.data || {})
  } catch (error) {
    console.debug('读取已缓存文件夹大小失败:', error)
  }
}

const fetchFolderSizeOnEnter = async (accountId, parentId, folderId) => {
  if (!usesLazyFolderSizes() || !folderId) return
  try {
    await axios.post('/api/files/folder-sizes', {
      account_id: accountId,
      parent_id: parentId,
      file_ids: [String(folderId)],
      fetch_missing: true
    })
  } catch (error) {
    console.debug('获取文件夹大小失败:', error)
  }
}

const getCurrentBreadcrumbNameParts = () => (
  breadcrumbItems.value
    .map(item => String(item?.name || '').trim())
    .filter(Boolean)
    .slice(1)
)

const getCurrentDisplayPath = () => {
  const parts = getCurrentBreadcrumbNameParts()
  return parts.length ? `/${parts.join('/')}` : '/'
}


const naturalSort = (a, b) => {
  const splitA = String(a).match(/(\d+|\D+)/g) || []
  const splitB = String(b).match(/(\d+|\D+)/g) || []
  
  const maxLength = Math.max(splitA.length, splitB.length)
  
  for (let i = 0; i < maxLength; i++) {
    const partA = splitA[i] || ''
    const partB = splitB[i] || ''
    
    if (/^\d+$/.test(partA) && /^\d+$/.test(partB)) {
      const numA = parseInt(partA, 10)
      const numB = parseInt(partB, 10)
      if (numA !== numB) {
        return numA - numB
      }
    } else {
      const comparison = partA.toLowerCase().localeCompare(partB.toLowerCase(), 'zh-CN')
      if (comparison !== 0) {
        return comparison
      }
    }
  }
  
  return 0
}

const sortedFiles = computed(() => {
  const sorted = [...files.value].sort((a, b) => {
    if (a.is_dir && !b.is_dir) return -1
    if (!a.is_dir && b.is_dir) return 1
    
    let aVal = a[sortKey.value]
    let bVal = b[sortKey.value]
    
    if (sortKey.value === 'size') {
      aVal = a.size || 0
      bVal = b.size || 0
    } else if (sortKey.value === 'modified') {
      aVal = new Date(a.modified || 0)
      bVal = new Date(b.modified || 0)
    } else {
      if (sortKey.value === 'name') {
        const result = naturalSort(aVal || '', bVal || '')
        return sortOrder.value === 'asc' ? result : -result
      }
      aVal = String(aVal || '').toLowerCase()
      bVal = String(bVal || '').toLowerCase()
    }
    
    if (aVal < bVal) return sortOrder.value === 'asc' ? -1 : 1
    if (aVal > bVal) return sortOrder.value === 'asc' ? 1 : -1
    return 0
  })
  return sorted
})

watch(selectedFilesList, (newVal) => {
  selectedFiles.value = new Set(newVal)
}, { deep: true })

const toggleDropdown = () => {
  dropdownOpen.value = !dropdownOpen.value
}

const getFloatingAccountText = (account) => {
  const cardName = String(account?.driver_card_name || '').trim()
  if (cardName) {
    return cardName
  }
  const driverType = String(account?.driver_type || '').trim()
  return driverType ? driverType.slice(0, 2).toUpperCase() : '盘'
}

const getFloatingAccountColor = (account) => {
  return account?.driver_card_color || '#6366f1'
}

const getRootId = (config) => {
  const rootId = config.root_folder_id || '0'
  return rootId
}

const selectAccount = async (account) => {
  const previousAccountId = selectedAccountId.value
  const previousAccountName = selectedAccountName.value
  const previousPath = currentPath.value
  const previousBreadcrumb = [...breadcrumbItems.value]
  
  if (account) {
    selectedAccountId.value = account.id
    selectedAccountName.value = account.name
    
    const config = account.config || {}
    const rootId = getRootId(config)
    currentPath.value = rootId
    breadcrumbItems.value = [{ name: '根目录', path: rootId }]
  } else {
    selectedAccountId.value = null
    selectedAccountName.value = ''
    currentPath.value = '0'
    breadcrumbItems.value = [{ name: '根目录', path: '0' }]
  }
  dropdownOpen.value = false
  
  selectedFilesList.value = []
  
  if (selectedAccountId.value) {
    try {
      await loadFiles()
    } catch (error) {
      console.error('账号切换失败，开始回滚状态:', error)
      selectedAccountId.value = previousAccountId
      selectedAccountName.value = previousAccountName
      currentPath.value = previousPath
      breadcrumbItems.value = previousBreadcrumb
      window.appNotification.error('账号切换失败，请检查账号状态')
    }
  } else {
    files.value = []
  }
}

const loadAccounts = async () => {
  try {
    const response = await axios.get('/api/public/accounts')
    if (response.data.success) {
      accounts.value = response.data.data || []
      
      await nextTick()
      if (!selectedAccountId.value && firstActiveAccount.value) {
        selectAccount(firstActiveAccount.value)
      }
    }
  } catch (error) {
    console.error('获取账号列表失败:', error)
    window.appNotification.error('获取账号列表失败')
  }
}

const loadPublicSystemConfig = async () => {
  try {
    const response = await axios.get('/api/public/system-config')
    if (response.data?.success) {
      const mode = response.data.data?.index_account_switch_mode
      accountSwitchMode.value = ['dropdown', 'floating'].includes(mode) ? mode : 'dropdown'
      applyTheme(response.data.data?.theme)
    }
  } catch (error) {
    accountSwitchMode.value = 'dropdown'
  }
}

watch(accounts, (newAccounts) => {
  if (newAccounts.length > 0 && !selectedAccountId.value) {
    const defaultAccount = newAccounts.find(acc => acc.is_default && (acc.is_active === 1 || acc.is_active === true || acc.enabled === 1 || acc.enabled === true))
    if (defaultAccount) {
      selectAccount(defaultAccount)
    }
  }
}, { deep: true })

const loadFiles = async (forceRefresh = false) => {
  if (!selectedAccountId.value) return

  loading.value = true
  const startTime = Date.now()
  
  try {
    const params = {
      account_id: selectedAccountId.value,
      path: currentPath.value
    }
    
    if (forceRefresh) {
      params.force_refresh = true
    }
    
    const response = await axios.get('/api/files/list', { params })
    
    if (response.data.success) {
      files.value = response.data.data
      const endTime = Date.now()
      responseTime.value = `${endTime - startTime}ms`
      await applyCachedFolderSizes(selectedAccountId.value, currentPath.value)
      
      setTimeout(async () => {
        try {
          const hitRateResponse = await axios.get('/api/public/cache/hit-rate')
          if (hitRateResponse.data.success) {
            cacheRate.value = `${hitRateResponse.data.data.hit_rate}%`
          } else {
            cacheRate.value = '-'
          }
        } catch (hitRateError) {
          cacheRate.value = '-'
        }
      }, 0)
    } else {
      throw new Error(response.data.message || '获取文件列表失败')
    }
  } catch (error) {
    console.error('获取文件列表失败:', error)
    throw error
  } finally {
    loading.value = false
  }
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const refreshAfterCreateFolder = async (folderName) => {
  const normalizedFolderName = folderName.trim().toLowerCase()

  await loadFiles(true)

  const folderExists = files.value.some(file =>
    file.is_dir && file.name.trim().toLowerCase() === normalizedFolderName
  )

  if (!folderExists) {
    await wait(800)
    await loadFiles(true)
  }
}

const refreshFiles = async (silent = false) => {
  if (!selectedAccountId.value) {
    if (!silent) {
      window.appNotification.warning('请先选择一个账号')
    }
    return
  }
  
  const refreshAccountId = selectedAccountId.value
  const refreshPath = currentPath.value

  try {
    if (!silent) {
      operationLoading.value = true
      operationMessage.value = '正在强制刷新...'
    }
    
    const response = await axios.post('/api/files/refresh', {
      account_id: selectedAccountId.value,
      parent_id: currentPath.value
    })
    
    if (response.data.success) {
      files.value = response.data.data
      await applyCachedFolderSizes(refreshAccountId, refreshPath)
      if (!silent) {
        window.appNotification.success(response.data.message || '刷新成功')
      }
    } else {
      if (!silent) {
        window.appNotification.error(response.data.message || '刷新失败')
      }
      console.error('刷新失败:', response.data.message)
    }
  } catch (error) {
    console.error('刷新异常:', error)
    if (!silent) {
      window.appNotification.error('刷新失败: ' + (error.response?.data?.message || error.message))
    }
  } finally {
    if (!silent) {
      operationLoading.value = false
      operationMessage.value = ''
    }
  }
}

const handleRefreshClick = async () => {
  await refreshFiles()
}

const generateCurrentDirectoryStrm = async () => {
  if (!selectedAccountId.value) {
    window.appNotification.warning('请先选择一个账号')
    return
  }

  operationLoading.value = true
  operationMessage.value = '正在生成当前目录 STRM...'
  try {
    await loadFiles(true)
    const response = await axios.post('/api/admin/strm/generate-current-directory', {
      account_id: selectedAccountId.value,
      path: getCurrentDisplayPath(),
      items: files.value || []
    })

    if (!response.data?.success) {
      window.appNotification.error(response.data?.message || '当前目录 STRM 生成失败')
      return
    }

    const result = response.data.data || {}
    if ((result.media_count || 0) <= 0 && (result.deleted || 0) <= 0) {
      window.appNotification.info('当前目录没有需要同步的 STRM')
      return
    }
    const conflictText = (result.skipped_conflict || 0) > 0 ? `，冲突跳过 ${result.skipped_conflict}` : ''
    window.appNotification.success(
      `STRM同步完成：新增 ${result.created || 0}，更新 ${result.updated || 0}，删除 ${result.deleted || 0}，已存在 ${result.skipped_existing || 0}${conflictText}`
    )
  } catch (error) {
    console.error('当前目录 STRM 生成失败:', error)
    window.appNotification.error('当前目录 STRM 生成失败: ' + (error.response?.data?.message || error.message))
  } finally {
    operationLoading.value = false
    operationMessage.value = ''
  }
}


const uploadApi = useUploadTasks({
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
})

const {
  uploadTaskPanelOpen,
  displayUploadTasks,
  activeUploadTasks,
  failedRelayTasks,
  uploadTaskTitle,
  uploadTaskLabel,
  openUploadTaskPanel,
  fetchUploadTasks,
  startUploadTaskPolling,
  handleUploadFile,
  handleUploadFolder,
  handleUploadFileChange,
  handleUploadFolderChange,
  cleanupUploadTasks,
} = uploadApi

const handleFileClick = (file) => {
  if (file.is_dir) {
    navigateToFolder(file)
  } else {
    if (!isAdmin.value) {
      return
    }

    if (canPreviewFile(file)) {
      openFilePreview(file)
      return
    }

    showFileActionModal(file)
  }
}

const openFilePreview = file => {
  const previewKind = getPreviewKind(file)
  const relatedFiles = getPreviewableFiles(sortedFiles.value, [previewKind])
  if (relatedFiles.length === 0) return

  const index = relatedFiles.findIndex(item => String(item.id || item.name) === String(file.id || file.name))
  previewFiles.value = relatedFiles
  previewIndex.value = index >= 0 ? index : 0
  previewVisible.value = true
}

const closeFilePreview = () => {
  previewVisible.value = false
}

const showPreviousPreview = () => {
  if (previewFiles.value.length <= 1) return
  previewIndex.value = (previewIndex.value - 1 + previewFiles.value.length) % previewFiles.value.length
}

const showNextPreview = () => {
  if (previewFiles.value.length <= 1) return
  previewIndex.value = (previewIndex.value + 1) % previewFiles.value.length
}


let folderNavigateTimer = null
const navigateToFolder = (folder) => {
  if (loading.value) {
    return
  }
  
  if (folder.id === currentPath.value) {
    return
  }
  
  const existingIndex = breadcrumbItems.value.findIndex(item => item.path === folder.id)
  if (existingIndex !== -1) {
    navigateToPath(folder.id)
    return
  }
  
  if (folderNavigateTimer) {
    clearTimeout(folderNavigateTimer)
  }
  
  folderNavigateTimer = setTimeout(async () => {
    if (loading.value) {
      return
    }

    const previousPath = currentPath.value
    const previousBreadcrumb = [...breadcrumbItems.value]
    const previousSelectedFiles = [...selectedFilesList.value]

    void fetchFolderSizeOnEnter(selectedAccountId.value, previousPath, folder.id)

    currentPath.value = folder.id

    breadcrumbItems.value.push({
      name: folder.name,
      path: folder.id
    })

    updateBreadcrumbLayoutSync()

    selectedFilesList.value = []

    try {
      await loadFiles()
    } catch (error) {
      currentPath.value = previousPath
      breadcrumbItems.value = previousBreadcrumb
      selectedFilesList.value = previousSelectedFiles
      updateBreadcrumbLayoutSync()
      window.appNotification.error(error?.message || '目录打开失败，路径已恢复')
    }
  }, 50)
}

let navigateTimer = null
const navigateToPath = (path) => {
  if (loading.value) {
    return
  }
  
  if (path === currentPath.value) return

  if (navigateTimer) {
    clearTimeout(navigateTimer)
  }

  navigateTimer = setTimeout(async () => {
    if (loading.value) {
      return
    }

    const previousPath = currentPath.value
    const previousBreadcrumb = [...breadcrumbItems.value]
    const previousSelectedFiles = [...selectedFilesList.value]

    currentPath.value = path

    const targetIndex = breadcrumbItems.value.findIndex(item => item.path === path)
    if (targetIndex !== -1) {
      const newLength = targetIndex + 1
      if (breadcrumbItems.value.length > newLength) {
        breadcrumbItems.value.splice(newLength)
      }
    } else {
      console.warn('面包屑中未找到目标路径:', path)
    }

    updateBreadcrumbLayoutSync()

    selectedFilesList.value = []

    try {
      await loadFiles()
    } catch (error) {
      currentPath.value = previousPath
      breadcrumbItems.value = previousBreadcrumb
      selectedFilesList.value = previousSelectedFiles
      updateBreadcrumbLayoutSync()
      window.appNotification.error(error?.message || '目录打开失败，路径已恢复')
    }
  }, 50)
}

const hiddenBreadcrumbItems = computed(() => {
  if (breadcrumbItems.value.length <= maxBreadcrumbItems.value) {
    return []
  }

  const lastItemsCount = maxBreadcrumbItems.value - 2

  return breadcrumbItems.value.slice(1, breadcrumbItems.value.length - lastItemsCount)
})

const visibleLastItems = computed(() => {
  if (breadcrumbItems.value.length <= maxBreadcrumbItems.value) {
    return []
  }

  const lastItemsCount = maxBreadcrumbItems.value - 2

  return breadcrumbItems.value.slice(-lastItemsCount)
})

const updateBreadcrumbLayoutSync = () => {
  const screenWidth = window.innerWidth
  const itemCount = breadcrumbItems.value.length

  let startCollapseThreshold
  if (screenWidth >= 1400) {
    startCollapseThreshold = 7
  } else if (screenWidth >= 1200) {
    startCollapseThreshold = 6
  } else if (screenWidth >= 1000) {
    startCollapseThreshold = 5
  } else if (screenWidth >= 800) {
    startCollapseThreshold = 4
  } else {
    startCollapseThreshold = 3
  }

  if (itemCount <= startCollapseThreshold) {
    maxBreadcrumbItems.value = itemCount
  } else {
    maxBreadcrumbItems.value = startCollapseThreshold + 1
  }
}

let updateBreadcrumbLayoutTimer = null
const updateBreadcrumbLayout = () => {
  if (updateBreadcrumbLayoutTimer) {
    clearTimeout(updateBreadcrumbLayoutTimer)
  }

  updateBreadcrumbLayoutTimer = setTimeout(() => {
    updateBreadcrumbLayoutSync()
  }, 50)
}

const sortBy = (key, order = null) => {
  if (order === 'asc' || order === 'desc') {
    sortKey.value = key
    sortOrder.value = order
    return
  }

  if (sortKey.value === key) {
    sortOrder.value = sortOrder.value === 'asc' ? 'desc' : 'asc'
  } else {
    sortKey.value = key
    sortOrder.value = 'asc'
  }
}

const handleSetSort = ({ key, order }) => {
  sortBy(key, order)
}

const {
  createFolder,
  showFileActionModal,
  handleFileDownload,
  renameFile,
  deleteFile,
  moveFile,
  batchMove,
  batchDelete,
  copyFile,
  batchCopy
} = useIndexFileActions({
  accounts,
  files,
  selectedAccountId,
  selectedFilesList,
  currentPath,
  currentDirectoryInitialPath,
  operationLoading,
  setOperationLoading,
  loadFiles,
  refreshFiles,
  refreshAfterCreateFolder,
  naturalSort,
  confirm,
  form,
  custom,
  closeModal
})

const renameFileInline = (file, newName) => renameFile(file, newName, {
  showGlobalLoading: false,
  refresh: loadFiles
})

const createFolderInline = folderName => createFolder(folderName, {
  showGlobalLoading: false,
  refresh: refreshAfterCreateFolder
})

const deleteFileInline = (file, callbacks = {}) => deleteFile(file, {
  showGlobalLoading: false,
  refresh: loadFiles,
  ...callbacks
})

const handleBatchDelete = () => batchDelete({
  showGlobalLoading: false,
  onRequestStart: () => { batchDeletingIds.value = [...selectedFilesList.value] },
  onRequestEnd: () => { batchDeletingIds.value = [] }
})

const handleBatchMove = () => batchMove({
  showGlobalLoading: false,
  onRequestStart: () => { batchMovingIds.value = [...selectedFilesList.value] },
  onRequestEnd: () => { batchMovingIds.value = [] }
})

const moveFileInline = (file, callbacks = {}) => moveFile(file, {
  showGlobalLoading: false,
  ...callbacks
})

const copyFileInline = (file, callbacks = {}) => copyFile(file, {
  showGlobalLoading: false,
  ...callbacks
})

const startInlineCreateFolder = () => {
  if (!selectedAccountId.value) {
    window.appNotification.warning('请先选择一个账号')
    return
  }
  createFolderRequest.value += 1
}

const handleLogout = async () => {
  try {
    const response = await axios.post('/api/auth/logout')
    if (response.data.success) {
      window.appNotification.success('退出登录成功')
      isAdmin.value = false
      mustChangePassword.value = false
      document.body.classList.remove('admin-mode')
      checkAuthStatus()
    } else {
      window.appNotification.error('退出登录失败')
    }
  } catch (error) {
    console.error('退出登录错误:', error)
    window.appNotification.error('退出登录失败')
  }
}

const checkAuthStatus = async () => {
  try {
    const response = await axios.get('/api/auth/status')
    if (response.data.success) {
      const authData = response.data.data || {}
      publicIndexEnabled.value = authData.public_index_enabled !== false
      mustChangePassword.value = Boolean(authData.must_change_password)
      isAdmin.value = Boolean(authData.is_admin) && !mustChangePassword.value
      
      if (isAdmin.value) {
        document.body.classList.add('admin-mode')
      } else {
        document.body.classList.remove('admin-mode')
      }

      if (mustChangePassword.value) {
        window.appNotification.warning('检测到管理员密码仍需升级，请先进入后台修改密码')
      }

      if (!publicIndexEnabled.value && !Boolean(authData.is_admin)) {
        router.replace('/login')
        return false
      }
    }
  } catch (error) {
    console.error('获取认证状态失败:', error)
    isAdmin.value = false
    mustChangePassword.value = false
    publicIndexEnabled.value = true
    document.body.classList.remove('admin-mode')
  }
  return true
}

const handleClickOutside = (event) => {
  if (!event.target.closest('.custom-select')) {
    dropdownOpen.value = false
  }
}

const restoreFileViewMode = () => {
  try {
    const savedViewMode = localStorage.getItem(FILE_VIEW_MODE_STORAGE_KEY)
    fileViewMode.value = ['list', 'grid'].includes(savedViewMode) ? savedViewMode : 'list'
  } catch {
    fileViewMode.value = 'list'
  }
}

const handleViewModeChange = (nextMode) => {
  if (!['list', 'grid'].includes(nextMode) || fileViewMode.value === nextMode) {
    return
  }

  fileViewMode.value = nextMode
  try {
    localStorage.setItem(FILE_VIEW_MODE_STORAGE_KEY, nextMode)
  } catch {
  }
}

watch(breadcrumbItems, () => {
  updateBreadcrumbLayout()
}, { deep: true })

const initializePage = async () => {
  const allowPublicAccess = await checkAuthStatus()
  if (!allowPublicAccess) {
    return
  }
  await loadPublicSystemConfig()
  await loadAccounts()
  await fetchUploadTasks()
  if (activeUploadTasks.value.length > 0) {
    startUploadTaskPolling()
  }
  await fetchRelayTasks()
  if (activeRelayCount.value > 0) {
    await openRelayMonitoring({ value: false })
  }
}

onMounted(() => {
  restoreFileViewMode()
  initializePage().then(() => {
    if (route.query.taskPanel === 'relay') {
      openUploadTaskPanel('relay')
      const nextQuery = { ...route.query }
      delete nextQuery.taskPanel
      router.replace({ path: route.path, query: nextQuery })
    }
  })
  document.addEventListener('click', handleClickOutside)

  nextTick(() => {
    updateBreadcrumbLayout()
  })

  window.addEventListener('resize', updateBreadcrumbLayout)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateBreadcrumbLayout)
  document.removeEventListener('click', handleClickOutside)
  
  if (navigateTimer) {
    clearTimeout(navigateTimer)
  }
  if (folderNavigateTimer) {
    clearTimeout(folderNavigateTimer)
  }
  cleanupUploadTasks()
})
</script>

<style scoped>

.index-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.admin-only {
  display: none;
}

.floating-account-switcher {
  position: fixed;
  left: 14px;
  top: 170px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  gap: 11px;
}

.floating-account-btn {
  position: relative;
  width: 38px;
  height: 38px;
  border: 0;
  border-radius: 10px;
  background: #fff;
  color: var(--driver-color, #6366f1);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  box-shadow: 0 6px 16px rgba(15, 23, 42, 0.10);
  transition: all 0.18s ease;
}

.floating-account-btn:hover {
  transform: translateX(2px) scale(1.03);
  box-shadow:
    0 0 0 2px color-mix(in srgb, var(--driver-color, #6366f1) 28%, transparent),
    0 10px 22px rgba(15, 23, 42, 0.16);
}

.floating-account-btn.active {
  border-color: transparent;
  background: var(--driver-color, #6366f1);
  color: #fff;
  transform: scale(1.06);
  box-shadow:
    0 0 0 2px #fff,
    0 0 0 5px color-mix(in srgb, var(--driver-color, #6366f1) 35%, transparent),
    0 10px 24px color-mix(in srgb, var(--driver-color, #6366f1) 36%, transparent);
}

.floating-account-icon {
  max-width: 30px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 700;
  line-height: 1;
}

.floating-account-logo {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
  border-radius: 10px;
  background: #fff;
}

.floating-account-btn.has-logo {
  padding: 0;
  background: #fff;
  border: 0;
  overflow: visible;
}

.floating-account-btn.has-logo:hover .floating-account-logo {
  box-shadow: none;
}

.floating-account-btn.has-logo.active .floating-account-logo {
  box-shadow: none;
}

.floating-account-tooltip {
  position: absolute;
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(-4px);
  max-width: 180px;
  padding: 7px 10px;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: all 0.18s ease;
}

.floating-account-tooltip::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 5px solid transparent;
  border-right-color: #111827;
}

.floating-account-btn:hover .floating-account-tooltip {
  opacity: 1;
  visibility: visible;
  transform: translateY(-50%) translateX(0);
}

@media (max-width: 768px) {
  .floating-account-switcher {
    left: 50%;
    top: auto;
    bottom: calc(74px + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    flex-direction: row;
    align-items: center;
    gap: 8px;
    padding: 8px;
    max-width: calc(100vw - 32px);
    overflow-x: auto;
    border: 1px solid rgba(226, 232, 240, 0.86);
    border-radius: 18px;
    background: rgba(255, 255, 255, 0.92);
    box-shadow: 0 10px 28px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(10px);
  }

  .floating-account-btn {
    flex: 0 0 38px;
  }

  .floating-account-btn.active {
    transform: none;
  }

  .floating-account-btn:hover {
    transform: none;
  }

  .floating-account-tooltip {
    display: none;
  }
}

:global(body.admin-mode) .admin-only {
  display: table-cell !important;
}

:global(body.admin-mode) .admin-only.btn {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

:global(body.admin-mode) .admin-only.batch-actions {
  display: flex !important;
}

.loading {
  text-align: center;
  color: #666;
  font-style: italic;
  padding: 20px;
}

.file-name {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.file-icon {
  margin-right: 8px;
  font-size: 16px;
}

.action-buttons {
  display: flex;
  gap: 4px;
}

.action-btn {
  border: none;
  background: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  font-size: 14px;
}

.action-btn:hover {
  background-color: #f0f0f0;
}






.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
}

.loading-content {
  background: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 10px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

:global(.loading-center) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 40px 20px !important;
  text-align: center !important;
}

:global(.loading-center .loading-spinner) {
  width: 32px !important;
  height: 32px !important;
  border: 3px solid #f3f3f3 !important;
  border-top: 3px solid #3498db !important;
  border-radius: 50% !important;
  animation: spin 1s linear infinite !important;
  margin-bottom: 15px !important;
}

:global(.loading-center .loading-text) {
  color: #666 !important;
  font-size: 14px !important;
  font-weight: normal !important;
}

:global(.error-message) {
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 40px 20px !important;
  text-align: center !important;
  color: #dc3545 !important;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

:global(.breadcrumb-ellipsis-dropdown) {
  position: relative !important;
  display: inline-block !important;
  z-index: 6 !important;
}

:global(.breadcrumb-ellipsis) {
  color: #666 !important;
  cursor: pointer !important;
  padding: 4px 8px !important;
  border-radius: 4px !important;
  transition: all 0.2s !important;
  user-select: none !important;
}

:global(.breadcrumb-ellipsis:hover) {
  background-color: #f0f0f0 !important;
  color: #007bff !important;
}

:global(.breadcrumb-dropdown) {
  position: absolute !important;
  top: 100% !important;
  left: 50% !important;
  transform: translateX(-50%) translateY(-5px) !important;
  background: white !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05) !important;
  z-index: 10020 !important;
  min-width: 120px !important;
  opacity: 0 !important;
  visibility: hidden !important;
  transition: all 0.2s ease !important;
  padding: 4px 0 !important;
}

:global(.breadcrumb-ellipsis-dropdown:hover .breadcrumb-dropdown) {
  opacity: 1 !important;
  visibility: visible !important;
  transform: translateX(-50%) translateY(0) !important;
}

:global(.breadcrumb-dropdown-item) {
  display: block !important;
  max-width: min(240px, 28vw) !important;
  padding: 8px 16px !important;
  cursor: pointer !important;
  transition: all 0.15s ease !important;
  font-size: 14px !important;
  color: #374151 !important;
  margin: 2px 4px !important;
  border-radius: 6px !important;
  overflow: hidden !important;
}

:global(.breadcrumb-dropdown-item:hover) {
  background-color: #f3f4f6 !important;
  color: #111827 !important;
}

:global(.breadcrumb-dropdown-item-label) {
  display: block !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}

:global(*::-webkit-scrollbar) {
  width: 6px !important;
  height: 6px !important;
}

:global(*::-webkit-scrollbar-track) {
  background: transparent !important;
}

:global(*::-webkit-scrollbar-thumb) {
  background: rgba(0, 0, 0, 0.2) !important;
  border-radius: 3px !important;
  transition: all 0.2s ease !important;
}

:global(*::-webkit-scrollbar-thumb:hover) {
  background: rgba(0, 0, 0, 0.4) !important;
}

:global(*::-webkit-scrollbar-corner) {
  background: transparent !important;
}

.file-list::-webkit-scrollbar {
  width: 6px !important;
}

.file-list::-webkit-scrollbar-thumb {
  background: rgba(0, 0, 0, 0.2) !important;
  border-radius: 3px !important;
}

:global(.file-action-modal) {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px 0;
}

:global(.file-action-modal-btn) {
  width: 100%;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 10px 14px;
  background: #fff;
  color: #1e293b;
  cursor: pointer;
  font-size: 14px;
}

:global(.file-action-modal-btn.primary) {
  background: linear-gradient(135deg, #4c74df 0%, #02a6f0 100%);
  border-color: transparent;
  color: #fff;
}

:global(.file-action-modal-btn.secondary) {
  background: #f8fafc;
}

:global(.file-action-modal-btn.danger) {
  color: #dc2626;
}

:global(.move-dialog-panel) {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

:global(.move-breadcrumb) {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

:global(.move-breadcrumb-btn) {
  border: none;
  background: transparent;
  color: #2563eb;
  cursor: pointer;
  padding: 0;
}

:global(.move-breadcrumb-sep) {
  color: #94a3b8;
}

:global(.move-current-path) {
  color: #475569;
  font-size: 13px;
}

:global(.move-create-row) {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

:global(.move-create-input) {
  flex: 1;
  min-width: 180px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  padding: 10px 12px;
}

:global(.move-inline-btn),
:global(.move-footer-btn) {
  border: none;
  border-radius: 10px;
  padding: 10px 14px;
  cursor: pointer;
}

:global(.move-inline-btn) {
  background: #eff6ff;
  color: #2563eb;
}

:global(.move-inline-btn.secondary),
:global(.move-footer-btn.secondary) {
  background: #f8fafc;
  color: #334155;
}

:global(.move-footer-btn.primary) {
  background: linear-gradient(135deg, #4c74df 0%, #02a6f0 100%);
  color: #fff;
}

:global(.move-folder-list) {
  max-height: 320px;
  overflow: auto;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 10px;
}

:global(.move-folder-row) {
  margin-bottom: 8px;
}

:global(.move-folder-row:last-child) {
  margin-bottom: 0;
}

:global(.move-folder-enter) {
  width: 100%;
  text-align: left;
  border: none;
  background: #fff;
  border-radius: 10px;
  padding: 10px 12px;
  cursor: pointer;
}

:global(.move-folder-enter:hover) {
  background: #f8fafc;
}

:global(.move-empty) {
  padding: 30px 12px;
  text-align: center;
  color: #94a3b8;
}

:global(.move-footer) {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}


.admin-indicator {
  background: #10b981;
  color: white;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.5px;
  position: absolute;
  top: 2px;
  right: -4px;
  display: inline-block;
  line-height: 1.2;
  text-transform: uppercase;
  opacity: 0.9;
  transition: opacity 0.2s ease;
  z-index: 10;
}

.admin-indicator:hover {
  opacity: 1;
}

.admin-indicator.warning {
  background: #f59e0b;
}

.btn-logout {
  background: #ef4444 !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(239, 68, 68, 0.3) !important;
  appearance: none;
  font-family: inherit;
}

.btn-warning {
  background: #f59e0b !important;
  color: #fff !important;
  box-shadow: 0 2px 8px rgba(245, 158, 11, 0.3) !important;
}

#auth-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

#auth-buttons .btn {
  min-height: 40px;
  line-height: 1;
}


</style> 
