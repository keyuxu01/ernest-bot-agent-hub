import type { DocumentAccessScope } from '../../../common/type/document-access.types';

/**
 * @description 把可选访问范围转换成 Cypher 参数；内部无范围调用保持不限制
 * @param scope DocumentAccessScope | undefined，当前用户访问范围
 * @returns object，Cypher 的 unrestricted、accessUserId、accessTeamIds 参数
 */
function toNeo4jAccessParams(scope?: DocumentAccessScope) {
  return {
    unrestricted: !scope || scope.unrestricted,
    accessUserId: scope?.userId ?? '',
    accessTeamIds: scope?.teamIds ?? [],
  };
}

/**
 * @description 生成 KnowledgeDocument 节点可见性的 Cypher 条件片段
 * @param alias string，文档节点别名，默认 d
 * @returns string，引用统一访问参数的 Cypher WHERE 表达式
 */
function neo4jDocumentAccessWhere(alias = 'd'): string {
  return (
    `($unrestricted OR ${alias}.authorId = $accessUserId ` +
    `OR ${alias}.isPublic = true OR ${alias}.teamId IN $accessTeamIds)`
  );
}

export { neo4jDocumentAccessWhere, toNeo4jAccessParams };
