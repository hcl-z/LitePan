<template>
  <div class="cross-transfer">
    <div class="flow-grid">
      <div
        v-for="r in routes"
        :key="r.id"
        class="flow-card"
        :class="{ active: activeId === r.id }"
        @click="selectRoute(r)"
      >
        <div class="fc-body">
          <div class="fc-slot">
            <div class="fc-link">
              <span class="fc-logo"><img :src="r.from.logo" :alt="r.from.name" @error="hideImg"></span>
              <div class="fc-pulse-track">
                <span v-if="r.bidirectional" class="fc-tri fc-tri-both">
                  <i class="fas fa-arrows-rotate"></i>
                </span>
                <span v-else class="fc-tri">
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-chevron-right"></i>
                  <i class="fas fa-chevron-right"></i>
                </span>
              </div>
              <span class="fc-logo"><img :src="r.to.logo" :alt="r.to.name" @error="hideImg"></span>
            </div>
          </div>
          <div class="fc-meta">
            <span class="fc-pill" :class="{ md5: r.method === 'md5' }">
              <i class="fas fa-fingerprint"></i>
              <span>{{ r.method_label }}</span>
              <span v-if="r.bidirectional" class="biflag">双向</span>
            </span>
          </div>
        </div>
      </div>

      <div class="flow-card disabled" @click="notify('warning', '更多组合规划中')">
        <div class="fc-body">
          <div class="fc-slot">
            <div class="fc-link">
              <span class="fc-logo placeholder"><i class="fas fa-ellipsis"></i></span>
              <div class="fc-pulse-track">
                <span class="fc-tri fc-tri-plain"><i class="fas fa-plus"></i></span>
              </div>
              <span class="fc-logo placeholder"><i class="fas fa-cloud"></i></span>
            </div>
          </div>
          <div class="fc-meta">
            <span class="fc-pill muted">
              <span class="fc-pill-left">
                <i class="fas fa-screwdriver-wrench"></i>
                <span>更多组合</span>
              </span>
              <span class="fc-soon">规划中</span>
            </span>
          </div>
        </div>
      </div>
    </div>

    <div class="transfer-shell">
      <div class="transfer-topbar">
        <div class="tb-side tb-src">
          <span class="logo-chip s26"><img v-if="srcPan.logo" :src="srcPan.logo" :alt="srcPan.name" @error="hideImg"></span>
          <div class="tb-title">
            <span>{{ srcPan.name || '源网盘' }}</span>
            <small>读取文件指纹</small>
          </div>
          <span class="panel-role">源</span>
        </div>
        <div class="tb-mid">
          <button
            v-if="routeBidirectional"
            type="button"
            class="tb-swap"
            title="交换源与目标"
            @click="swap"
          >
            <i class="fas fa-right-left"></i>
          </button>
          <span v-else class="tb-flow" title="单向线路，不可交换">
            <i class="fas fa-arrow-right-long"></i>
          </span>
          <span v-if="routeBidirectional" class="tb-swap-hint">可交换</span>
        </div>
        <div class="tb-side tb-dst">
          <span class="panel-role dst-role">目标</span>
          <div class="tb-title tb-title-dst">
            <span>{{ dstPan.name || '目标网盘' }}</span>
            <small>秒传命中后转存</small>
          </div>
          <span class="logo-chip s26"><img v-if="dstPan.logo" :src="dstPan.logo" :alt="dstPan.name" @error="hideImg"></span>
        </div>
      </div>

      <div class="transfer-body">
      <div class="panel src">
        <div class="panel-pick">
          <button class="combo" @click="openPicker('src')">
            <span class="c-ic"><i class="fas fa-hdd"></i></span>
            <span class="c-text" :class="{ placeholder: !src }">{{ src ? (src.accName + ' · ' + src.path) : '选择账号 · 目录' }}</span>
            <span class="c-caret"><i class="fas fa-chevron-down"></i></span>
          </button>
        </div>
        <div class="tree tree-host" ref="srcTreeRef">
          <div v-if="scanSummary && !phaseStatus" class="tree-scan-banner" :class="{ warn: scanSummary.warn }">
            <i class="fas" :class="scanSummary.warn ? 'fa-triangle-exclamation' : 'fa-circle-check'"></i>
            <span>{{ scanSummary.text }}</span>
          </div>
          <CrossTransferTree v-if="srcTree && srcTree.length" :nodes="srcTree" mode="src" :depth="0" />
          <div v-else-if="!phaseStatus" class="tree-empty">选择源目录并试探后显示文件结构</div>
          <div v-if="phaseStatus && (!srcTree || !srcTree.length)" class="tree-phase-fill">
            <div class="tree-phase-card">
              <i class="fas fa-spinner fa-spin tree-phase-spin"></i>
              <p class="tree-phase-title">{{ phaseStatus }}</p>
              <p v-if="isScanPhase" class="tree-phase-sub">{{ isBaiduMd5Route ? '扫描仅列目录，指纹在试探阶段从下载响应头获取' : '子目录较多时需等待片刻，请勿关闭页面' }}</p>
              <div v-if="isScanPhase" class="tree-phase-bar"><div class="tree-phase-bar-indeterminate"></div></div>
            </div>
          </div>
        </div>
      </div>

      <div class="panel dst">
        <div class="panel-pick">
          <button class="combo" @click="openPicker('dst')">
            <span class="c-ic"><i class="fas fa-hdd"></i></span>
            <span class="c-text" :class="{ placeholder: !dst }">{{ dst ? (dst.accName + ' · ' + dst.path) : '选择账号 · 目录' }}</span>
            <span class="c-caret"><i class="fas fa-chevron-down"></i></span>
          </button>
        </div>
        <div class="tree">
          <div v-if="!dstTree || !dstTree.length" class="tree-empty">秒传完成后显示已转存文件</div>
          <CrossTransferTree v-else :nodes="dstTree" mode="dst" :depth="0" />
        </div>
      </div>
      </div>
    </div>

    <div class="ct-footer">
      <div class="ct-footer-bar">
        <div class="ct-footer-left">
          <div class="ft-stats">
            <span class="ft-item"><span class="n">{{ metrics.total }}</span><span class="l">扫描</span></span>
            <span class="ft-sep" aria-hidden="true"></span>
            <span class="ft-item"><span class="n ok">{{ metrics.ok }}</span><span class="l">可秒传</span></span>
            <span class="ft-sep" aria-hidden="true"></span>
            <span class="ft-item"><span class="n no">{{ metrics.no }}</span><span class="l">不可</span></span>
            <span class="ft-sep" aria-hidden="true"></span>
            <span class="ft-item"><span class="n">{{ metrics.done }}</span><span class="l">已转存</span></span>
            <template v-if="relayNotice">
              <span class="ft-sep" aria-hidden="true"></span>
              <span class="ft-item"><span class="n relay">{{ relayNotice.relayQueued }}</span><span class="l">兜底排队</span></span>
            </template>
          </div>
        </div>

        <div class="ct-footer-center">
          <div v-if="showProgressBar" class="ft-center-progress">
            <p v-if="running === 'probe'" class="ft-prog-hint">使用临时目录探测，结束后自动清理</p>
            <div class="ft-prog-row">
              <div class="ft-track"><i :style="{ width: barWidth + '%' }"></i></div>
              <span class="ft-pct">{{ barWidth }}%</span>
            </div>
          </div>
          <div
            v-else-if="showFooterScrollTips"
            class="ct-footer-scroll-hint"
            :class="{ 'is-clickable': currentFooterTip.action === 'probe-notice' }"
            @click="onFooterTipClick"
          >
            <transition name="ct-tip-fade" mode="out-in">
              <span :key="footerTipIndex" class="ct-footer-scroll-text">
                <i class="fas fa-circle-info"></i>
                {{ currentFooterTip.text }}
              </span>
            </transition>
          </div>
          <a
            v-else-if="relayNotice"
            class="ct-relay-inline-hint"
            :href="relayTasksHref"
            target="_blank"
            rel="noopener"
          >
            <i class="fas fa-circle-info"></i>
            <span>点击查看兜底传输跨盘任务进度</span>
            <i class="fas fa-arrow-up-right-from-square ct-relay-inline-arrow"></i>
          </a>
        </div>

        <div class="footer-island">
          <div ref="settingsMenuRef" class="ct-settings-menu">
            <button
              ref="settingsTriggerRef"
              type="button"
              class="ct-settings-trigger"
              title="传输设置"
              @click="toggleSettingsMenu"
            >
              <i class="fas fa-sliders"></i>
            </button>
            <Teleport to="body">
              <div
                v-if="settingsOpen"
                ref="settingsDropdownRef"
                class="ct-settings-dropdown ct-settings-dropdown-portal"
                :style="settingsDropdownStyle"
              >
                <div class="ct-settings-panel">
                  <div class="ct-settings-block">
                    <div class="ct-settings-label">冲突策略</div>
                    <div class="ct-settings-seg" role="group" aria-label="冲突策略">
                      <button
                        type="button"
                        class="ct-settings-opt"
                        :class="{ active: effectiveConflict === 'rename' }"
                        :disabled="targetRenameUnsupported"
                        :title="targetRenameUnsupported ? `${dstName}不支持自动重命名` : ''"
                        @click="targetRenameUnsupported ? null : (conflict = 'rename')"
                      >自动重命名</button>
                      <button
                        type="button"
                        class="ct-settings-opt"
                        :class="{ active: effectiveConflict === 'overwrite' }"
                        :disabled="targetOverwriteUnsupported"
                        :title="targetOverwriteUnsupported ? `${dstName}不支持覆盖` : ''"
                        @click="targetOverwriteUnsupported ? null : (conflict = 'overwrite')"
                      >覆盖</button>
                    </div>
                    <p v-if="targetOverwriteUnsupported" class="ct-settings-fallback-hint">
                      {{ dstName }}不支持覆盖，同名文件将自动重命名。
                    </p>
                    <p v-else-if="targetRenameUnsupported" class="ct-settings-fallback-hint">
                      {{ dstName }}不支持自动重命名，同名文件将被覆盖。
                    </p>
                  </div>
                  <div class="ct-settings-block">
                    <div class="ct-settings-label">兜底传输</div>
                    <div class="ct-settings-seg" role="group" aria-label="兜底传输">
                      <button
                        type="button"
                        class="ct-settings-opt"
                        :class="{ active: fallback === 'off' }"
                        @click="fallback = 'off'"
                      >关闭</button>
                      <button
                        type="button"
                        class="ct-settings-opt"
                        :class="{ active: fallback === 'on' }"
                        @click="fallback = 'on'"
                      >开启</button>
                    </div>
                    <p v-if="fallback === 'on'" class="ct-settings-fallback-hint">
                      开启兜底后，未命中文件由服务器从源盘下载后上传到目标盘。
                    </p>
                  </div>
                </div>
              </div>
            </Teleport>
          </div>
          <button
            class="ct-btn"
            :class="running === 'probe' ? 'ct-btn-danger' : 'ct-btn-primary'"
            :disabled="running === 'probe' ? false : !canProbe"
            @click="running === 'probe' ? stopRun() : probe()"
          >
            <i :class="running === 'probe' ? 'fas fa-stop' : 'fas fa-magnifying-glass'"></i>
            {{ running === 'probe' ? '停止试探' : '试探秒传' }}
          </button>
          <button
            class="ct-btn"
            :class="running === 'exec' ? 'ct-btn-danger' : 'ct-btn-go'"
            :disabled="running === 'exec' ? false : !canStart"
            @click="running === 'exec' ? stopRun() : start()"
          >
            <i :class="running === 'exec' ? 'fas fa-stop' : 'fas fa-bolt'"></i>
            {{ running === 'exec' ? '停止' : '开始传输' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useModal } from '../../composables/useModal'
import CrossTransferTree from './CrossTransferTree.vue'
import CrossTransferPickerModal from './CrossTransferPickerModal.vue'
import CrossTransferProbeNoticeDialog from './CrossTransferProbeNoticeDialog.vue'

const { custom, confirm } = useModal()

const SOFT_FOLDER_LIMIT = 10
const router = useRouter()

const CT_SETTINGS_STORAGE_KEY = 'litepan:cross-transfer:settings'
const CT_PROBE_NOTICE_KEY = 'litepan:cross-transfer:probe-notice-dismissed'
const FOOTER_TIP_INTERVAL_MS = 6000
const footerScrollTips = [
  { text: '先试探可避免覆盖误操作；临时目录结束后自动清理。点击查看说明。', action: 'probe-notice' },
  { text: '建议每次只选一部影片、一季或少量文件夹，子目录多请分批传输。' },
  { text: '大部分网盘接口不返回sha1或其他哈希值，暂时无法匹配秒传方案。' },
]

const routes = ref([])
const activeId = ref('')
const swapped = ref(false)

const src = ref(null)
const dst = ref(null)
const srcTree = ref(null)
const dstTree = ref(null)
const probeFiles = ref([])

const conflict = ref('rename')
const fallback = ref('off')
const settingsOpen = ref(false)
const settingsMenuRef = ref(null)
const settingsTriggerRef = ref(null)
const settingsDropdownRef = ref(null)
const settingsDropdownStyle = ref({})
const SETTINGS_DROPDOWN_WIDTH = 296
const footerTipIndex = ref(0)
let footerTipTimer = null
const running = ref('')
const abortCtrl = ref(null)
const barWidth = ref(0)
const metrics = reactive({ total: 0, ok: 0, no: 0, done: 0 })
const relayNotice = ref(null)
const phaseStatus = ref('')
const scanSummary = ref(null)

const relayTasksHref = computed(() => (
  router.resolve({ path: '/', query: { taskPanel: 'relay' } }).href
))

const showProgressBar = computed(() => Boolean(running.value))
const showFooterScrollTips = computed(() => !showProgressBar.value && !relayNotice.value)
const currentFooterTip = computed(() => footerScrollTips[footerTipIndex.value] || footerScrollTips[0])
const isScanPhase = computed(() => phaseStatus.value.includes('扫描'))
const isBaiduMd5Route = computed(() => curRoute.value?.method === 'md5' && srcDriver.value === 'baidu_open')

const accounts = ref([])
const srcTreeRef = ref(null)

const curRoute = computed(() => routes.value.find(r => r.id === activeId.value) || null)
const routeBidirectional = computed(() => !!curRoute.value?.bidirectional)
const srcDriver = computed(() => {
  if (!curRoute.value) return ''
  return swapped.value ? curRoute.value.to.driver : curRoute.value.from.driver
})
const dstDriver = computed(() => {
  if (!curRoute.value) return ''
  return swapped.value ? curRoute.value.from.driver : curRoute.value.to.driver
})
const srcPan = computed(() => panOf(srcDriver.value))
const dstPan = computed(() => panOf(dstDriver.value))

const dstMeta = computed(() => {
  if (!curRoute.value) return null
  return swapped.value ? curRoute.value.from : curRoute.value.to
})
const dstName = computed(() => dstMeta.value?.name || '目标盘')
const dstConflictPolicies = computed(() => {
  const p = dstMeta.value?.conflict_policies
  return Array.isArray(p) && p.length ? p : ['rename', 'overwrite']
})
const targetOverwriteUnsupported = computed(() => !dstConflictPolicies.value.includes('overwrite'))
const targetRenameUnsupported = computed(() => !dstConflictPolicies.value.includes('rename'))
const effectiveConflict = computed(() => {
  if (conflict.value === 'overwrite' && targetOverwriteUnsupported.value) return 'rename'
  if (conflict.value === 'rename' && targetRenameUnsupported.value) return 'overwrite'
  return conflict.value
})

const canProbe = computed(() => !!src.value && !!dst.value && !running.value)
const canStart = computed(() => !!src.value && !!dst.value && !!curRoute.value && !running.value)

function panOf(driver) {
  const r = curRoute.value
  if (!r) return {}
  if (r.from.driver === driver) return r.from
  if (r.to.driver === driver) return r.to
  return {}
}
function accountsFor(driver) {
  return accounts.value.filter(a => a.driver_type === driver && a.is_active !== false)
}

const hideImg = (e) => { e.target.style.display = 'none' }
const notify = (type, msg) => { window.appNotification?.[type]?.(msg) }

function clearRelayNotice() {
  relayNotice.value = null
}

function clearSourceSelection() {
  src.value = null
  srcTree.value = null
  probeFiles.value = []
  scanSummary.value = null
  phaseStatus.value = ''
  metrics.total = 0
  metrics.ok = 0
  metrics.no = 0
  metrics.done = 0
}

function buildScanSummary(scan) {
  const files = scan?.total || 0
  const folders = scan?.shallow_dirs || 0
  if (files <= 0) return null
  const warn = folders > SOFT_FOLDER_LIMIT
  const pending = (scan?.files || []).filter(f => !f.hash && f.source_file_id).length
  let text = `已扫描 ${files} 个文件`
  if (folders) text += `、${folders} 个子文件夹（一至二级合计）`
  if (pending && isBaiduMd5Route.value) text += `，${pending} 个待试探时计算指纹`
  text += warn ? '。子文件夹较多，扫描较慢，建议缩小范围或分批传输。' : '。'
  return { text, warn }
}

function isProbeNoticeDismissed() {
  try {
    return localStorage.getItem(CT_PROBE_NOTICE_KEY) === '1'
  } catch {
    return false
  }
}

function markProbeNoticeSkipped() {
  try {
    localStorage.setItem(CT_PROBE_NOTICE_KEY, '1')
  } catch {
  }
}

function clearProbeNoticeSkipped() {
  try {
    localStorage.removeItem(CT_PROBE_NOTICE_KEY)
  } catch {
  }
}

async function openProbeNoticeDialog() {
  const result = await custom({
    title: '',
    size: 'medium',
    closable: false,
    hideFooter: true,
    component: CrossTransferProbeNoticeDialog,
    componentProps: {
      skipChecked: isProbeNoticeDismissed(),
    },
  }).catch(() => null)

  if (!result?.confirmed) return false
  if (result.skipNextTime) markProbeNoticeSkipped()
  else clearProbeNoticeSkipped()
  return true
}

async function confirmProbeNotice() {
  if (isProbeNoticeDismissed()) return true
  return openProbeNoticeDialog()
}

function onFooterTipClick() {
  if (currentFooterTip.value?.action !== 'probe-notice') return
  openProbeNoticeDialog()
}

function startFooterTipTimer() {
  stopFooterTipTimer()
  footerTipTimer = setInterval(() => {
    footerTipIndex.value = (footerTipIndex.value + 1) % footerScrollTips.length
  }, FOOTER_TIP_INTERVAL_MS)
}

function stopFooterTipTimer() {
  if (!footerTipTimer) return
  clearInterval(footerTipTimer)
  footerTipTimer = null
}

async function confirmLargeBatch(scan) {
  const files = scan?.total || 0
  const folders = scan?.shallow_dirs || 0
  if (folders <= SOFT_FOLDER_LIMIT) return true
  try {
    await confirm({
      title: '子文件夹较多',
      content: `所选目录下一至二级共有 ${folders} 个子文件夹（共 ${files} 个文件）。递归扫描需逐个目录请求，继续可能较慢。建议每次只选一部影片或一个子目录。`,
      confirmText: '继续',
      cancelText: '取消',
      hideCancelButton: false,
    })
    return true
  } catch {
    return false
  }
}

function createFileRunContext(fileList) {
  const nodeMap = {}
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'dir') walk(n.children)
      else nodeMap[n.rel_path] = n
    }
  }
  walk(srcTree.value)
  const fileMap = {}
  fileList.forEach(f => { fileMap[f.rel_path] = f })
  const orderedPaths = fileList.map(f => f.rel_path)
  const setNodeRun = (relPath, run) => {
    const node = nodeMap[relPath]
    if (!node) return
    if (run) node.state = 'run'
    else delete node.state
  }
  const clearAllRun = () => {
    for (const p of orderedPaths) setNodeRun(p, false)
  }
  const scrollToFile = (relPath) => {
    nextTick(() => {
      const root = srcTreeRef.value
      if (!root || !relPath) return
      const el = root.querySelector(`[data-rel-path="${CSS.escape(relPath)}"]`)
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    })
  }
  return { nodeMap, fileMap, orderedPaths, setNodeRun, clearAllRun, scrollToFile }
}

