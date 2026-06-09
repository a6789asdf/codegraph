<template>
  <a-drawer
    :open="visible"
    title="凭证管理"
    :width="520"
    :destroyOnClose="false"
    @close="handleClose"
  >
    <div v-if="!showForm" key="list">
      <a-space style="margin-bottom: 16px; width: 100%; justify-content: space-between">
        <span class="hint-text">共 {{ credentialStore.credentials.length }} 个凭证</span>
        <a-button type="primary" size="small" @click="startCreate">
          <template #icon><plus-outlined /></template>
          新建凭证
        </a-button>
      </a-space>

      <a-list
        :dataSource="credentialStore.credentials"
        :loading="credentialStore.loading"
        :locale="{ emptyText: '暂无凭证，点击上方按钮新建' }"
      >
        <template #renderItem="{ item }">
          <a-list-item>
            <a-list-item-meta>
              <template #title>
                <a-space>
                  <a-tag :color="item.type === 'https' ? 'blue' : 'green'">
                    {{ item.type.toUpperCase() }}
                  </a-tag>
                  {{ item.name }}
                </a-space>
              </template>
              <template #description>
                <span v-if="item.username">用户: {{ item.username }}</span>
                <span v-if="item.type === 'ssh' && item.has_passphrase">
                  {{ item.username ? ' · ' : '' }}含 passphrase
                </span>
                <span v-if="item.last_used_at">
                  {{ item.username || item.has_passphrase ? ' · ' : '' }}
                  最近使用: {{ formatDate(item.last_used_at) }}
                </span>
              </template>
            </a-list-item-meta>
            <template #actions>
              <a-button type="link" size="small" @click="startEdit(item)">编辑</a-button>
              <a-popconfirm
                title="删除后不影响已完成任务，但使用此凭证的进行中任务会失败"
                ok-text="确认删除"
                cancel-text="取消"
                @confirm="handleDelete(item.id)"
              >
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </template>
          </a-list-item>
        </template>
      </a-list>
    </div>

    <div v-else key="form">
      <a-form layout="vertical" :model="form" @finish="handleSave">
        <a-form-item
          label="凭证名称"
          name="name"
          :rules="[{ required: true, message: '请输入凭证名称' }, { max: 50, message: '最多50字符' }]"
        >
          <a-input v-model:value="form.name" placeholder="如: GitHub-个人" />
        </a-form-item>

        <a-form-item label="凭证类型" name="type" :rules="[{ required: true }]">
          <a-radio-group v-model:value="form.type" @change="onTypeChange">
            <a-radio-button value="https">HTTPS Token</a-radio-button>
            <a-radio-button value="ssh">SSH Key</a-radio-button>
          </a-radio-group>
        </a-form-item>

        <template v-if="form.type === 'https'">
          <a-form-item label="用户名（可选）" name="username">
            <a-input v-model:value="form.username" placeholder="默认: token" />
          </a-form-item>
          <a-form-item
            label="Token / 密码"
            name="secret"
            :rules="[{ required: !editingId, message: '请输入 Token' }]"
          >
            <a-input-password
              v-model:value="form.secret"
              :placeholder="editingId ? '（不修改则留空）' : 'ghp_xxxxxxxxxxxx'"
            />
          </a-form-item>
        </template>

        <template v-if="form.type === 'ssh'">
          <a-form-item
            label="私钥内容"
            name="secret"
            :rules="[{ required: !editingId, message: '请粘贴私钥内容' }]"
          >
            <a-textarea
              v-model:value="form.secret"
              :rows="6"
              :placeholder="editingId ? '（不修改则留空）\n-----BEGIN OPENSSH PRIVATE KEY-----\n...' : '粘贴 SSH 私钥内容'"
            />
          </a-form-item>
          <a-form-item label="Passphrase（可选）" name="passphrase">
            <a-input-password
              v-model:value="form.passphrase"
              placeholder="无"
            />
          </a-form-item>
        </template>

        <a-form-item style="margin-top: 24px">
          <a-space>
            <a-button type="primary" html-type="submit" :loading="saving">
              {{ editingId ? '保存修改' : '创建凭证' }}
            </a-button>
            <a-button @click="showForm = false">取消</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </div>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import { PlusOutlined } from '@ant-design/icons-vue'
import { useCredentialStore } from '@/stores/credential'
import type { CredentialMeta } from '@/api/credential'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', val: boolean): void }>()

const credentialStore = useCredentialStore()
const showForm = ref(false)
const editingId = ref<string | null>(null)
const saving = ref(false)

const form = reactive({
  name: '',
  type: 'https' as 'https' | 'ssh',
  username: '',
  secret: '',
  passphrase: '',
})

watch(() => props.visible, (val) => {
  if (val) {
    credentialStore.fetchCredentials()
    showForm.value = false
    editingId.value = null
  }
})

function handleClose() {
  emit('update:visible', false)
}

function resetForm() {
  form.name = ''
  form.type = 'https'
  form.username = ''
  form.secret = ''
  form.passphrase = ''
}

function onTypeChange() {
  form.username = ''
  form.secret = ''
  form.passphrase = ''
}

function startCreate() {
  resetForm()
  editingId.value = null
  showForm.value = true
}

function startEdit(cred: CredentialMeta) {
  editingId.value = cred.id
  form.name = cred.name
  form.type = cred.type
  form.username = cred.username || ''
  form.secret = ''
  form.passphrase = ''
  showForm.value = true
}

async function handleSave() {
  saving.value = true
  try {
    if (editingId.value) {
      const patch: any = { name: form.name, type: form.type, username: form.username || undefined }
      if (form.secret) patch.secret = form.secret
      if (form.passphrase !== undefined && form.passphrase !== '') {
        patch.passphrase = form.passphrase
      } else if (form.type === 'ssh' && form.passphrase === '') {
        patch.passphrase = ''
      }
      await credentialStore.updateCredential(editingId.value, patch)
      message.success('凭证已更新')
    } else {
      await credentialStore.createCredential({
        name: form.name,
        type: form.type,
        username: form.username || undefined,
        secret: form.secret,
        passphrase: form.passphrase || undefined,
      })
      message.success('凭证已创建')
    }
    showForm.value = false
  } catch (err: any) {
    message.error(err.response?.data?.error || err.message || '操作失败')
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await credentialStore.removeCredential(id)
    message.success('凭证已删除')
  } catch (err: any) {
    message.error(err.response?.data?.error || err.message || '删除失败')
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style scoped>
.hint-text {
  color: rgba(0, 0, 0, 0.45);
  font-size: 13px;
}
</style>
