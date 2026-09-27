/**
 * @description Local business-service origin used when no environment-specific API origin is configured.
 * The browser calls this origin directly during local development instead of using a Next.js rewrite.
 */
const LOCAL_BUSINESS_API_BASE_URL = 'http://localhost:8080';

export { LOCAL_BUSINESS_API_BASE_URL };
