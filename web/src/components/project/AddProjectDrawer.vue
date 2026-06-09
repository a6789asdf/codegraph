<template>
  <a-drawer
    :open="visible"
    title="添加项目"
    :width="520"
    :destroyOnClose="true"
    @close="handleClose"
  >
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="git" tab="Git 仓库">
        <a-form layout="vertical" :model="gitForm" @finish="handleGitSubmit">
          <a-form-item
            label="所属系统"
            name="systemId"
            :rules="[{ required: true, message: '请选择所属系统' }]"
          >
            <a-select v-model:value="gitForm.systemId" placeholder="选择系统">
              <a-select-option v-for="sys in projectStore.systems" :key="sys.id" :value="sys.id">
                {{ sys.name }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item
            label="项目名称"
            name="name"
            :rules="[
              { required: true, message: '请输入项目名称' },
              { pattern: /^[a-zA-Z0-9_-]{3,50}$/, message: '3-50字符，仅允许字母、数字、下划线、连字符' },
            ]"
          >
            <a-input v-model:value="gitForm.name" placeholder="my-project" />
          </a-form-item>

          <a-form-item
            label="Git URL"
            name="url"
            :rules="[
              { required: true, message: '请输入 Git URL' },
              { pattern: /^(https?:\/\/|git@|ssh:\/\/)/, message: '请输入有效的 Git URL（https://、git@、ssh://）' },
            ]"
          >
            <a-input v-model:value="gitForm.url" placeholder="https://github.com/user/repo.git" />
          </a-form-item>

          <a-form-item label="分支（可选）" name="branch">
            <a-input v-model:value="gitForm.branch" placeholder="main" />
          </a-form-item>

          <a-form-item label="访问凭证" name="credentialId">
            <a-space style="display: flex">
              <a-select
                v-model:value="gitForm.credentialId"
                placeholder="无凭证（公开仓库）"
                allowClear
                style="flex: 1"
              >
                <a-select-option
                  v-for="cred in credentialStore.credentials"
                  :key="cred.id"
                  :value="cred.id"
                >
                  <a-tag :color="cred.type === 'https' ? 'blue' : 'green'">
                    {{ cred.type.toUpperCase() }}
                  </a-tag>
                  {{ cred.name }}
                </a-select-option>
              </a-select>
              <a-button type="link" @click="$emit('openCredential')">管理</a-button>
            </a-space>
          </a-form-item>

          <a-collapse :bordered="false" class="advanced-collapse">
            <a-collapse-panel key="1" header="高级选项">
              <a-form-item label="存放路径（覆盖默认）" name="targetPath">
                <a-input v-model:value="gitForm.targetPath" placeholder="默认: ~/.codegraph/repos/<项目名>" />
              </a-form-item>
            </a-collapse-panel>
          </a-collapse>

          <a-form-item style="margin-top: 24px">
            <a-button type="primary" html-type="submit" :loading="submitting" block>
              开始拉取并建图
            </a-button>
          </a-form-item>
        </a-form>
      </a-tab-pane>

      <a-tab-pane key="upload" tab="上传压缩包">
        <a-form layout="vertical" :model="uploadForm" @finish="handleUploadSubmit">
          <a-form-item
            label="所属系统"
            name="systemId"
            :rules="[{ required: true, message: '请选择所属系统' }]"
          >
            <a-select v-model:value="uploadForm.systemId" placeholder="选择系统">
              <a-select-option v-for="sys in projectStore.systems" :key="sys.id" :value="sys.id">
                {{ sys.name }}
              </a-select-option>
            </a-select>
          </a-form-item>

          <a-form-item
            label="项目名称"
            name="name"
            :rules="[
              { required: true, message: '请输入项目名称' },
              { pattern: /^[a-zA-Z0-9_-]{3,50}$/, message: '3-50字符，仅允许字母、数字、下划线、连字符' },
            ]"
          >
            <a-input v-model:value="uploadForm.name" placeholder="my-project" />
          </a-form-item>

          <a-form-item
            label="代码压缩包"
            name="file"
            :rules="[{ required: true, message: '请上传文件' }]"
          >
            <a-upload-dragger
              :beforeUpload="handleBeforeUpload"
              :maxCount="1"
              accept=".zip,.tar.gz,.tgz"
              :fileList="fileList"
              @remove="handleRemoveFile"
            >
              <p class="ant-upload-drag-icon">
                <inbox-outlined />
              </p>
              <p class="ant-upload-text">点击或拖拽文件到此区域</p>
              <p class="ant-upload-hint">支持 .zip、.tar.gz、.tgz，最大 500MB</p>
            </a-upload-dragger>
          </a-form-item>

          <a-collapse :bordered="false" class="advanced-collapse">
            <a-collapse-panel key="1" header="高级选项">
              <a-form-item label="存放路径（覆盖默认）" name="targetPath">
                <a-input v-model:value="uploadForm.targetPath" placeholder="默认: ~/.codegraph/repos/<项目名>" />
              </a-form-item>
            </a-collapse-panel>
          </a-collapse>

          <a-form-item style="margin-top: 24px">
            <a-button type="primary" html-type="submit" :loading="submitting" block>
              开始解压并建图
            </a-button>
          </a-form-item>
        </a-form>
      </a-tab-pane>
    </a-tabs>
  </a-drawer>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import { InboxOutlined } from '@ant-design/icons-vue'
