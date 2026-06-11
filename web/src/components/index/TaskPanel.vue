<template>
    <div class="upload-task-panel">
      <div class="upload-task-panel-header">
        <span>任务面板</span>
        <div class="upload-task-panel-actions">
          <button
            type="button"
            class="upload-task-header-info-btn"
            title="查看上传说明"
            @click="openUploadNoticeFromPanel"
          >
            !
          </button>
          <button type="button" class="upload-task-close-btn" @click="closeUploadTaskPanel" aria-label="关闭">×</button>
        </div>
      </div>
      <div class="upload-task-panel-body">
        <div class="upload-task-layout">
          <div class="upload-task-sidebar">
            <button
              type="button"
              class="upload-task-nav-item"
              :class="{ active: taskPanelCategory === 'upload' }"
              @click="taskPanelCategory = 'upload'"
            >
              <span class="upload-task-nav-icon"><SvgIcon name="upload" :size="16" /></span>
              <span class="upload-task-nav-label">上传任务</span>
              <span
                class="upload-task-nav-badge"
                :class="{ 'is-empty': activeUploadTasks.length === 0 }"
              >{{ activeUploadTasks.length || 0 }}</span>
            </button>
            <button
              type="button"
              class="upload-task-nav-item"
              :class="{ active: taskPanelCategory === 'relay' }"
              @click="taskPanelCategory = 'relay'"
            >
              <span class="upload-task-nav-icon"><SvgIcon name="relay" :size="16" /></span>
              <span class="upload-task-nav-label">跨盘任务</span>
              <span
                class="upload-task-nav-badge"
                :class="{ 'is-empty': activeRelayCount === 0 }"
              >{{ activeRelayCount || 0 }}</span>
            </button>
          </div>

          <div class="upload-task-content">
            <template v-if="taskPanelCategory === 'upload'">
            <div class="upload-task-toolbar">
              <div class="upload-task-batch-actions">
                <button
                  v-if="uploadTaskView === 'running'"
                  type="button"
                  class="task-toolbar-btn"
                  :class="{ primary: batchToggleMode === 'resume' }"
                  :disabled="!canBatchToggle"
                  :title="batchToggleTitle"
                  @click="handleBatchToggle"
                >
                  <span class="task-btn-icon">
                    <SvgIcon :name="batchToggleMode === 'pause' ? 'pause' : 'play'" :size="14" />
                  </span>
                  {{ batchToggleLabel }}
                </button>
                <button
                  type="button"
                  class="task-toolbar-btn danger"
                  :disabled="!canBatchDelete"
                  :title="canBatchDelete ? '删除当前页签中的任务' : '当前没有可删除的任务'"
                  @click="handleBatchDelete"
                >
                  <span class="task-btn-icon"><SvgIcon name="trash-button" :size="14" /></span>
                  {{ batchDeleteLabel }}
                </button>
              </div>
              <div class="upload-task-tabs">
                <button
                  type="button"
                  class="upload-task-tab"
                  :class="{ active: uploadTaskView === 'running' }"
                  @click="uploadTaskView = 'running'"
                >
                  进行中
                  <span class="upload-task-tab-count">{{ runningUploadTasks.length }}</span>
                </button>
                <button
                  type="button"
                  class="upload-task-tab"
                  :class="{ active: uploadTaskView === 'completed' }"
                  @click="uploadTaskView = 'completed'"
                >
                  已完成
                  <span class="upload-task-tab-count">{{ completedUploadTasks.length }}</span>
                </button>
              </div>
            </div>

            <div v-if="uploadTaskPanelLoading" class="upload-task-loading-state">
              <div class="loading-spinner"></div>
              <div class="upload-task-loading-text">{{ uploadTaskPanelLoadingText }}</div>
            </div>

            <div v-else-if="filteredUploadTasks.length > 0" class="upload-task-list">
              <div
                v-for="task in filteredUploadTasks"
                :key="task.task_id"
                class="upload-task-item"
                :class="{ completed: ['success', 'skipped'].includes(task.status) }"
              >
                <div class="upload-task-item-main">
                  <DriverIcon
                    class="upload-task-file-icon"
                    :logo="getUploadTaskDriverBadge(task).logo"
                    :color="getUploadTaskDriverBadge(task).color"
                    :name="getUploadTaskDriverBadge(task).name"
                    :title="getUploadTaskDriverBadge(task).title"
                    size="badge"
                  />
                  <div class="upload-task-file-info">
                    <div class="upload-task-title-row">
                      <span class="upload-task-name" :title="task.file_name">{{ task.file_name }}</span>
                      <span
                        v-if="['success', 'skipped', 'failed', 'canceled'].includes(task.status)"
                        class="upload-task-status"
                        :class="`status-${task.status}`"
                      >
                        {{ getUploadTaskStatusText(task.status) }}
                      </span>
                    </div>
                    <div v-if="isUploadTaskActive(task)" class="upload-task-meta">
                      <span class="task-phase-pill is-upload">
                        <span class="phase-dot"></span>{{ getUploadTaskPhaseLabel(task) }}
                      </span>
                      <span v-if="getUploadTaskSpeedText(task)" class="task-chip is-speed">{{ getUploadTaskSpeedText(task) }}</span>
                      <span v-if="formatUploadPart(task)" class="task-chip">{{ formatUploadPart(task) }}</span>
                      <span v-if="shouldShowUploadTaskMetaPercent(task)" class="task-chip is-percent">{{ task.progress || 0 }}%</span>
                    </div>
                    <div v-if="task.error" class="upload-task-error">{{ task.error }}</div>
                  </div>
                </div>
                <div
                  v-if="shouldShowUploadTaskHairline(task)"
                  class="upload-task-hairline"
                >
                  <div class="upload-task-progress-inner" :style="{ width: `${task.progress || 0}%` }"></div>
                </div>
                <div class="upload-task-item-actions">
                  <button
                    type="button"
                    class="task-row-btn"
                    :disabled="!canHandleUploadTaskPrimaryAction(task)"
                    :title="getUploadTaskPrimaryActionTitle(task)"
                    @click="handleUploadTaskPrimaryAction(task)"
                  >
                    <i :class="getUploadTaskPrimaryActionIconClass(task)" class="task-btn-icon font-icon"></i>
                  </button>
                  <button
                    type="button"
                    class="task-row-btn danger"
                    :disabled="!canDeleteUploadTask(task)"
                    :title="canDeleteUploadTask(task) ? '删除任务' : '当前不可删除'"
                    @click="handleDeleteUploadTask(task)"
                  >
                    <i class="fas fa-trash task-btn-icon font-icon"></i>
                  </button>
                </div>
              </div>
            </div>

            <div v-else class="upload-task-empty">
              <div class="upload-task-empty-text">{{ uploadTaskEmptyText }}</div>
            </div>
            </template>

            <template v-else>
              <div class="upload-task-toolbar">
                <div class="upload-task-batch-actions">
                  <button
                    type="button"
                    class="task-toolbar-btn danger"
                    :disabled="filteredRelayTasks.length === 0"
                    @click="handleBatchDeleteRelayTasks"
                  >
                    <span class="task-btn-icon"><SvgIcon name="trash-button" :size="14" /></span>
                    {{ relayTaskView === 'completed' ? '全部清空' : '全部删除' }}
                  </button>
                </div>
                <div class="upload-task-tabs">
                  <button
                    type="button"
                    class="upload-task-tab"
                    :class="{ active: relayTaskView === 'running' }"
                    @click="relayTaskView = 'running'"
                  >
                    进行中
                    <span class="upload-task-tab-count">{{ runningRelayTasks.length }}</span>
                  </button>
                  <button
                    type="button"
                    class="upload-task-tab"
                    :class="{ active: relayTaskView === 'completed' }"
                    @click="relayTaskView = 'completed'"
                  >
                    已完成
                    <span class="upload-task-tab-count">{{ completedRelayTasks.length }}</span>
                  </button>
                </div>
              </div>

              <div v-if="filteredRelayTasks.length > 0" class="upload-task-list">
                <div
                  v-for="task in filteredRelayTasks"
                  :key="task.task_id"
                  class="upload-task-item"
                  :class="{ completed: ['success', 'failed', 'canceled'].includes(task.status) }"
                >
                  <div class="upload-task-item-main">
                    <DriverIcon
                      class="upload-task-file-icon"
                      :logo="getRelayTaskDriverBadge(task).logo"
                      :color="getRelayTaskDriverBadge(task).color"
                      :name="getRelayTaskDriverBadge(task).name"
                      :title="getRelayTaskDriverBadge(task).title"
                      size="badge"
                    />
                    <div
                      class="upload-task-file-info"
                      :title="`${task.source_account_name || '源盘'} → ${task.target_account_name || '目标盘'}${task.target_display_path ? ' · ' + task.target_display_path : ''}`"
                    >
                      <div class="upload-task-title-row">
                        <span class="upload-task-name" :title="task.file_name">{{ task.file_name }}</span>
                        <span
                          v-if="['success', 'failed', 'canceled'].includes(task.status)"
                          class="upload-task-status"
                          :class="`status-${task.status}`"
                        >{{ getRelayStatusText(task) }}</span>
                      </div>
                      <div v-if="isRelayTaskActive(task)" class="upload-task-meta">
                        <span class="task-phase-pill" :class="task.phase === 'downloading' ? 'is-download' : 'is-upload'">
                          <span class="phase-dot"></span>{{ getRelayPhaseLabel(task) }}
                        </span>
                        <span v-if="formatRelaySpeed(task)" class="task-chip is-speed">{{ formatRelaySpeed(task) }}</span>
                        <span v-if="formatRelayPart(task)" class="task-chip">{{ formatRelayPart(task) }}</span>
                        <span v-if="shouldShowRelayTaskMetaPercent(task)" class="task-chip is-percent">{{ task.progress || 0 }}%</span>
                      </div>
                      <div v-if="task.error" class="upload-task-error">{{ task.error }}</div>
                    </div>
                  </div>
                  <div
                    v-if="shouldShowRelayTaskHairline(task)"
                    class="upload-task-hairline"
                  >
                    <div class="upload-task-progress-inner" :style="{ width: `${task.progress || 0}%` }"></div>
                  </div>
                  <div class="upload-task-item-actions">
                    <button
                      type="button"
                      class="task-row-btn danger"
                      title="删除任务"
                      @click="handleDeleteRelayTask(task)"
                    >
                      <i class="fas fa-trash task-btn-icon font-icon"></i>
                    </button>
                  </div>
                </div>
              </div>
              <div v-else class="upload-task-empty">
                <div class="upload-task-empty-text">{{ relayTaskView === 'completed' ? '暂无已完成跨盘任务' : '暂无进行中的跨盘任务' }}</div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
