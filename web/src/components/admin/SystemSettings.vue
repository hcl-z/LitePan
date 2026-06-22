<template>
  <div>
    <div class="settings-header">
      <div class="tab-nav">
        <button class="tab-btn" :class="{ active: currentSettingsTab === 'security' }" @click="currentSettingsTab = 'security'">
          <i class="fas fa-shield-alt"></i> 账号与安全
        </button>
        <button class="tab-btn" :class="{ active: currentSettingsTab === 'auth' }" :disabled="forcePasswordChange" @click="switchSettingsTab('auth')">
          <i class="fas fa-user-lock"></i> 认证与授权
        </button>
        <button class="tab-btn" :class="{ active: currentSettingsTab === 'webdav' }" :disabled="forcePasswordChange" @click="switchSettingsTab('webdav')">
          <i class="fas fa-cloud"></i> WebDAV设置
        </button>
        <button class="tab-btn" :class="{ active: currentSettingsTab === 'homepage' }" :disabled="forcePasswordChange" @click="switchSettingsTab('homepage')">
          <i class="fas fa-home"></i> 首页设置
        </button>
        <button class="tab-btn" :class="{ active: currentSettingsTab === 'other' }" :disabled="forcePasswordChange" @click="switchSettingsTab('other')">
          <i class="fas fa-sliders-h"></i> 其他设置
        </button>
      </div>
      <button @click="saveSettings" class="btn btn-primary" :disabled="savingSettings">
        <i class="fas fa-save"></i>
        <span v-if="savingSettings">保存中...</span>
        <span v-else>保存设置</span>
      </button>
    </div>
    
    <div v-if="currentSettingsTab === 'security'" class="settings-content">
      <form @submit.prevent="saveSettings">
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-user-shield"></i> 账户信息</div>
          <div class="group-item">
            <div class="group-label">管理员用户名</div>
            <input type="text" id="admin_username" v-model="settings.admin_username" class="group-input" required>
          </div>
          <div class="group-item">
            <div class="group-label">新密码</div>
            <input type="password" id="admin_password" v-model="newPassword" class="group-input" placeholder="留空表示不修改" autocomplete="new-password">
          </div>
          <div class="group-item">
            <div class="group-label">确认新密码</div>
            <input type="password" id="confirm_password" v-model="confirmPassword" class="group-input" :class="{'is-invalid': passwordsDoNotMatch}" placeholder="再次输入新密码" autocomplete="new-password">
          </div>
        </div>
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-shield-alt"></i> 安全设置</div>
          <div class="group-item">
            <div class="group-label">会话超时时间（小时）</div>
            <input type="number" id="session_timeout" v-model.number="settings.session_timeout" class="group-input" min="0.5" max="24" step="0.5" required>
          </div>
        </div>
      </form>
    </div>
    
    <div v-if="currentSettingsTab === 'webdav'" class="settings-content">
      <WebDAVSettings ref="webdavSettingsRef" :saving="savingSettings" />
    </div>

    <div v-if="currentSettingsTab === 'auth'" class="settings-content">
      <form @submit.prevent="saveSettings">
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-link"></i> 授权服务</div>
          <div class="group-item">
            <div class="group-label with-help">
              <span>OAuth代理服务地址</span>
              <span class="help-icon" @mouseover="oauthServerUrlTooltipVisible = true" @mouseleave="oauthServerUrlTooltipVisible = false">
                <i class="fas fa-question-circle"></i>
                <div class="tooltip" v-show="oauthServerUrlTooltipVisible">
                  <div class="tooltip-content">
                    <div class="tooltip-title">OAuth代理服务地址说明</div>
                    <div class="tooltip-body">
                      <p>用于主程序对接 OAuth 认证代理服务。</p>
                      <p>会影响相关驱动的授权、刷新和回调地址处理。</p>
                      <p>示例：<strong>https://oauth.litepan.top</strong></p>
                    </div>
                  </div>
                </div>
              </span>
            </div>
            <input type="url" id="oauth_server_url" v-model.trim="settings.oauth_server_url" class="group-input" placeholder="https://oauth.litepan.top">
          </div>
        </div>
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-sync-alt"></i> 认证刷新</div>
          <div class="group-item">
            <div class="group-label with-help">
              <span>智能主动认证刷新</span>
              <span class="help-icon" @mouseover="authActiveRefreshTooltipVisible = true" @mouseleave="authActiveRefreshTooltipVisible = false">
                <i class="fas fa-question-circle"></i>
                <div class="tooltip" v-show="authActiveRefreshTooltipVisible">
                  <div class="tooltip-content">
                    <div class="tooltip-title">主动认证刷新说明</div>
                    <div class="tooltip-body">
                      <p>程序根据各网盘过期时间提前刷新 token，减少访问时遇到认证过期的概率。</p>
                      <div class="section-title">推荐开启</div>
                      <div class="priority-item">
                        <span class="priority-dot on"></span>
                        <span class="priority-text">NAS / Docker / 服务器 24 小时常驻：token 始终健康，缓存、STRM、Emby 反代等后台任务更稳定</span>
                      </div>
                      <div class="section-title">推荐关闭</div>
                      <div class="priority-item">
                        <span class="priority-dot off"></span>
                        <span class="priority-text">桌面端临时使用、用完即关：无需后台维护 token，访问时被动刷新即可</span>
                      </div>
                      <div class="priority-item">
                        <span class="priority-dot off"></span>
                        <span class="priority-text">同一账号还在其他挂载工具或脚本里使用：避免多个程序争抢 refresh_token，尤其是 115 网盘</span>
                      </div>
                    </div>
                  </div>
                </div>
              </span>
            </div>
            <label class="inline-switch" for="auth_active_refresh_enabled">
              <input
                id="auth_active_refresh_enabled"
                v-model="settings.auth_active_refresh_enabled"
                type="checkbox"
              >
              <span class="inline-switch-slider"></span>
            </label>
          </div>
        </div>
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-robot"></i> 飞书机器人</div>
          <div class="group-item">
            <div class="group-label with-help">
              <span>启用飞书机器人</span>
              <span class="help-icon" @mouseover="feishuBotTooltipVisible = true" @mouseleave="feishuBotTooltipVisible = false">
                <i class="fas fa-question-circle"></i>
                <div class="tooltip" v-show="feishuBotTooltipVisible">
                  <div class="tooltip-content">
                    <div class="tooltip-title">飞书机器人说明</div>
                    <div class="tooltip-body">
                      <p>启用后，LitePan 会通过飞书长连接接收机器人消息，无需暴露公网回调地址。</p>
                      <p>机器人只会执行白名单群或用户发出的命令；白名单为空时会拒绝命令。</p>
                    </div>
                  </div>
                </div>
              </span>
            </div>
            <label class="inline-switch" for="feishu_bot_enabled">
              <input
                id="feishu_bot_enabled"
                v-model="settings.feishu_bot_enabled"
                type="checkbox"
              >
              <span class="inline-switch-slider"></span>
            </label>
          </div>
          <div class="group-item">
            <div class="group-label">App ID</div>
            <input
              type="text"
              id="feishu_app_id"
              v-model.trim="settings.feishu_app_id"
              class="group-input"
              placeholder="cli_xxx"
              autocomplete="off"
            >
          </div>
          <div class="group-item">
            <div class="group-label">App Secret</div>
            <div class="input-action-row">
              <input
                type="password"
                id="feishu_app_secret"
                v-model.trim="settings.feishu_app_secret"
                class="group-input"
                :placeholder="settings.feishu_app_secret_configured ? '已配置，留空表示不修改' : '飞书应用 App Secret'"
                autocomplete="new-password"
              >
              <button
                type="button"
                class="btn btn-secondary"
                :disabled="testingFeishu"
                @click="testFeishuConnection"
              >
                <i class="fas fa-plug"></i>
                <span>{{ testingFeishu ? '测试中...' : '测试连接' }}</span>
              </button>
            </div>
          </div>
          <div class="group-item">
            <div class="group-label">命令前缀</div>
            <input
              type="text"
              id="feishu_command_prefix"
              v-model.trim="settings.feishu_command_prefix"
              class="group-input"
              placeholder="/lp"
            >
          </div>
          <div class="group-item">
            <div class="group-label">允许的群 ID</div>
            <textarea
              id="feishu_allowed_chat_ids"
              v-model.trim="settings.feishu_allowed_chat_ids"
              class="group-input group-textarea"
              rows="3"
              placeholder="oc_xxx，可用逗号、分号、空格或换行分隔"
            ></textarea>
          </div>
          <div class="group-item">
            <div class="group-label">允许的用户 ID</div>
            <textarea
              id="feishu_allowed_user_ids"
              v-model.trim="settings.feishu_allowed_user_ids"
              class="group-input group-textarea"
              rows="3"
              placeholder="ou_xxx 或 user_id，可用逗号、分号、空格或换行分隔"
            ></textarea>
          </div>
        </div>
      </form>
    </div>

    <div v-if="currentSettingsTab === 'homepage'" class="settings-content">
      <form @submit.prevent="saveSettings">
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-home"></i> 首页访问</div>
          <div class="group-item">
            <div class="group-label with-help">
              <span>允许匿名访问文件列表</span>
              <span class="help-icon" @mouseover="publicIndexTooltipVisible = true" @mouseleave="publicIndexTooltipVisible = false">
                <i class="fas fa-question-circle"></i>
                <div class="tooltip" v-show="publicIndexTooltipVisible">
                  <div class="tooltip-content">
                    <div class="tooltip-title">匿名文件列表访问说明</div>
                    <div class="tooltip-body">
                      <p>开启后，访客无需登录即可访问首页并浏览文件列表。</p>
                      <p>关闭后，未登录用户访问首页会自动跳转到登录页，匿名公开接口也会同时拒绝访问。</p>
                    </div>
                  </div>
                </div>
              </span>
            </div>
            <label class="inline-switch" for="public_index_enabled">
              <input
                id="public_index_enabled"
                v-model="settings.public_index_enabled"
                type="checkbox"
              >
              <span class="inline-switch-slider"></span>
            </label>
          </div>
        </div>
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-list"></i> 首页交互</div>
          <div class="group-item">
            <div class="group-label">账号切换方式</div>
            <div
              class="mode-segment"
              role="radiogroup"
              aria-label="账号切换方式"
            >
              <button
                type="button"
                class="mode-segment-btn"
                :class="{ active: settings.index_account_switch_mode === 'dropdown' }"
                role="radio"
                :aria-checked="settings.index_account_switch_mode === 'dropdown'"
                @click="settings.index_account_switch_mode = 'dropdown'"
              >
                <i class="fas fa-list"></i>
                <span>顶部列表选择</span>
              </button>
              <button
                type="button"
                class="mode-segment-btn"
                :class="{ active: settings.index_account_switch_mode === 'floating' }"
                role="radio"
                :aria-checked="settings.index_account_switch_mode === 'floating'"
                @click="settings.index_account_switch_mode = 'floating'"
              >
                <i class="fas fa-grip-vertical"></i>
                <span>左侧悬浮按键</span>
              </button>
            </div>
          </div>
          <div class="group-item">
            <div class="group-label">主页返回方式</div>
            <div
              class="mode-segment mode-segment-three"
              role="radiogroup"
              aria-label="主页返回方式"
            >
              <button
                type="button"
                class="mode-segment-btn"
                :class="{ active: settings.admin_home_return_mode === 'sidebar' }"
                role="radio"
                :aria-checked="settings.admin_home_return_mode === 'sidebar'"
                @click="settings.admin_home_return_mode = 'sidebar'"
              >
                <i class="fas fa-bars"></i>
                <span>左侧菜单</span>
              </button>
              <button
                type="button"
                class="mode-segment-btn"
                :class="{ active: settings.admin_home_return_mode === 'top_icon' }"
                role="radio"
                :aria-checked="settings.admin_home_return_mode === 'top_icon'"
                @click="settings.admin_home_return_mode = 'top_icon'"
              >
                <i class="fas fa-house"></i>
                <span>右上角图标</span>
              </button>
              <button
                type="button"
                class="mode-segment-btn"
                :class="{ active: settings.admin_home_return_mode === 'both' }"
                role="radio"
                :aria-checked="settings.admin_home_return_mode === 'both'"
                @click="settings.admin_home_return_mode = 'both'"
              >
                <i class="fas fa-layer-group"></i>
                <span>双兼容模式</span>
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>

    <div v-if="currentSettingsTab === 'other'" class="settings-content">
      <form @submit.prevent="saveSettings">
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-upload"></i> 上传设置</div>
          <div class="group-item">
            <div class="group-label">上传任务并发数（推荐 1 - 5）</div>
            <input
              type="number"
              id="upload_task_concurrency"
              v-model.number="settings.upload_task_concurrency"
              class="group-input"
              min="1"
              max="5"
              step="1"
              required
            >
          </div>
        </div>
        <div class="settings-group">
          <div class="group-title"><i class="fas fa-file-lines"></i> 日志设置</div>
          <div class="group-item">
            <div class="group-label">日志保留天数（1 - 365）</div>
            <input
              type="number"
              id="log_retention_days"
              v-model.number="settings.log_retention_days"
              class="group-input"
              min="1"
              max="365"
              step="1"
              required
            >
          </div>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import axios from 'axios'
