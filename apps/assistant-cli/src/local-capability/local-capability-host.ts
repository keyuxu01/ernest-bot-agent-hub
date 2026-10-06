type LocalCapabilityRequest = {
  executionId: string;
  workspaceId: string;
  capability: string;
};

/** 本地能力宿主边界；当前只定义类型，不执行 shell、patch 或文件访问。 */
interface LocalCapabilityHost {
  execute(request: LocalCapabilityRequest): Promise<unknown>;
}

export type { LocalCapabilityHost, LocalCapabilityRequest };
