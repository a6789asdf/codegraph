/**
 * Task Manager 单例
 *
 * 用于在 API 应用内共享同一个 TaskManager 实例。
 * 首次访问时懒加载创建并执行启动恢复 + 清理临时文件。
 */

import { TaskManager } from './task-manager';
import { cleanupStaleUploads } from './source-fetcher';
import { credentialService } from './credential-shared';

let _manager: TaskManager | null = null;

function getManager(): TaskManager {
  if (!_manager) {
    _manager = TaskManager.create();
    _manager.setCredentialResolver(
      (id) => credentialService.resolveCredential(id)
    );
    _manager.recoverOnStartup();
    cleanupStaleUploads();
  }
  return _manager;
}

export const taskManager = new Proxy({} as TaskManager, {
  get(_target, prop) {
    const m = getManager();
    const value = (m as any)[prop];
    return typeof value === 'function' ? value.bind(m) : value;
  },
});