import WebDAVSettings from './WebDAVSettings.vue'

const props = defineProps({
  forcePasswordChange: {
    type: Boolean,
    default: false
  },
  passwordChangeReason: {
    type: String,
    default: ''
  }
})
const emit = defineEmits(['password-updated', 'settings-updated'])

// 响应式数据
const currentSettingsTab = ref('security')
const savingSettings = ref(false)
const testingFeishu = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const confirmPasswordTouched = ref(false)
const oauthServerUrlTooltipVisible = ref(false)
const publicIndexTooltipVisible = ref(false)
const authActiveRefreshTooltipVisible = ref(false)
const feishuBotTooltipVisible = ref(false)

const settings = reactive({
  admin_username: '',
  session_timeout: 2,
  oauth_server_url: 'https://oauth.litepan.top',
  public_index_enabled: true,
  index_account_switch_mode: 'dropdown',
  admin_home_return_mode: 'top_icon',
  upload_task_concurrency: 3,
  log_retention_days: 30,
  auth_active_refresh_enabled: true,
  feishu_bot_enabled: false,
  feishu_app_id: '',
  feishu_app_secret: '',
  feishu_app_secret_configured: false,
  feishu_allowed_chat_ids: '',
  feishu_allowed_user_ids: '',
  feishu_command_prefix: '/lp'
})