</template>

<script setup>
import { computed } from 'vue'
import SvgIcon from '../icons/SvgIcon.vue'
import DriverIcon from '../common/DriverIcon.vue'

const props = defineProps({
  uploadApi: { type: Object, required: true },
  relay: { type: Object, required: true },
})

const {
  activeUploadTasks,
  batchToggleMode,
  canBatchToggle,
  batchToggleTitle,
  handleBatchToggle,
  batchToggleLabel,
  canBatchDelete,
  handleBatchDelete,
  batchDeleteLabel,
  runningUploadTasks,
  completedUploadTasks,
  uploadTaskPanelLoading,
  uploadTaskPanelLoadingText,
  filteredUploadTasks,
  getUploadTaskDriverBadge,
  isUploadTaskActive,
  getUploadTaskPhaseLabel,
  getUploadTaskSpeedText,
  formatUploadPart,
  shouldShowUploadTaskMetaPercent,
  shouldShowUploadTaskHairline,
  canHandleUploadTaskPrimaryAction,
  getUploadTaskPrimaryActionTitle,
  handleUploadTaskPrimaryAction,
  getUploadTaskPrimaryActionIconClass,
  canDeleteUploadTask,
  handleDeleteUploadTask,
  getUploadTaskStatusText,
  uploadTaskEmptyText,
  openUploadNoticeFromPanel,
  closeUploadTaskPanel,
  getRelayTaskDriverBadge,
  handleDeleteRelayTask,
  handleBatchDeleteRelayTasks,
  getRelayPhaseLabel,
  shouldShowRelayTaskMetaPercent,
  shouldShowRelayTaskHairline,
  isRelayTaskActive,
} = props.uploadApi