function selectRoute(r) {
  activeId.value = r.id
  swapped.value = false
  reset()
}
function swap() {
  if (!curRoute.value || !curRoute.value.bidirectional) return
  swapped.value = !swapped.value
  reset()
  notify('success', `已交换方向：${srcPan.value.name} → ${dstPan.value.name}`)
}

function stopRun() {
  if (!running.value) return
  try { abortCtrl.value?.abort() } catch {}
}

async function openPicker(mode) {
  const driver = mode === 'src' ? srcDriver.value : dstDriver.value
  const panName = panOf(driver).name || driver
  const accs = accountsFor(driver)
  if (!accs.length) {
    notify('warning', `没有可用的${panName}账号，请先到「存储管理」添加`)
    return
  }
  const cur = mode === 'src' ? src.value : dst.value
  try {
    const result = await custom({
      title: '',
      size: null,
      closable: false,
      hideFooter: true,
      bodyClass: 'modal-body-flush',
      component: CrossTransferPickerModal,
      componentProps: {
        mode,
        panName,
        accounts: accs,
        initialAccId: cur?.accId || accs[0]?.id || '',
        initialPath: cur?.path || ''
      }
    })
    if (!result) return
    const sel = { accId: result.accId, accName: result.accName, parentId: result.parentId, path: result.path }
    if (mode === 'src') {
      src.value = sel
      srcTree.value = null
      probeFiles.value = []
      scanSummary.value = null
    } else {
      dst.value = sel
    }
    dstTree.value = null
    resetMetrics()
  } catch (e) {
  }
}

