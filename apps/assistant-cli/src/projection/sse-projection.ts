type DiagnosticStreamProjection = {
  raw: string;
  completed: boolean;
};

const initialDiagnosticStreamProjection = (): DiagnosticStreamProjection => ({
  raw: '',
  completed: false,
});

/** reducer 保持确定性，之后 Ink 和非 TTY 输出可共享同一份流状态。 */
const reduceDiagnosticStream = (
  current: DiagnosticStreamProjection,
  chunk: string,
): DiagnosticStreamProjection => ({
  raw: current.raw + chunk,
  completed:
    current.completed ||
    chunk.includes('event: status') && chunk.includes('"phase":"completed"'),
});

export type { DiagnosticStreamProjection };
export { initialDiagnosticStreamProjection, reduceDiagnosticStream };