const {
  filteredRelayTasks,
  runningRelayTasks,
  completedRelayTasks,
  activeRelayCount,
  getRelayStatusText,
  formatRelaySpeed,
  formatRelayPart,
} = props.relay

const taskPanelCategory = computed({
  get: () => props.uploadApi.taskPanelCategory.value,
  set: (v) => { props.uploadApi.taskPanelCategory.value = v },
})
const uploadTaskView = computed({
  get: () => props.uploadApi.uploadTaskView.value,
  set: (v) => { props.uploadApi.uploadTaskView.value = v },
})
const relayTaskView = computed({
  get: () => props.relay.relayTaskView.value,
  set: (v) => { props.relay.relayTaskView.value = v },
})
</script>

<style scoped>
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

.upload-task-panel {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(780px, calc(100vw - 48px));
  height: min(70vh, 720px);
  max-height: min(70vh, 720px);
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 14px;
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.18);
  z-index: 121;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.upload-task-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid #eef2f7;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.upload-task-panel-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.upload-task-close-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #94a3b8;
  cursor: pointer;
  font-size: 18px;
  padding: 0;
}

.upload-task-close-btn:hover {
  color: #64748b;
}

.upload-task-header-info-btn {
  width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #dbe4ee;
  border-radius: 999px;
  background: #fff;
  color: #94a3b8;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  padding: 0;
  flex-shrink: 0;
}