// 计算属性
const passwordsDoNotMatch = computed(() => {
  if (newPassword.value && confirmPassword.value) {
    return newPassword.value !== confirmPassword.value
  }
  return false
})

const switchSettingsTab = (tab) => {
  if (props.forcePasswordChange && tab !== 'security') {
    window.appNotification?.warning('请先修改管理员密码')
    currentSettingsTab.value = 'security'
    return
  }
  if (currentSettingsTab.value === 'security' && tab !== 'security') {
    newPassword.value = ''
    confirmPassword.value = ''
    confirmPasswordTouched.value = false
  }
  currentSettingsTab.value = tab
}

// 加载系统配置
const loadSystemConfig = async () => {
  try {
    const response = await axios.get('/api/admin/system-config')
    if (response.data.success) {
      const config = response.data.data
      settings.admin_username = config.admin_username || 'admin'
      settings.session_timeout = config.session_timeout || 2
      settings.oauth_server_url = config.oauth_server_url || 'https://oauth.litepan.top'
      settings.public_index_enabled = config.public_index_enabled ?? true
      settings.index_account_switch_mode = ['dropdown', 'floating'].includes(config.index_account_switch_mode)
        ? config.index_account_switch_mode
        : 'dropdown'
      settings.admin_home_return_mode = ['sidebar', 'top_icon', 'both'].includes(config.admin_home_return_mode)
        ? config.admin_home_return_mode
        : 'top_icon'
      settings.upload_task_concurrency = config.upload_task_concurrency || 3
      settings.log_retention_days = config.log_retention_days || 30
      settings.auth_active_refresh_enabled = config.auth_active_refresh_enabled ?? true
      settings.feishu_bot_enabled = config.feishu_bot_enabled ?? false
      settings.feishu_app_id = config.feishu_app_id || ''
      settings.feishu_app_secret = ''
      settings.feishu_app_secret_configured = config.feishu_app_secret_configured ?? false
      settings.feishu_allowed_chat_ids = config.feishu_allowed_chat_ids || ''
      settings.feishu_allowed_user_ids = config.feishu_allowed_user_ids || ''
      settings.feishu_command_prefix = config.feishu_command_prefix || '/lp'
      if (props.forcePasswordChange || config.must_change_password) {
        currentSettingsTab.value = 'security'
      }
    } else {
      console.error('加载配置失败:', response.data.message)
      window.appNotification.error('加载配置失败: ' + response.data.message)
    }
  } catch (error) {
    console.error('加载配置失败:', error)
    window.appNotification.error('加载配置失败: ' + error.message)
  }
}