async function scanSource(clearTree = true) {
  if (!src.value || !curRoute.value) return null
  if (clearTree) {
    srcTree.value = null
    resetMetrics()
    scanSummary.value = null
  }
  phaseStatus.value = '正在扫描源目录…'
  try {
    const resp = await axios.post('/api/cross-transfer/scan', {
      source_account_id: src.value.accId,
      source_parent_id: src.value.parentId,
      source_display_path: src.value.path || '',
      method: curRoute.value.method,
    }, { signal: abortCtrl.value?.signal })
    if (!resp.data || !resp.data.success) {
      notify('error', resp.data?.message || '扫描失败')
      return null
    }
    const scan = resp.data.data
    decorateTree(scan.tree)
    srcTree.value = scan.tree
    probeFiles.value = scan.files || []
    metrics.total = scan.total
    if (clearTree) {
      metrics.ok = 0
      metrics.no = 0
      metrics.done = 0
    }
    scanSummary.value = buildScanSummary(scan)
    if (scan.truncated) notify('warning', `文件较多，仅扫描前 ${scan.total} 个`)
    if (running.value) phaseStatus.value = ''
    return scan
  } catch (e) {
    if (axios.isCancel?.(e) || e?.name === 'CanceledError') return null
    notify('error', '扫描失败: ' + (e.response?.data?.message || e.message))
    return null
  } finally {
    if (!running.value) phaseStatus.value = ''
  }
}

