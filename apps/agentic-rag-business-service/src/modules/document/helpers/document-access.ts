import type { DocumentAccessScope } from '../../../common/type/document-access.types';
import { RoleCode } from '../../user/constants/user.constants';
import type { AuthUser } from '../../user/type/user.types';
import {
  DocumentStatus,
  type DocumentEntity,
} from '../entities/document.entity';

/**
 * @description 从当前用户生成统一文档访问范围；管理员和审核员不限制，其余用户携带本人及团队 ID
 * @param user AuthUser，当前登录用户
 * @returns DocumentAccessScope，跨存储执行的访问范围
 */
function accessFromUser(user: AuthUser): DocumentAccessScope {
  const roles = user.roles ?? [];
  return {
    unrestricted:
      roles.includes(RoleCode.ADMIN) || roles.includes(RoleCode.REVIEWER),
    userId: user.userId,
    teamIds: user.teamIds ?? [],
  };
}

/**
 * @description 判断当前范围能否读取文档：作者始终可读；其他普通用户只可读已发布的公开或本团队文档
 * @param document Pick<DocumentEntity, 'authorId' | 'teamId' | 'isPublic' | 'status'>，待判断文档
 * @param scope DocumentAccessScope，当前用户访问范围
 * @returns boolean，允许读取时为 true
 */
function canReadDocument(
  document: Pick<DocumentEntity, 'authorId' | 'teamId' | 'isPublic' | 'status'>,
  scope: DocumentAccessScope,
): boolean {
  if (scope.unrestricted) return true;
  if (document.authorId && document.authorId === scope.userId) return true;
  if (document.status !== DocumentStatus.Published) return false;
  if (document.isPublic) return true;
  return Boolean(document.teamId && scope.teamIds.includes(document.teamId));
}

/**
 * @description 判断用户能否修改文档：管理员可修改全部，普通用户和审核员只能修改本人文档
 * @param document Pick<DocumentEntity, 'authorId'>，待修改文档
 * @param user AuthUser，当前登录用户
 * @returns boolean，允许修改时为 true
 */
function canWriteDocument(
  document: Pick<DocumentEntity, 'authorId'>,
  user: AuthUser,
): boolean {
  if (user.roles?.includes(RoleCode.ADMIN)) return true;
  return Boolean(document.authorId && document.authorId === user.userId);
}

export { accessFromUser, canReadDocument, canWriteDocument };