// 组件挂载时加载配置
onMounted(() => {
  loadSystemConfig()
})


const webdavSettingsRef = ref(null)

// 保存设置
const saveSettings = async () => {
  if (props.forcePasswordChange) {
    currentSettingsTab.value = 'security'
  }
  if (currentSettingsTab.value === 'security' || currentSettingsTab.value === 'auth' || currentSettingsTab.value === 'homepage' || currentSettingsTab.value === 'other') {
    // 保存安全设置
    await saveSecuritySettings()
  } else if (currentSettingsTab.value === 'webdav') {
    // 保存WebDAV设置
    if (webdavSettingsRef.value) {
      await webdavSettingsRef.value.saveSettings()
    }
  }
}

// 保存安全设置
const saveSecuritySettings = async () => {
  if (props.forcePasswordChange && !newPassword.value) {
    window.appNotification.error('当前管理员密码需要升级，请先设置新密码')
    return
  }

  if (currentSettingsTab.value === 'security' && newPassword.value && !confirmPassword.value) {
    window.appNotification.error('请再次输入新密码进行确认')
    return
  }

  if (currentSettingsTab.value === 'security' && newPassword.value && confirmPassword.value && passwordsDoNotMatch.value) {
    window.appNotification.error("两次输入的密码不一致！")
    return
  }

  if (!Number.isInteger(settings.upload_task_concurrency) || settings.upload_task_concurrency < 1 || settings.upload_task_concurrency > 5) {
    window.appNotification.error('上传任务并发数必须是 1-5 之间的整数')
    return
  }

  if (!Number.isInteger(settings.log_retention_days) || settings.log_retention_days < 1 || settings.log_retention_days > 365) {
    window.appNotification.error('日志保留天数必须是 1-365 之间的整数')
    return
  }

  if (settings.feishu_command_prefix && !settings.feishu_command_prefix.startsWith('/')) {
    window.appNotification.error('飞书命令前缀必须以 / 开头，例如 /lp')
    return
  }

  if (settings.feishu_bot_enabled) {
    if (!settings.feishu_app_id || (!settings.feishu_app_secret && !settings.feishu_app_secret_configured)) {
      window.appNotification.error('启用飞书机器人时必须填写 App ID 和 App Secret')
      return
    }
    if (!settings.feishu_allowed_chat_ids && !settings.feishu_allowed_user_ids) {
      window.appNotification.error('启用飞书机器人时必须至少填写一个允许的群 ID 或用户 ID')
      return
    }
  }
  
  savingSettings.value = true
  try {
    const payload = { ...settings }
    delete payload.feishu_app_secret_configured
    if (newPassword.value) {
      payload.admin_password = newPassword.value
    }
    const response = await axios.post('/api/admin/update-credentials', payload)
    
    if (response.data.success) {
      const passwordUpdated = Boolean(newPassword.value)
      let successMessage = '账号与安全设置保存成功！'
      if (currentSettingsTab.value === 'auth') {
        successMessage = '认证与授权设置保存成功！'
      } else if (currentSettingsTab.value === 'homepage') {
        successMessage = '首页设置保存成功！'
      } else if (currentSettingsTab.value === 'other') {
        successMessage = '其他设置保存成功！'
      }
      window.appNotification.success(successMessage)
      newPassword.value = ''
      confirmPassword.value = ''
      confirmPasswordTouched.value = false
      await loadSystemConfig()
      if (passwordUpdated) {
        emit('password-updated')
      }
      emit('settings-updated')
    } else {
      window.appNotification.error(response.data.message || '保存失败')
    }
  } catch (error) {
    console.error('保存设置失败:', error)
    window.appNotification.error('保存失败: ' + error.message)
  } finally {
    savingSettings.value = false
  }
}