async function probe() {
  if (!src.value || !dst.value || !curRoute.value) return
  if (!(await confirmProbeNotice())) return
  running.value = 'probe'
  abortCtrl.value = new AbortController()
  barWidth.value = 8

  const scan = await scanSource(true)
  if (!scan) {
    running.value = ''
    barWidth.value = 0
    return
  }
  if (!(await confirmLargeBatch(scan))) {
    clearSourceSelection()
    running.value = ''
    barWidth.value = 0
    return
  }

  const { nodeMap, fileMap, orderedPaths, setNodeRun, clearAllRun, scrollToFile } = createFileRunContext(probeFiles.value)
  if (orderedPaths.length) {
    setNodeRun(orderedPaths[0], true)
    scrollToFile(orderedPaths[0])
  }

  let processed = 0
  const probeErrors = new Set()
  try {
    const resp = await fetch('/api/cross-transfer/probe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: abortCtrl.value?.signal,
      body: JSON.stringify({
        source_account_id: src.value.accId,
        target_account_id: dst.value.accId,
        target_parent_id: dst.value.parentId,
        method: curRoute.value.method,
        files: probeFiles.value.map(f => ({
          source_file_id: f.source_file_id,
          rel_path: f.rel_path,
          name: f.name,
          size: f.size,
          hash: f.hash,
        }))
      })
    })
    if (!resp.ok || !resp.body) {
      notify('error', `试探失败 (HTTP ${resp.status})`)
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.event === 'hashing') {
          const relPath = msg.rel_path
          if (relPath) {
            setNodeRun(relPath, true)
            scrollToFile(relPath)
          }
        } else if (msg.event === 'item') {
          const relPath = msg.rel_path
          const node = nodeMap[relPath]
          if (msg.hash) {
            const f = fileMap[relPath]
            if (f) f.hash = msg.hash
          }
          setNodeRun(relPath, false)
          if (node) {
            node.reuse = msg.reuse
            delete node.state
          }
          const f = fileMap[relPath]
          if (f) f.reuse = msg.reuse
          if (msg.error) probeErrors.add(msg.error)
          if (msg.reuse) metrics.ok++; else metrics.no++
          processed++
          barWidth.value = metrics.total ? Math.round(processed / metrics.total * 100) : 0
          const nextPath = orderedPaths[processed]
          if (nextPath) {
            setNodeRun(nextPath, true)
            scrollToFile(nextPath)
          }
        } else if (msg.event === 'end') {
          metrics.ok = msg.ok
          metrics.no = msg.no
        } else if (msg.event === 'error') {
          notify('error', msg.message || '试探失败')
        }
      }
    }
    if (probeErrors.size) {
      const detail = Array.from(probeErrors).slice(0, 2).join('；')
      notify('warning', `目标盘试探报错：${detail}（可秒传 ${metrics.ok}/${metrics.total}，其余可能为未命中或受目标盘限制）`)
    } else {
      notify('success', `试探完成，可秒传 ${metrics.ok}/${metrics.total}`)
    }
  } catch (e) {
    if (e?.name === 'AbortError') notify('warning', '已停止试探')
    else notify('error', '试探失败: ' + (e.message || e))
  } finally {
    abortCtrl.value = null
    clearAllRun()
    phaseStatus.value = ''
    running.value = ''
    setTimeout(() => { barWidth.value = 0 }, 500)
  }
}

