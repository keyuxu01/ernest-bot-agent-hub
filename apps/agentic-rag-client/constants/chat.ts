/**
 * @description Stable AI SDK chat identity shared across persisted chat sessions.
 * The URL session parameter selects backend history while the hook instance keeps one stream.
 */
const CHAT_ID = 'kh-chat';

/**
 * @description RagBusiness AI SDK UI Message Stream endpoint path.
 * Browser requests must use the direct backend origin because Next rewrites gzip and buffer SSE chunks.
 */
const CHAT_STREAM_PATH = '/ai/chat/stream';

export { CHAT_ID, CHAT_STREAM_PATH };
