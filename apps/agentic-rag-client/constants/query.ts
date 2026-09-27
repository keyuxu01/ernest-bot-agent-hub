/**
 * @description Default period in milliseconds during which browser query data remains fresh.
 * A short non-zero window prevents immediate duplicate requests while keeping interactive data current.
 */
const DEFAULT_QUERY_STALE_TIME_MS = 30_000;

/**
 * @description Default retry policy for browser queries.
 * Automatic retries stay disabled until individual operations define an explicit safe retry policy.
 */
const DEFAULT_QUERY_RETRY_ENABLED = false;

export { DEFAULT_QUERY_RETRY_ENABLED, DEFAULT_QUERY_STALE_TIME_MS };