async function start() {
  if (!src.value || !dst.value || !curRoute.value) return
  clearRelayNotice()
  running.value = 'exec'
  abortCtrl.value = new AbortController()
  barWidth.value = 12

  if (!probeFiles.value.length) {
    const scan = await scanSource(false)
    if (!scan) {
      running.value = ''
      barWidth.value = 0
      return
    }
    if (!(await confirmLargeBatch(scan))) {
      clearSourceSelection()
      running.value = ''
      barWidth.value = 0
      return
    }
  }

  const files = probeFiles.value.filter(f => f.hash || f.source_file_id)
  if (!files.length) {
    notify('warning', '没有可处理的文件')
    running.value = ''
    barWidth.value = 0
    return
  }

  const { nodeMap, orderedPaths, setNodeRun, clearAllRun, scrollToFile } = createFileRunContext(files)
  if (orderedPaths.length) {
    setNodeRun(orderedPaths[0], true)
    scrollToFile(orderedPaths[0])
  }

  const allResults = []
  let processed = 0
  barWidth.value = 20
  try {
    const resp = await fetch('/api/cross-transfer/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      signal: abortCtrl.value?.signal,
      body: JSON.stringify({
        source_account_id: src.value.accId,
        source_account_name: src.value.accName,
        source_driver_type: srcDriver.value,
        target_account_id: dst.value.accId,
        target_account_name: dst.value.accName,
        target_driver_type: dstDriver.value,
        target_parent_id: dst.value.parentId,
        target_display_path: dst.value.path,
        method: curRoute.value.method,
        files: files.map(f => ({
          source_file_id: f.source_file_id,
          rel_path: f.rel_path,
          rel_dir: f.rel_dir,
          name: f.name,
          size: f.size,
          hash: f.hash,
        })),
        conflict: effectiveConflict.value,
        fallback: fallback.value === 'on',
      }),
    })
    if (!resp.ok || !resp.body) {
      notify('error', `传输失败 (HTTP ${resp.status})`)
      return
    }
    const reader = resp.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx).trim()
        buffer = buffer.slice(idx + 1)
        if (!line) continue
        let msg
        try { msg = JSON.parse(line) } catch { continue }
        if (msg.event === 'start') {
          metrics.done = 0
        } else if (msg.event === 'item') {
          const relPath = msg.rel_path
          const item = msg
          allResults.push({
            rel_path: item.rel_path,
            name: item.name,
            success: item.success,
            mode: item.mode,
            file_id: item.file_id,
            error: item.error,
          })
          setNodeRun(relPath, false)
          const node = nodeMap[relPath]
          if (node) {
            if (item.mode === 'rapid' && item.success) {
              node.transferred = true
              delete node.relay
            } else if (item.mode === 'relay') {
              node.relay = true
            }
            delete node.state
          }
          if (item.mode === 'rapid' && item.success) {
            metrics.done++
            applyTransferResults([item])
          }
          processed++
          barWidth.value = files.length ? Math.round(20 + processed / files.length * 75) : 100
          const nextPath = orderedPaths[processed]
          if (nextPath) {
            setNodeRun(nextPath, true)
            scrollToFile(nextPath)
          }
        } else if (msg.event === 'end') {
          metrics.done = msg.rapid_done ?? msg.done ?? metrics.done
          metrics.ok = metrics.done
          metrics.no = Math.max(0, files.length - metrics.done - (msg.relay_queued || 0))
          const rapidResults = allResults.filter(r => r.mode === 'rapid' && r.success)
          buildDstTree(rapidResults, files)
          markRelayQueued(allResults)
          barWidth.value = 100
          const relayQueued = msg.relay_queued || 0
          const message = `秒传完成 ${metrics.done}/${files.length}`
          if (relayQueued > 0) {
            relayNotice.value = {
              rapidDone: metrics.done,
              total: files.length,
              relayQueued,
            }
          } else {
            notify(metrics.done === files.length ? 'success' : 'warning', message)
          }
        } else if (msg.event === 'error') {
          notify('error', msg.message || '传输失败')
        }
      }
    }
  } catch (e) {
    if (e?.name === 'AbortError') notify('warning', '已停止传输（已处理的文件保留，未处理的已中止）')
    else notify('error', '传输失败: ' + (e.message || e))
  } finally {
    abortCtrl.value = null
    clearAllRun()
    phaseStatus.value = ''
    running.value = ''
    setTimeout(() => { barWidth.value = 0 }, 600)
  }
}

function decorateTree(nodes) {
  for (const n of nodes || []) {
    if (n.type === 'dir') { n.open = true; decorateTree(n.children) }
    else { n.transferred = false }
  }
}
function markRelayQueued(results) {
  const relayPaths = new Set(results.filter(r => r.mode === 'relay').map(r => r.rel_path))
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'dir') walk(n.children)
      else if (relayPaths.has(n.rel_path)) {
        n.reuse = false
        n.relay = true
      }
    }
  }
  walk(srcTree.value)
}

function applyTransferResults(results) {
  const okPaths = new Set(results.filter(r => r.success).map(r => r.rel_path))
  const walk = (nodes) => {
    for (const n of nodes || []) {
      if (n.type === 'dir') walk(n.children)
      else if (okPaths.has(n.rel_path)) n.transferred = true
    }
  }
  walk(srcTree.value)
}
function buildDstTree(results, files) {
  const fileByPath = Object.fromEntries(files.map(f => [f.rel_path, f]))
  const tree = []
  const ensureDir = (segments) => {
    let list = tree
    let parent = null
    for (const seg of segments) {
      let node = list.find(x => x.type === 'dir' && x.name === seg)
      if (!node) { node = { id: 'd_' + seg + '_' + list.length, type: 'dir', name: seg, open: true, children: [] }; list.push(node) }
      parent = node
      list = node.children
    }
    return parent ? parent.children : tree
  }
  results.filter(r => r.success).forEach((r, idx) => {
    const f = fileByPath[r.rel_path] || {}
    const segments = (f.rel_dir || '').split('/').filter(Boolean)
    const bucket = ensureDir(segments)
    bucket.push({ id: 'f_' + idx, type: 'file', name: r.name, size: f.size || 0 })
  })
  dstTree.value = tree.length ? tree : null
}

function resetMetrics() { metrics.total = 0; metrics.ok = 0; metrics.no = 0; metrics.done = 0 }
function reset() {
  if (running.value) return
  clearRelayNotice()
  phaseStatus.value = ''
  scanSummary.value = null
  src.value = null
  dst.value = null
  srcTree.value = null
  dstTree.value = null
  probeFiles.value = []
  barWidth.value = 0
  resetMetrics()
}

