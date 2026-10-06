const ASSISTANT_DIAGNOSTIC_MESSAGE =
  'Assistant runtime is up. Tools will mount via MCP.';

/** 诊断流仍保持原来的 echo 行为；这里不包含任何模型或工具业务逻辑。 */
const createDiagnosticStreamChunks = (prompt: string): string[] => {
  const trimmed = prompt.trim() || '(empty prompt)';
  return [
    'event: status\ndata: {"phase":"started"}\n\n',
    `event: token\ndata: ${JSON.stringify({ text: `Echo from assistant runtime: ${trimmed}` })}\n\n`,
    'event: status\ndata: {"phase":"completed"}\n\n',
  ];
};

export { ASSISTANT_DIAGNOSTIC_MESSAGE, createDiagnosticStreamChunks };
