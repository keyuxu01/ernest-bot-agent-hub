/**
 * @description 将百炼兼容接口的 reasoning_content 映射成 @ai-sdk/langchain 识别的 reasoning.summary
 * @param stream AsyncIterable<unknown>，LangChain Agent 原始事件流
 * @returns AsyncIterable<unknown>，原事件流，事件对象已就地补充 reasoning.summary
 */
async function* mapReasoningStream(
  stream: AsyncIterable<unknown>,
): AsyncIterable<unknown> {
  for await (const event of stream) {
    attachDashScopeReasoning(event);
    yield event;
  }
}

/**
 * @description 递归查找 additional_kwargs.reasoning_content 并补充 AI SDK 所需结构，使用 seen 防止循环引用
 * @param value unknown，当前事件或嵌套值
 * @param seen Set<object>，已访问对象集合
 * @returns void，直接修改命中的 additional_kwargs
 */
function attachDashScopeReasoning(
  value: unknown,
  seen = new Set<object>(),
): void {
  if (value == null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);

  if (Array.isArray(value)) {
    for (const item of value) attachDashScopeReasoning(item, seen);
    return;
  }

  const object = value as Record<string, unknown>;
  const kwargs = object.additional_kwargs as
    Record<string, unknown> | undefined;
  if (
    typeof kwargs?.reasoning_content === 'string' &&
    kwargs.reasoning_content
  ) {
    kwargs.reasoning = {
      summary: [{ type: 'summary_text', text: kwargs.reasoning_content }],
    };
  }

  attachDashScopeReasoning(object.chunk, seen);
  attachDashScopeReasoning(object.data, seen);
  attachDashScopeReasoning(object.kwargs, seen);
  attachDashScopeReasoning(object.messages, seen);
}

export { mapReasoningStream };
