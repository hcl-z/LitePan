import { ref, computed, onUnmounted } from 'vue'
import axios from 'axios'

export function useCrossRelayTasks() {
  const relayTasks = ref([])
  const relayTaskView = ref('running')
  let relayPollingTimer = null
  let relayEventSource = null
  let relaySseReconnectTimer = null

  const runningRelayTasks = computed(() => {
    return relayTasks.value.filter(task => ['pending', 'running'].includes(task.status))
  })

  const completedRelayTasks = computed(() => {
    return relayTasks.value.filter(task => ['success', 'failed', 'canceled'].includes(task.status))
  })

  const filteredRelayTasks = computed(() => {
    return relayTaskView.value === 'completed' ? completedRelayTasks.value : runningRelayTasks.value
  })

  const activeRelayCount = computed(() => runningRelayTasks.value.length)

  const applyRelayTasks = (tasks) => {
    relayTasks.value = Array.isArray(tasks) ? tasks : []
  }

  const fetchRelayTasks = async () => {
    try {
      const response = await axios.get('/api/cross-transfer/relay/tasks')
      if (response.data?.success) {
        applyRelayTasks(response.data.data || [])
      }
    } catch (error) {
      console.error('获取跨盘任务失败:', error)
    }
  }

  const stopRelayPolling = () => {
    if (relayPollingTimer) {
      clearInterval(relayPollingTimer)
      relayPollingTimer = null
    }
  }

  const startRelayPolling = () => {
    if (relayPollingTimer) return
    relayPollingTimer = window.setInterval(() => {
      fetchRelayTasks()
    }, 4000)
  }

  const clearRelaySseReconnectTimer = () => {
    if (relaySseReconnectTimer) {
      clearTimeout(relaySseReconnectTimer)
      relaySseReconnectTimer = null
    }
  }

  const disconnectRelayStream = () => {
    clearRelaySseReconnectTimer()
    if (relayEventSource) {
      relayEventSource.close()
      relayEventSource = null
    }
  }

  const scheduleRelayStreamReconnect = (panelOpen) => {
    if (!panelOpen || relaySseReconnectTimer) return
    relaySseReconnectTimer = window.setTimeout(() => {
      relaySseReconnectTimer = null
      connectRelayStream(panelOpen)
    }, 3000)
  }

  const connectRelayStream = (panelOpen) => {
    if (!panelOpen || relayEventSource) return
    if (typeof window === 'undefined' || !window.EventSource) {
      startRelayPolling()
      return
    }
    try {
      const eventSource = new window.EventSource('/api/cross-transfer/relay/tasks/stream')
      relayEventSource = eventSource
      eventSource.addEventListener('tasks', (event) => {
        try {
          const payload = JSON.parse(event.data || '{}')
          applyRelayTasks(payload.tasks || [])
        } catch (error) {
          console.error('处理跨盘任务SSE失败:', error)
        }
      })
      eventSource.addEventListener('ping', () => {})
      eventSource.onopen = () => {
        stopRelayPolling()
        clearRelaySseReconnectTimer()
      }
      eventSource.onerror = () => {
        disconnectRelayStream()
        startRelayPolling()
        scheduleRelayStreamReconnect(panelOpen)
      }
    } catch (error) {
      console.error('建立跨盘任务SSE失败:', error)
      startRelayPolling()
      scheduleRelayStreamReconnect(panelOpen)
    }
  }

  const openRelayMonitoring = async (panelOpenRef) => {
    await fetchRelayTasks()
    connectRelayStream(panelOpenRef?.value ?? true)
    if (!relayEventSource) startRelayPolling()
  }

  const closeRelayMonitoring = () => {
    disconnectRelayStream()
    stopRelayPolling()
  }

  const batchDeleteRelayTasks = async (taskIds) => {
    if (!taskIds.length) return 0
    const response = await axios.post('/api/cross-transfer/relay/tasks/batch-delete', { task_ids: taskIds })
    if (response.data?.success) {
      await fetchRelayTasks()
      return response.data.data?.removed || 0
    }
    throw new Error(response.data?.message || '删除跨盘任务失败')
  }

  const getRelayStatusText = (task) => {
    const status = String(task?.status || '')
    if (status === 'success') return '已完成'
    if (status === 'failed') return '失败'
    if (status === 'canceled') return '已取消'
    if (task?.phase === 'downloading') return '下载中'
    if (task?.phase === 'uploading') return '上传中'
    return '等待中'
  }

  const formatRelaySpeed = (task) => {
    const speed = Number(task?.speed_bytes_per_second || 0)
    if (speed <= 0) return ''
    if (speed < 1024) return `${speed.toFixed(0)} B/s`
    if (speed < 1024 * 1024) return `${(speed / 1024).toFixed(1)} KB/s`
    return `${(speed / 1024 / 1024).toFixed(2)} MB/s`
  }

  const formatRelayPart = (task) => {
    if (task?.phase !== 'uploading') return ''
    const m = String(task?.message || '').match(/分片[（(]\s*(\d+)\s*\/\s*(\d+)\s*[)）]/)
    return m ? `分片 ${m[1]}/${m[2]}` : ''
  }

  onUnmounted(() => {
    closeRelayMonitoring()
  })

  return {
    relayTasks,
    relayTaskView,
    runningRelayTasks,
    completedRelayTasks,
    filteredRelayTasks,
    activeRelayCount,
    fetchRelayTasks,
    openRelayMonitoring,
    closeRelayMonitoring,
    connectRelayStream,
    disconnectRelayStream,
    batchDeleteRelayTasks,
    getRelayStatusText,
    formatRelaySpeed,
    formatRelayPart,
  }
}