const testFeishuConnection = async () => {
  if (!settings.feishu_app_id || (!settings.feishu_app_secret && !settings.feishu_app_secret_configured)) {
    window.appNotification.error('请先填写 App ID 和 App Secret')
    return
  }
  testingFeishu.value = true
  try {
    const response = await axios.post('/api/admin/feishu/test', {
      feishu_app_id: settings.feishu_app_id,
      feishu_app_secret: settings.feishu_app_secret
    })
    if (response.data?.success) {
      window.appNotification.success(response.data.message || '飞书连接测试通过')
    } else {
      window.appNotification.error(response.data?.message || '飞书连接测试失败')
    }
  } catch (error) {
    window.appNotification.error('飞书连接测试失败: ' + (error.response?.data?.message || error.message))
  } finally {
    testingFeishu.value = false
  }
}

</script>

<style scoped>
/* 系统设置页面样式 */

/* 设置选项卡 */
.settings-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.settings-header .tab-nav {
  flex: 1;
}

.settings-header .btn {
  margin-left: 20px;
}

.tab-nav {
  display: flex;
  gap: 4px;
  background: #f8fafc;
  padding: 4px;
  border-radius: 12px;
  border: 1px solid #e2e8f0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  border: none;
  background: transparent;
  color: #64748b;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border-radius: 8px;
  transition: all 0.2s ease;
  position: relative;
}

