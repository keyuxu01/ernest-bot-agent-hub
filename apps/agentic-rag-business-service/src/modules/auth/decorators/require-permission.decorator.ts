import { SetMetadata } from '@nestjs/common';

const PERMISSIONS_KEY = 'permissions';

/**
 * @description 接口装饰器：给方法或类贴上「需要的权限码」标签，由 PermissionsGuard 读取并校验；
 * 用户拥有其中任意一个即可，ROLE_ADMIN 自动放行
 * @param permissions string[]，可变参数，权限编码列表，如 @RequirePermission('system:team')
 * @returns CustomDecorator<string>，Nest 元数据装饰器（键名 PERMISSIONS_KEY = 'permissions'）
 */
const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);

export { PERMISSIONS_KEY, RequirePermission };
