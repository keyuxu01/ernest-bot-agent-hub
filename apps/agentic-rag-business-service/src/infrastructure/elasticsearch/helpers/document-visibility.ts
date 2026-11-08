import type { DocumentAccessScope } from '../../../common/type/document-access.types';

const ES_CHUNK_VISIBILITY_FIELDS = {
  isPublic: 'is_public',
  authorId: 'author_id',
  teamId: 'team_id',
} as const;

const ES_DOCUMENT_VISIBILITY_FIELDS = {
  isPublic: 'isPublic',
  authorId: 'authorId',
  teamId: 'teamId',
} as const;

/**
 * @description 构建 ES 可见性 filter：公开文档、本人文档、本人团队文档取并集；不限制用户返回 null
 * @param scope DocumentAccessScope，当前用户访问范围
 * @param fields object，目标索引的公开、作者、团队字段名
 * @returns Record<string, unknown> | null，ES bool filter；不限制时为 null
 */
function buildEsVisibilityFilter(
  scope: DocumentAccessScope,
  fields: { isPublic: string; authorId: string; teamId: string },
): Record<string, unknown> | null {
  if (scope.unrestricted) return null;
  const should: Record<string, unknown>[] = [
    { term: { [fields.isPublic]: true } },
    { term: { [fields.authorId]: scope.userId } },
  ];
  if (scope.teamIds.length) {
    should.push({ terms: { [fields.teamId]: scope.teamIds } });
  }
  return { bool: { should, minimum_should_match: 1 } };
}

/**
 * @description 将相关性查询放入 must、可见性放入 filter，避免权限条件影响得分
 * @param query Record<string, unknown>，原始相关性查询
 * @param filter Record<string, unknown> | null，可见性过滤条件
 * @returns Record<string, unknown>，组合后的 ES 查询
 */
function wrapEsQueryWithVisibility(
  query: Record<string, unknown>,
  filter: Record<string, unknown> | null,
): Record<string, unknown> {
  if (!filter) return query;
  return { bool: { must: [query], filter: [filter] } };
}

export {
  buildEsVisibilityFilter,
  ES_CHUNK_VISIBILITY_FIELDS,
  ES_DOCUMENT_VISIBILITY_FIELDS,
  wrapEsQueryWithVisibility,
};
