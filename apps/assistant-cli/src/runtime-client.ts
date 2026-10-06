// 兼容已有导入路径；网络实现统一放在 transport 边界。
export {
  DEFAULT_RUNTIME_URL,
  createRuntimeRequestMetadata,
  pingRuntime,
  resolveRuntimeBaseUrl,
  streamRuntime,
} from './transport/runtime-client';
export type { RuntimeRequestMetadata } from './transport/runtime-client';