.tab-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #3b5bdb, #1e88e5);
  color: #fff;
}

.tab-btn.active {
  background: linear-gradient(135deg, #4C74DF, #02A6F0);
  color: #fff;
  box-shadow: 0 2px 4px rgba(76, 116, 223, 0.3);
}

.tab-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 设置内容区域 */
.settings-content {
  animation: fadeInUp 0.3s ease-out;
}


@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 设置分组样式 */
.settings-group {
  background: white;
  border-radius: 12px;
  padding: 20px;
  border-left: 4px solid #4C74DF;
  margin-bottom: 24px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.group-title {
  font-size: 18px;
  font-weight: 600;
  color: #2d3748;
  margin-bottom: 20px;
  display: flex;
  align-items: center;
}

.group-title i {
  margin-right: 12px;
  color: #4C74DF;
}

.group-item {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 20px;
  align-items: center;
  padding: 12px 0;
  position: relative;
}

.group-item:not(:last-child)::after {
  content: '';
  position: absolute;
  bottom: 0;
  left: 0;
  width: 33.33%;
  height: 1px;
  background: linear-gradient(to right, 
    #e2e8f0 0%, 
    rgba(226, 232, 240, 0.8) 25%, 
    rgba(226, 232, 240, 0.6) 50%, 
    rgba(226, 232, 240, 0.4) 75%, 
    transparent 100%
  );
}

.group-label {
  font-weight: 500;
  color: #4a5568;
}

.group-label.with-help {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.help-icon {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: help;
}

.help-icon i {
  color: #94a3b8;
  font-size: 14px;
  transition: color 0.2s ease;
}

.help-icon:hover i {
  color: #4C74DF;
}

.tooltip {
  position: absolute;
  top: 50%;
  left: 25px;
  transform: translateY(-50%);
  z-index: 1000;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.12);
  padding: 0;
  min-width: 380px;
  max-width: 480px;
  color: #2d3748;
  overflow: hidden;
}

.tooltip::before {
  content: '';
  position: absolute;
  top: 50%;
  left: -7px;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 7px solid transparent;
  border-bottom: 7px solid transparent;
  border-right: 7px solid #e1e8ed;
}

.tooltip::after {
  content: '';
  position: absolute;
  top: 50%;
  left: -6px;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-right: 6px solid #ffffff;
}

.tooltip-content {
  padding: 0;
}

.tooltip-title {
  background: #f8fafc;
  color: #4C74DF;
  padding: 16px 20px;
  font-weight: 600;
  font-size: 15px;
  border-bottom: 1px solid #e2e8f0;
}

.tooltip-body {
  padding: 20px;
}

.tooltip-body p {
  margin: 0 0 16px 0;
  color: #475569;
  font-size: 14px;
  line-height: 1.6;
}

.tooltip-body p:last-child {
  margin-bottom: 0;
}

.section-title {
  color: #4C74DF;
  font-weight: 600;
  font-size: 14px;
  margin: 20px 0 12px 0;
}

.priority-item {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 4px 0;
}

.priority-item:last-child {
  margin-bottom: 0;
}

.priority-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.priority-dot.on {
  background: #10b981;
}

.priority-dot.off {
  background: #ef4444;
}

.priority-text {
  color: #475569;
  font-size: 13px;
  line-height: 1.5;
  flex: 1;
}

.group-input {
  padding: 12px 16px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  transition: all 0.2s ease;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
}

.group-input:focus {
  outline: none;
  border-color: #4C74DF;
  box-shadow: 0 0 0 2px rgba(76, 116, 223, 0.1);
}

.group-input.is-invalid {
  border-color: #ef4444 !important;
  box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.1) !important;
}

.group-textarea {
  resize: vertical;
  min-height: 88px;
  line-height: 1.5;
}

.input-action-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
}

