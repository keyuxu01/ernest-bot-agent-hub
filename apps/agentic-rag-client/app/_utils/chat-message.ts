import type {
  ChatMessage,
  ChatSource,
  KhUIMessage,
  WebSearchHit,
  WebSearchResult,
} from '../_types/knowledge-hub';

/**
 * @description Extract final citation sources from streamed UI message parts.
 * @param parts Streamed message parts.
 * @returns Citation sources emitted by the backend.
 */
const sourcesFromParts = (parts: KhUIMessage['parts']): ChatSource[] => {
  for (const part of parts) {
    if (part.type === 'data-sources' && Array.isArray(part.data)) return part.data;
  }
  return [];
};

/**
 * @description Keep only sources referenced by `[n]` markers in the answer.
 * @param sources Available citation sources.
 * @param answer Generated answer text.
 * @returns Sources actually cited by the answer.
 */
const citedSources = (sources: ChatSource[], answer: string): ChatSource[] => {
  const used = new Set([...answer.matchAll(/\[(\d+)\]/g)].map(match => Number(match[1])));
  if (!used.size) return [];
  return sources.filter(source => used.has(source.index));
};

/**
 * @description Join all text parts in a streamed UI message.
 * @param parts Streamed message parts.
 * @returns Complete visible answer text.
 */
const textFromParts = (parts: KhUIMessage['parts']): string =>
  parts
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map(part => part.text)
    .join('');

/**
 * @description Convert persisted backend messages into AI SDK UI messages.
 * @param rows Persisted session messages.
 * @returns Messages consumable by `useChat`.
 */
const historyToUIMessages = (rows: ChatMessage[]): KhUIMessage[] =>
  rows.map(row => {
    if (row.role === 'user') {
      return {
        id: row.id,
        role: 'user',
        parts: [{ type: 'text', text: row.content }],
      };
    }
    const parts: KhUIMessage['parts'] = [];
    if (row.sources?.length) parts.push({ type: 'data-sources', data: row.sources });
    parts.push({ type: 'text', text: row.content });
    return { id: row.id, role: 'assistant', parts };
  });

const parseToolPayload = (value: unknown): Record<string, unknown> | null => {
  if (typeof value === 'string') {
    try {
      return parseToolPayload(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (typeof record.content === 'string') {
    const nested = parseToolPayload(record.content);
    if (nested) return nested;
  }
  return record;
};

/**
 * @description Normalize LangChain web-search tool output into renderable data.
 * @param value Tool output, which may be JSON text or a message object.
 * @returns Normalized web-search result, or null for unsupported output.
 */
const asWebSearchResult = (value: unknown): WebSearchResult | null => {
  const record = parseToolPayload(value);
  if (!record) return null;
  return {
    query: typeof record.query === 'string' ? record.query : '',
    items: Array.isArray(record.items) ? (record.items as WebSearchHit[]) : [],
    error: typeof record.error === 'string' ? record.error : undefined,
  };
};

/**
 * @description Narrow unknown tool input to a safe key-value object.
 * @param value Unknown tool input.
 * @returns Object value or an empty object.
 */
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};

export {
  asRecord,
  asWebSearchResult,
  citedSources,
  historyToUIMessages,
  sourcesFromParts,
  textFromParts,
};