async function loadRoutes() {
  try {
    const resp = await axios.get('/api/cross-transfer/routes')
    if (resp.data && resp.data.success) {
      routes.value = resp.data.data || []
      if (routes.value.length && !activeId.value) activeId.value = routes.value[0].id
    }
  } catch (e) {
    notify('error', '获取线路失败: ' + (e.response?.data?.message || e.message))
  }
}
async function loadAccounts() {
  try {
    const resp = await axios.get('/api/admin/accounts')
    if (resp.data && resp.data.success) accounts.value = resp.data.data || []
  } catch (e) {
    notify('error', '获取账号失败: ' + (e.response?.data?.message || e.message))
  }
}

function loadCtSettings() {
  try {
    const raw = localStorage.getItem(CT_SETTINGS_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.conflict === 'rename' || data.conflict === 'overwrite') conflict.value = data.conflict
    if (data.fallback === 'on' || data.fallback === 'off') fallback.value = data.fallback
  } catch {
  }
}

function saveCtSettings() {
  try {
    localStorage.setItem(CT_SETTINGS_STORAGE_KEY, JSON.stringify({
      conflict: conflict.value,
      fallback: fallback.value,
    }))
  } catch {
  }
}

function updateSettingsDropdownPos() {
  const trigger = settingsTriggerRef.value
  if (!trigger) return
  const rect = trigger.getBoundingClientRect()
  const gap = 8
  const left = Math.min(
    Math.max(8, rect.right - SETTINGS_DROPDOWN_WIDTH),
    window.innerWidth - SETTINGS_DROPDOWN_WIDTH - 8
  )
  settingsDropdownStyle.value = {
    position: 'fixed',
    left: `${left}px`,
    top: `${rect.top - gap}px`,
    transform: 'translateY(-100%)',
    width: `${SETTINGS_DROPDOWN_WIDTH}px`,
    zIndex: '100000',
  }
}

function toggleSettingsMenu(e) {
  e?.stopPropagation()
  settingsOpen.value = !settingsOpen.value
  if (settingsOpen.value) nextTick(() => updateSettingsDropdownPos())
}

function onDocClick(e) {
  if (!settingsOpen.value) return
  const menu = settingsMenuRef.value
  const panel = settingsDropdownRef.value
  if (menu?.contains(e.target) || panel?.contains(e.target)) return
  settingsOpen.value = false
}

function onSettingsReposition() {
  if (settingsOpen.value) updateSettingsDropdownPos()
}

watch([conflict, fallback], saveCtSettings)
watch(showFooterScrollTips, (show) => {
  if (show) startFooterTipTimer()
  else stopFooterTipTimer()
}, { immediate: true })

onMounted(() => {
  loadCtSettings()
  loadRoutes()
  loadAccounts()
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onSettingsReposition, true)
  window.addEventListener('resize', onSettingsReposition)
})
onUnmounted(() => {
  stopFooterTipTimer()
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onSettingsReposition, true)
  window.removeEventListener('resize', onSettingsReposition)
})
</script>

<style scoped>
.cross-transfer {
  color: var(--text-main);
  --fc-pill-bg: rgba(76,116,223,.1);
  --fc-pill-fg: #2952cc;
  --fc-pill-md5-bg: rgba(124,58,237,.1);
  --fc-pill-md5-fg: #6d28d9;
}