.upload-task-header-info-btn:hover {
  color: #64748b;
  border-color: #cbd5e1;
  background: #f8fafc;
}

.upload-task-panel-body {
  flex: 1;
  min-height: 0;
  padding: 0;
  overflow: hidden;
}

.upload-task-layout {
  display: flex;
  height: 100%;
  min-height: 0;
}

.upload-task-sidebar {
  width: 168px;
  flex-shrink: 0;
  border-right: 1px solid #eef2f7;
  padding: 18px 10px;
  background: #fbfcfe;
}

.upload-task-nav-item {
  width: 100%;
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 28px;
  align-items: center;
  column-gap: 6px;
  flex-wrap: nowrap;
  white-space: nowrap;
  border: none;
  background: transparent;
  color: #1f2937;
  border-radius: 10px;
  padding: 10px 8px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
}

.upload-task-nav-label {
  min-width: 0;
  white-space: nowrap;
  text-align: left;
}

.upload-task-nav-item.active {
  background: #f3f6fb;
}

.upload-task-nav-badge {
  justify-self: end;
  min-width: 18px;
  height: 18px;
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(76,116,223,.12);
  color: #2952cc;
  font-size: 11px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.upload-task-nav-badge.is-empty {
  visibility: hidden;
}

.upload-task-nav-icon {
  display: inline-flex;
  align-items: center;
  line-height: 0;
}

.upload-task-content {
  flex: 1;
  min-width: 0;
  min-height: 0;
  padding: 18px 20px 20px;
  display: flex;
  flex-direction: column;
}

.upload-task-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 14px;
}

.upload-task-batch-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.task-toolbar-btn {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid #dbe4ee;
  border-radius: 10px;
  background: #fff;
  color: #475569;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  transition: all 0.2s ease;
}

