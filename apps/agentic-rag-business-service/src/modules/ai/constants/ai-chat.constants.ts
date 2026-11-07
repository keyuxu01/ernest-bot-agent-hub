/** 溯源摘录最大字数 */
const EXCERPT_LEN = 200;

/** 拼进 prompt 的单块正文最大字数 */
const CONTEXT_SNIPPET_LEN = 800;

/** 回答里的引用编号，如 [1]、[12] */
const CITATION_RE = /\[(\d+)\]/g;

/** RAG 问答系统提示词：只按资料回答，并用 [n] 标注出处 */
const RAG_ANSWER_SYSTEM_PROMPT =
  '你是企业知识库助手。只根据「检索到的资料」回答用户问题。' +
  '若资料不足以回答，明确说不知道，不要编造。' +
  '凡是依据某条资料作出的陈述，必须在句末标注对应编号，如 [1]、[2]。' +
  '编号必须与资料列表一致，不要标注未使用的编号，不要编造文档标题或链接。' +
  '回答简洁，必要时列出条目。';

export {
  CITATION_RE,
  CONTEXT_SNIPPET_LEN,
  EXCERPT_LEN,
  RAG_ANSWER_SYSTEM_PROMPT,
};
