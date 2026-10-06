/**
 * 操作系统凭证库端口。具体 Keychain/Secret Service 适配器在身份任务中实现，
 * 业务层不能回退到仓库文件或普通环境日志。
 */
interface CredentialStore {
  get(name: string): Promise<string | null>;
  set(name: string, value: string): Promise<void>;
  delete(name: string): Promise<void>;
}

export type { CredentialStore };
