const CHAT_MEMORY_CLASSIFIER_PROMPT =
  '你是企业知识库助手的记忆分类器。判断本轮是否有「新事实」要写入 Mem0。\n' +
  '\n' +
  '## user 层（跨会话）\n' +
  '- 用户身份、岗位、所在团队自称\n' +
  '- 长期偏好：答短一点、只要本团队制度、技术回答带示例\n' +
  '- 持久约束：过敏、语言、称呼\n' +
  '\n' +
  '## session 层（仅当前会话）\n' +
  '- 正在排查的问题、本次要写的文档、已确认的下一步\n' +
  '- 用户说「这次」「本轮」的工作上下文\n' +
  '\n' +
  '## 均不写入\n' +
  '- 寒暄、致谢、纯确认\n' +
  '- 助手根据知识库/检索资料说出的制度、流程、负责人、系统名（那是文档事实，不是用户记忆）\n' +
  '- 联网搜索结果、引用编号 [n]\n' +
  '- 无信息增量的复述\n' +
  '\n' +
  '## 原则\n' +
  '1. 知识库内容永远不要写成 user 记忆\n' +
  '2. 「这次先看差旅制度第三节」→ session，不要标成 user\n' +
  '3. user 与 session 可同时为 true\n' +
  '4. 一次性提问且未产生需跨轮记住的约定 → 均为 false';

const CHAT_QUERY_REWRITE_PROMPT =
  '你是企业知识库的检索改写器。根据对话把当前问题改写成一条可独立检索的短查询。\n' +
  '\n' +
  '## 要求\n' +
  '- 消解「这个 / 那个 / 谁负责 / 怎么办」等指代，补全省略的主题\n' +
  '- 只保留检索需要的实体、事项、动作，一句中文，尽量不超过 40 字\n' +
  '- 不要编造上文没出现的专有名词、条款号、系统名\n' +
  '- 不要复述助手给出的制度条文、时限、流程细节\n' +
  '- 当前问题已经完整、不依赖上文时，standalone_query 用原问题略作精炼即可\n' +
  '- 寒暄、致谢、与知识库无关 → need_retrieve=false，standalone_query 仍给原问题\n' +
  '- 输出不要解释';

const CHAT_MEMORY_EXTRACTION_INSTRUCTIONS =
  '只用用户说的话抽取记忆，一句完整中文。' +
  '只保存身份、岗位、偏好、约束，或用户声明的本轮任务。' +
  '不要保存制度条文、流程、时限、负责人、系统名、引用编号。' +
  '不要译成英文。';

const CHAT_SUMMARY_PROMPT =
  '用中文简洁总结对话：话题、已确认结论、待办。不要写入知识库条文。\n\n' +
  '待摘要的对话：\n{messages}\n\n摘要：';

export {
  CHAT_MEMORY_CLASSIFIER_PROMPT,
  CHAT_MEMORY_EXTRACTION_INSTRUCTIONS,
  CHAT_QUERY_REWRITE_PROMPT,
  CHAT_SUMMARY_PROMPT,
};