import { useTaskStore } from '@/stores/task'
import { useProjectStore } from '@/stores/project'
import { useCredentialStore } from '@/stores/credential'
import type { UploadFile } from 'ant-design-vue'

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{
  (e: 'update:visible', val: boolean): void
  (e: 'created'): void
  (e: 'openCredential'): void
}>()

const taskStore = useTaskStore()
const projectStore = useProjectStore()
const credentialStore = useCredentialStore()
const activeTab = ref('git')
const submitting = ref(false)
const fileList = ref<UploadFile[]>([])
const uploadedFile = ref<File | null>(null)

const gitForm = reactive({
  systemId: '',
  name: '',
  url: '',
  branch: '',
  targetPath: '',
  credentialId: undefined as string | undefined,
})

const uploadForm = reactive({
  systemId: '',
  name: '',
  targetPath: '',
})

watch(() => props.visible, (val) => {
  if (val) {
    if (projectStore.currentSystemId) {
      gitForm.systemId = projectStore.currentSystemId
      uploadForm.systemId = projectStore.currentSystemId
    }
    credentialStore.fetchCredentials()
  }
})

function handleClose() {
  emit('update:visible', false)
  resetForms()
}

function resetForms() {
  gitForm.systemId = ''
  gitForm.name = ''
  gitForm.url = ''
  gitForm.branch = ''
  gitForm.targetPath = ''
  gitForm.credentialId = undefined
  uploadForm.systemId = ''
  uploadForm.name = ''
  uploadForm.targetPath = ''
  fileList.value = []
  uploadedFile.value = null
}

function handleBeforeUpload(file: File) {
  const maxSize = 500 * 1024 * 1024
  if (file.size > maxSize) {
    message.error('文件过大，最大 500MB')
    return false
  }
  uploadedFile.value = file
  fileList.value = [{ uid: '-1', name: file.name, status: 'done', size: file.size } as UploadFile]
  return false
}

function handleRemoveFile() {
  uploadedFile.value = null
  fileList.value = []
}

async function handleGitSubmit() {
  submitting.value = true
  try {
    await taskStore.createCloneTask({
      name: gitForm.name,
      url: gitForm.url,
      branch: gitForm.branch || undefined,
      targetPath: gitForm.targetPath || undefined,
      systemId: gitForm.systemId,
      credentialId: gitForm.credentialId || undefined,
    })
    message.success('任务已创建，正在后台拉取代码并建图')
    emit('created')
    handleClose()
  } catch (err: any) {
    message.error(err.message || '创建任务失败')
  } finally {
    submitting.value = false
  }
}

async function handleUploadSubmit() {
  if (!uploadedFile.value) {
    message.error('请上传文件')
    return
  }
  submitting.value = true
  try {
    const formData = new FormData()
    formData.append('name', uploadForm.name)
    formData.append('systemId', uploadForm.systemId)
    formData.append('file', uploadedFile.value)
    if (uploadForm.targetPath) {
      formData.append('targetPath', uploadForm.targetPath)
    }
    await taskStore.createUploadTask(formData)
    message.success('任务已创建，正在后台解压并建图')
    emit('created')
    handleClose()
  } catch (err: any) {
    message.error(err.message || '创建任务失败')
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.advanced-collapse {
  background: transparent;
  margin-bottom: 8px;
}
.advanced-collapse :deep(.ant-collapse-header) {
  padding: 8px 0;
  font-size: 13px;
  color: rgba(0, 0, 0, 0.45);
}
.advanced-collapse :deep(.ant-collapse-content-box) {
  padding: 0 0 8px 0;
}
</style>