.mode-segment {
  --segment-count: 2;
  --segment-item-width: 210px;
  display: inline-grid;
  grid-template-columns: repeat(var(--segment-count), minmax(0, var(--segment-item-width)));
  width: max-content;
  max-width: 100%;
  padding: 3px;
  gap: 3px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.mode-segment-three {
  --segment-count: 3;
}

.mode-segment-btn {
  min-height: 34px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: #64748b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
}

.mode-segment-btn:hover {
  color: #4C74DF;
  background: #eef4ff;
}

.mode-segment-btn.active {
  color: #fff;
  background: linear-gradient(135deg, #4C74DF, #02A6F0);
  box-shadow: 0 2px 6px rgba(76, 116, 223, 0.18);
}

.mode-segment-btn i {
  font-size: 13px;
}

.inline-switch {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.inline-switch input {
  display: none;
}

.inline-switch-slider {
  position: relative;
  width: 48px;
  height: 26px;
  border-radius: 999px;
  background: #cbd5e1;
  transition: background 0.2s ease;
  flex-shrink: 0;
}

.inline-switch-slider::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  transition: transform 0.2s ease;
}

.inline-switch input:checked + .inline-switch-slider {
  background: linear-gradient(135deg, #4C74DF, #02A6F0);
}

.inline-switch input:checked + .inline-switch-slider::after {
  transform: translateX(22px);
}

/* 按钮样式 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  border: none;
  border-radius: 8px;
  background: #fff;
  color: #374151;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  text-decoration: none;
  white-space: nowrap;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.btn:hover {
  background: #f8fafc;
  color: #1e293b;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
}

.btn-primary {
  background: linear-gradient(135deg, #4C74DF, #02A6F0);
  color: #fff;
  box-shadow: 0 2px 4px rgba(76, 116, 223, 0.3);
}

.btn-primary:hover {
  background: linear-gradient(135deg, #3b5bdb, #1e88e5);
  color: #fff;
  box-shadow: 0 4px 12px rgba(76, 116, 223, 0.4);
}

.btn-secondary {
  background: #f8fafc;
  color: #334155;
  border: 1px solid #e2e8f0;
}

.btn-secondary:hover {
  background: #eef2ff;
  color: #1e40af;
  border-color: #c7d2fe;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none !important;
  box-shadow: none !important;
}

/* 占位内容样式 */
.placeholder-content {
  background: #fff;
  padding: 48px;
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  text-align: center;
  color: #64748b;
}

.placeholder-icon {
  font-size: 48px;
  color: #cbd5e1;
  margin-bottom: 16px;
  display: block;
}

.placeholder-content p {
  font-size: 16px;
  margin: 0;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tab-nav {
    flex-direction: column;
    gap: 2px;
  }
  
  .tab-btn {
    justify-content: center;
    padding: 10px 16px;
  }
  
  .group-item {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .mode-segment {
    width: 100%;
    grid-template-columns: repeat(var(--segment-count), minmax(0, 1fr));
  }

  .mode-segment-btn {
    padding: 0 10px;
    font-size: 13px;
  }

  .mode-segment-three {
    grid-template-columns: 1fr;
  }

  .tooltip {
    max-width: 340px;
    left: 0;
    top: 50%;
    transform: translateY(-50%);
    min-width: 320px;
  }

  .tooltip::before {
    top: -7px;
    left: 20px;
    border-left: 7px solid transparent;
    border-right: 7px solid transparent;
    border-bottom: 7px solid #e1e8ed;
    border-top: none;
    transform: none;
  }

  .tooltip::after {
    top: -6px;
    left: 21px;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-bottom: 6px solid #ffffff;
    border-top: none;
    transform: none;
  }

  .tooltip-title {
    padding: 14px 16px;
    font-size: 14px;
  }

  .tooltip-body {
    padding: 16px;
  }
  
  .settings-header {
    flex-direction: column;
    gap: 16px;
    align-items: stretch;
  }
  
  .settings-header .btn {
    margin-left: 0;
    align-self: center;
  }
  
  .placeholder-content {
    padding: 32px 16px;
  }
  
  .placeholder-icon {
    font-size: 36px;
  }
}
</style> 