.flow-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(168px, 1fr));
  gap: 10px;
}
.flow-card {
  position: relative; border-radius: 14px; background: var(--card-bg); cursor: pointer; user-select: none; overflow: hidden;
  border: 1px solid var(--border-color); box-shadow: 0 6px 18px rgba(15,23,42,.05); outline: 2px solid transparent;
  transition: box-shadow .18s ease, outline-color .18s ease, transform .18s ease;
}
.flow-card:hover { transform: translateY(-1px); box-shadow: 0 10px 26px rgba(15,23,42,.1); }
.flow-card.active { outline-color: var(--primary-color); box-shadow: 0 10px 28px rgba(76,116,223,.18); }
.flow-card.disabled { opacity: .55; cursor: not-allowed; transform: none; }
.fc-body { display: flex; flex-direction: column; }
.fc-slot {
  padding: 9px 10px 7px;
  background: color-mix(in srgb, var(--app-bg) 55%, var(--card-bg));
  border-bottom: 1px solid var(--border-color);
}
.fc-link { display: flex; align-items: center; justify-content: center; gap: 12px; }
.fc-logo { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.fc-logo img { width: 30px; height: 30px; object-fit: contain; border-radius: 8px; }
.fc-logo.placeholder { width: 30px; height: 30px; border-radius: 8px; background: var(--app-bg); color: var(--text-secondary); font-size: 13px; display: flex; align-items: center; justify-content: center; }
.fc-pulse-track {
  flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
  min-height: 20px; padding: 0 4px;
}
.fc-tri { display: inline-flex; align-items: center; gap: 2px; }
.fc-tri i { font-size: 8px; color: var(--primary-color); line-height: 1; opacity: .35; display: inline-block; }
.flow-card.active .fc-tri:not(.fc-tri-both):not(.fc-tri-plain) i:nth-child(1) {
  animation: fc-tri-blink 2s ease-in-out infinite;
}
.flow-card.active .fc-tri:not(.fc-tri-both):not(.fc-tri-plain) i:nth-child(2) {
  animation: fc-tri-blink 2s ease-in-out .12s infinite;
}
.flow-card.active .fc-tri:not(.fc-tri-both):not(.fc-tri-plain) i:nth-child(3) {
  animation: fc-tri-blink 2s ease-in-out .24s infinite;
}
.flow-card.active .fc-tri:not(.fc-tri-both):not(.fc-tri-plain) i:nth-child(4) {
  animation: fc-tri-blink 2s ease-in-out .36s infinite;
}
.flow-card.active .fc-tri:not(.fc-tri-both):not(.fc-tri-plain) i:nth-child(5) {
  animation: fc-tri-blink 2s ease-in-out .48s infinite;
}
@keyframes fc-tri-blink {
  0%, 100% { opacity: .3; transform: scale(.85); }
  45%, 55% { opacity: 1; transform: scale(1.2); }
}
.fc-tri-both i { font-size: 11px; color: #7c3aed; opacity: .6; display: inline-block; }
.flow-card.active .fc-tri-both i { opacity: .9; animation: fc-both-spin 2.6s linear infinite; }
@keyframes fc-both-spin { to { transform: rotate(360deg); } }
.fc-tri-plain i { font-size: 9px; color: var(--text-secondary); opacity: .42; }
.fc-meta { width: 100%; }
.fc-pill {
  width: 100%; font-size: 11px; font-weight: 600; padding: 6px 8px; border-radius: 0 0 13px 13px;
  display: flex; align-items: center; justify-content: center; gap: 5px;
  background: var(--fc-pill-bg); color: var(--fc-pill-fg);
}
.fc-pill i { font-size: 10px; flex-shrink: 0; }
.fc-pill.md5 { background: var(--fc-pill-md5-bg); color: var(--fc-pill-md5-fg); }
.fc-pill.muted { background: var(--app-bg); color: var(--text-secondary); justify-content: space-between; }
.fc-pill-left { display: inline-flex; align-items: center; gap: 5px; }
.fc-soon { font-size: 10px; color: var(--text-secondary); }
.biflag { font-size: 9px; font-weight: 700; color: #7c3aed; background: rgba(124,58,237,.14); padding: 1px 6px; border-radius: 999px; margin-left: 2px; }

.logo-chip { display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.logo-chip img { object-fit: contain; border-radius: 7px; }
.logo-chip.s26 { width: 26px; height: 26px; } .logo-chip.s26 img { width: 26px; height: 26px; }
.logo-chip.s30 { width: 30px; height: 30px; } .logo-chip.s30 img { width: 30px; height: 30px; }

.ct-usage-inline-hint {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(76,116,223,.14);
  background: rgba(76,116,223,.06);
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
  min-width: 0;
}
.ct-usage-inline-hint i { color: var(--primary-color); flex-shrink: 0; }
.ct-usage-inline-hint > span { min-width: 0; }

.transfer-shell {
  margin-top: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(15,23,42,.05);
  overflow: hidden;
}
.transfer-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--app-bg) 55%, var(--card-bg));
  border-bottom: 1px solid var(--border-color);
}
.tb-side { display: flex; align-items: center; gap: 8px; min-width: 0; }
.tb-side.tb-dst { justify-content: flex-end; }
.tb-title { min-width: 0; }
.tb-title span { display: block; font-weight: 700; font-size: 14px; line-height: 1.25; }
.tb-title small { display: block; font-size: 11px; font-weight: 500; color: var(--text-secondary); }
.tb-title-dst { text-align: right; }
.panel-role { flex-shrink: 0; font-size: 11px; font-weight: 700; padding: 3px 9px; border-radius: 999px; }
.tb-src .panel-role { background: rgba(76,116,223,.12); color: #2952cc; }
.dst-role { background: rgba(255,140,66,.16); color: #c2410c; }
.tb-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  flex-shrink: 0;
  padding: 0 4px;
  min-height: 46px;
}
.tb-flow {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  font-size: 12px;
  color: var(--primary-color);
  background: rgba(76,116,223,.08);
  border: 1px solid rgba(76,116,223,.14);
}
.tb-swap {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  border: 1px solid rgba(76,116,223,.14);
  background: rgba(76,116,223,.08);
  color: var(--primary-color);
  font-size: 12px;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background .2s ease, border-color .2s ease;
}
.tb-swap:hover {
  background: rgba(76,116,223,.16);
  border-color: rgba(76,116,223,.3);
}
.tb-swap-hint { font-size: 10px; color: var(--text-secondary); white-space: nowrap; line-height: 1; }
.transfer-body { display: grid; grid-template-columns: 1fr 1fr; align-items: stretch; }
.panel { background: var(--card-bg); min-width: 0; overflow: hidden; display: flex; flex-direction: column; }
.panel.src { border-right: 1px solid var(--border-color); }
.panel-pick { padding: 12px 16px; border-bottom: 1px solid var(--border-color); }
.combo { width: 100%; border: none; border-radius: 10px; padding: 11px 14px; background: var(--app-bg); color: var(--text-main); font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 10px; text-align: left; transition: background .15s; }
.combo:hover { background: rgba(127,127,127,.12); }
.combo .c-ic { color: var(--primary-color); flex: 0 0 auto; }
.combo .c-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.combo .c-text.placeholder { color: var(--text-secondary); }
.combo .c-caret { color: var(--text-secondary); flex: 0 0 auto; }
.tree { padding: 6px; height: 300px; overflow: auto; }
.tree-host { position: relative; }
.tree-empty { color: var(--text-secondary); padding: 28px 12px; text-align: center; }
.tree-scan-banner {
  display: flex; align-items: flex-start; gap: 8px;
  margin: 4px 6px 8px; padding: 8px 10px; border-radius: 10px;
  font-size: 12px; line-height: 1.45; color: var(--text-secondary);
  background: rgba(76,116,223,.06); border: 1px solid rgba(76,116,223,.12);
}
.tree-scan-banner i { margin-top: 2px; color: var(--primary-color); flex-shrink: 0; }
.tree-scan-banner.warn { color: #b45309; background: rgba(245,158,11,.08); border-color: rgba(245,158,11,.22); }
.tree-scan-banner.warn i { color: #d97706; }
.tree-phase-fill {
  position: absolute; inset: 0; z-index: 2;
  display: flex; align-items: center; justify-content: center;
  background: color-mix(in srgb, var(--card-bg) 82%, transparent);
  backdrop-filter: blur(1px);
}
.tree-phase-card {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  max-width: 240px; padding: 8px 12px; text-align: center;
}
.tree-phase-spin { font-size: 22px; color: var(--primary-color); }
.tree-phase-title { margin: 0; font-size: 14px; font-weight: 600; color: var(--text-main); }
.tree-phase-sub { margin: 0; font-size: 12px; line-height: 1.45; color: var(--text-secondary); }
.tree-phase-bar {
  width: 160px; height: 4px; border-radius: 999px; overflow: hidden;
  background: var(--app-bg); border: 1px solid var(--border-color);
}
.tree-phase-bar-indeterminate {
  width: 40%; height: 100%; border-radius: 999px;
  background: linear-gradient(90deg, var(--primary-color), var(--primary-color-end));
  animation: ct-scan-bar 1.2s ease-in-out infinite;
}
@keyframes ct-scan-bar {
  0% { transform: translateX(-120%); }
  100% { transform: translateX(320%); }
}
.ct-footer {
  margin-top: 10px;
  background: linear-gradient(180deg, var(--card-bg), color-mix(in srgb, var(--app-bg) 40%, var(--card-bg)));
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 6px 18px rgba(15,23,42,.05);
  overflow: visible;
}
.ct-footer-bar {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
}
.ct-footer-left {
  flex: 0 0 auto;
  min-width: 0;
}
.ct-footer-center {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  padding: 0 6px;
}
.ft-center-progress {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.ft-prog-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--text-secondary);
}
.ct-footer-center .ft-prog-row {
  width: 100%;
  max-width: none;
  margin-top: 0;
}
.ct-footer-scroll-hint {
  flex: 1;
  width: 100%;
  min-width: 0;
  border: 1px solid rgba(76,116,223,.14);
  background: rgba(76,116,223,.06);
  border-radius: 10px;
  padding: 6px 10px;
  color: var(--text-secondary);
  font-size: 13px;
  line-height: 1.35;
  text-align: left;
}
.ct-footer-scroll-hint.is-clickable {
  cursor: pointer;
  transition: background .15s ease, border-color .15s ease;
}
.ct-footer-scroll-hint.is-clickable:hover {
  background: rgba(76,116,223,.1);
  border-color: rgba(76,116,223,.28);
}
.ct-footer-scroll-text {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
.ct-footer-scroll-text i {
  color: var(--primary-color);
  flex-shrink: 0;
}
.ct-tip-fade-enter-active,
.ct-tip-fade-leave-active {
  transition: opacity .28s ease;
}
.ct-tip-fade-enter-from,
.ct-tip-fade-leave-to {
  opacity: 0;
}
.ct-footer-center .ct-relay-inline-hint {
  flex: 1;
  width: 100%;
  min-width: 0;
  white-space: normal;
}
.ct-footer-center .ct-relay-inline-hint > span {
  white-space: normal;
  line-height: 1.35;
}
.ft-stats { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ft-item { display: inline-flex; align-items: baseline; gap: 4px; white-space: nowrap; }
.ft-item .n {
  font-size: 22px; font-weight: 700; letter-spacing: -.02em;
  font-variant-numeric: tabular-nums; color: var(--text-main); line-height: 1;
}
.ft-item .n.ok { color: #16a34a; }
.ft-item .n.no { color: #94a3b8; }
.ft-item .n.relay { color: #2563eb; }
.ft-item .l { font-size: 11px; color: var(--text-secondary); }
.ft-sep { width: 2px; height: 2px; border-radius: 50%; background: #cbd5e1; flex-shrink: 0; }
.ft-prog-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ft-track {
  flex: 1;
  height: 2px;
  border-radius: 999px;
  background: #dde3ea;
  overflow: hidden;
}
.ft-track > i {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: #16a34a;
  transition: width .18s ease;
}
.ft-pct {
  font-size: 12px;
  font-weight: 700;
  color: #16a34a;
  min-width: 36px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.footer-island {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px;
  flex-shrink: 0;
  border-radius: 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(15,23,42,.06);
}
.footer-island .ct-settings-trigger { border: none; background: transparent; box-shadow: none; }
.ct-relay-inline-hint {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(37, 99, 235, .18);
  background: rgba(37, 99, 235, .06);
  color: #2563eb;
  font-size: 13px;
  line-height: 1.35;
  text-decoration: none;
  transition: background .15s ease, border-color .15s ease;
}
.ct-relay-inline-hint:hover {
  background: rgba(37, 99, 235, .1);
  border-color: rgba(37, 99, 235, .32);
}
.ct-relay-inline-hint > span {
  color: var(--text-secondary);
}
.ct-relay-inline-arrow {
  flex-shrink: 0;
  font-size: 11px;
  opacity: .75;
}
.ct-settings-menu { position: relative; flex: 0 0 auto; }
.ct-settings-trigger {
  width: 38px; height: 38px; border: 1px solid var(--border-color); border-radius: 10px;
  background: var(--card-bg); color: var(--text-secondary); cursor: pointer;
  display: inline-flex; align-items: center; justify-content: center;
}
.ct-settings-trigger:hover { color: var(--primary-color); border-color: rgba(76,116,223,.35); }
.ct-settings-dropdown {
  padding: 14px; border-radius: 14px;
  background: var(--card-bg); border: 1px solid var(--border-color);
  box-shadow: 0 12px 32px rgba(15,23,42,.14);
}
.ct-settings-dropdown-portal {
  position: fixed;
}
.ct-settings-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ct-settings-block {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ct-settings-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}
.ct-settings-seg {
  display: flex;
  gap: 0;
  padding: 3px;
  border-radius: 10px;
  background: var(--app-bg);
  border: 1px solid var(--border-color);
}
.ct-settings-opt {
  flex: 1;
  height: 32px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .15s ease, color .15s ease, box-shadow .15s ease;
}
.ct-settings-opt:hover:not(.active) {
  color: var(--text-main);
}
.ct-settings-opt.active {
  background: var(--card-bg);
  color: var(--primary-color);
  box-shadow: 0 1px 4px rgba(15,23,42,.08);
}
.ct-settings-opt:disabled {
  cursor: not-allowed;
  opacity: .45;
}
.ct-settings-fallback-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.45;
  color: var(--text-secondary);
}

.ct-btn { display: inline-flex; align-items: center; gap: 8px; padding: 10px 16px; border: 1px solid var(--border-color); border-radius: 10px; background: var(--card-bg); color: var(--text-regular); font-size: 14px; font-weight: 600; cursor: pointer; transition: filter .2s, opacity .2s; white-space: nowrap; }
.ct-btn:disabled { opacity: .5; cursor: not-allowed; }
.ct-btn-primary { background: linear-gradient(135deg, var(--primary-color), var(--primary-color-end)); border-color: transparent; color: #fff; box-shadow: 0 2px 6px rgba(76,116,223,.22); }
.ct-btn-primary:not(:disabled):hover { filter: brightness(1.06); }
.ct-btn-go { background: linear-gradient(135deg, #16a34a, #22c55e); border-color: transparent; color: #fff; box-shadow: 0 2px 6px rgba(22,163,74,.22); }
.ct-btn-go:not(:disabled):hover { filter: brightness(1.06); }
.ct-btn-danger { background: rgba(239,68,68,.1); border-color: rgba(239,68,68,.3); color: #dc2626; }
.ct-btn-danger:not(:disabled):hover { background: rgba(239,68,68,.18); }

:global(:root[data-theme="dark"]) .cross-transfer {
  --fc-pill-bg: rgba(76,116,223,.18);
  --fc-pill-fg: #93c5fd;
  --fc-pill-md5-bg: rgba(124,58,237,.2);
  --fc-pill-md5-fg: #c4b5fd;
}

@media (min-width: 1400px) {
  .flow-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); }
}
@media (max-width: 720px) {
  .flow-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
@media (max-width: 1080px) {
  .transfer-topbar { grid-template-columns: 1fr; gap: 8px; text-align: center; }
  .tb-side.tb-src, .tb-side.tb-dst { justify-content: center; }
  .tb-title-dst { text-align: center; }
  .tb-swap-hint { display: none; }
  .transfer-body { grid-template-columns: 1fr; }
  .panel.src { border-right: none; border-bottom: 1px solid var(--border-color); }
  .ct-footer-bar { flex-wrap: wrap; row-gap: 8px; }
  .ct-footer-center {
    flex: 1 1 100%;
    order: 3;
    padding: 0;
  }
  .ct-footer-center .ft-prog-row { max-width: 100%; }
  .footer-island { margin-left: auto; flex-wrap: wrap; }
}
</style>