.task-toolbar-btn:hover:not(:disabled) {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.task-toolbar-btn.primary {
  border-color: transparent;
  background: linear-gradient(135deg, #4c74df 0%, #02a6f0 100%);
  color: #fff;
  box-shadow: 0 8px 20px rgba(2, 166, 240, 0.18);
}

.task-toolbar-btn.primary:hover:not(:disabled) {
  border-color: transparent;
  background: linear-gradient(135deg, #4167d1 0%, #0295d8 100%);
}

.task-toolbar-btn:disabled {
  cursor: not-allowed;
  color: #cbd5e1;
  background: #f8fafc;
  border-color: #e5e7eb;
  box-shadow: none;
}

.task-toolbar-btn.danger {
  border-color: transparent;
  background: linear-gradient(135deg, #ef4444 0%, #f97316 100%);
  color: #fff;
}

.task-toolbar-btn.danger:hover:not(:disabled) {
  border-color: transparent;
  background: linear-gradient(135deg, #dc2626 0%, #ea580c 100%);
}

.task-toolbar-btn.danger:not(:disabled) {
  color: #fff;
}

.upload-task-tabs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.upload-task-tab {
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  background: #fff;
  color: #64748b;
  cursor: pointer;
  font-size: 13px;
}

.upload-task-tab.active {
  color: #2563eb;
  border-color: #bfdbfe;
  background: #eff6ff;
}

.upload-task-tab-count {
  min-width: 18px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: rgba(148, 163, 184, 0.12);
  font-size: 12px;
}

.upload-task-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.upload-task-loading-state {
  flex: 1;
  min-height: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #64748b;
}

.upload-task-loading-text {
  font-size: 14px;
  color: #64748b;
}

.upload-task-item {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 10px 13px;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.upload-task-item:hover {
  background: #f5f7fb;
}

.upload-task-item.completed {
  align-items: center;
  padding: 12px 10px;
}

.upload-task-item-main {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.upload-task-item.completed .upload-task-item-main {
  align-items: center;
}

.upload-task-item.completed .upload-task-title-row {
  align-items: center;
}

.upload-task-file-icon {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  align-self: center;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  background: #f8fafc;
  font-size: 18px;
}

.upload-task-driver-badge {
  border: none;
  border-radius: 10px;
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.02em;
  box-shadow: none;
}

.upload-task-file-info {
  min-width: 0;
  flex: 1;
}

.upload-task-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.upload-task-name {
  flex: 1;
  font-size: 13px;
  color: #111827;
  font-weight: 500;
  line-height: 1.3;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-task-status {
  flex-shrink: 0;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 6px;
  background: #e5e7eb;
  color: #4b5563;
}

.upload-task-status.status-running,
.upload-task-status.status-pending {
  background: #dbeafe;
  color: #1d4ed8;
}

.upload-task-status.status-paused {
  background: #e0e7ff;
  color: #4338ca;
}

.upload-task-status.status-success {
  background: #dcfce7;
  color: #15803d;
}

.upload-task-status.status-skipped {
  background: #fef3c7;
  color: #b45309;
}

.upload-task-status.status-failed,
.upload-task-status.status-canceled {
  background: #fee2e2;
  color: #b91c1c;
}

.upload-task-path {
  margin-top: 6px;
  font-size: 12px;
  color: #6b7280;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.upload-task-progress-inner {
  height: 100%;
  background: linear-gradient(90deg, #3b82f6, #06b6d4);
  border-radius: 999px;
  transition: width 0.25s ease;
}

.upload-task-hairline {
  position: absolute;
  left: 4px;
  right: 4px;
  bottom: 7px;
  height: 3px;
  background: #e5e7eb;
  border-radius: 999px;
  overflow: hidden;
}

.upload-task-meta {
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: #475569;
  min-width: 0;
  overflow: hidden;
}

.task-phase-pill {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  height: 18px;
  border-radius: 6px;
  background: #eaf1ff;
  color: #2563eb;
  white-space: nowrap;
}

.task-phase-pill.is-download {
  background: #fff1e2;
  color: #c2410c;
}

.task-phase-pill.is-upload {
  background: #eaf1ff;
  color: #2563eb;
}

.task-phase-pill .phase-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  animation: taskPhasePulse 1.1s ease-in-out infinite;
}

@keyframes taskPhasePulse {
  0%, 100% { opacity: 0.35; transform: scale(0.75); }
  50% { opacity: 1; transform: scale(1.2); }
}

.task-chip {
  flex-shrink: 0;
  font-size: 10px;
  padding: 1px 7px;
  height: 18px;
  display: inline-flex;
  align-items: center;
  border-radius: 6px;
  background: #f1f5f9;
  color: #64748b;
  font-variant-numeric: tabular-nums;
}

.task-chip.is-speed {
  background: #eaf1ff;
  color: #2563eb;
  font-weight: 600;
}

.task-chip.is-percent {
  background: #eef2f7;
  color: #475569;
  font-weight: 600;
}

.upload-task-error {
  margin-top: 8px;
  font-size: 12px;
  color: #b91c1c;
  line-height: 1.5;
  word-break: break-all;
}

.upload-task-item-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  align-self: center;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.upload-task-item:hover .upload-task-item-actions,
.upload-task-item:focus-within .upload-task-item-actions {
  opacity: 1;
}

.task-row-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #9ca3af;
  cursor: not-allowed;
  font-size: 13px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
}

.task-row-btn:not(:disabled) {
  color: #94a3b8;
  cursor: pointer;
}

.task-row-btn:not(:disabled):hover {
  color: #64748b;
  background: #f1f5f9;
}

.task-row-btn.danger {
  color: #cbd5e1;
}

.task-row-btn.danger:not(:disabled) {
  color: #94a3b8;
}

.task-row-btn.danger:not(:disabled):hover {
  color: #64748b;
  background: #f1f5f9;
}

.task-btn-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.task-btn-icon.font-icon {
  font-size: 13px;
  line-height: 1;
}

.upload-task-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 320px;
  color: #94a3b8;
  font-size: 14px;
}
</style>
