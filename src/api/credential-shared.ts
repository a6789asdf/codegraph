/**
 * Credential Service 单例
 */

import { CredentialService } from './credential-service';

let _service: CredentialService | null = null;

function getService(): CredentialService {
  if (!_service) {
    _service = CredentialService.create();
  }
  return _service;
}

export const credentialService = new Proxy({} as CredentialService, {
  get(_target, prop) {
    const s = getService();
    const value = (s as any)[prop];
    return typeof value === 'function' ? value.bind(s) : value;
  },
});
