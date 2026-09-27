import { LOCAL_BUSINESS_API_BASE_URL } from '../constants/api';
import { ApiBaseUrlSchema, type ApiBaseUrl } from '../schemas/api-environment';
import type { ResolveApiBaseUrlParams } from '../types/api';

/**
 * @description Select and validate the public browser origin or private server origin for the business API.
 * @param params Runtime location and environment-provided API origins.
 * @returns A normalized absolute API origin without a trailing slash.
 */
const resolveApiBaseUrl = (params: ResolveApiBaseUrlParams): ApiBaseUrl => {
  const { isBrowser, publicBaseUrl, serverBaseUrl } = params;
  const configuredBaseUrl = isBrowser ? publicBaseUrl : (serverBaseUrl ?? publicBaseUrl);

  return ApiBaseUrlSchema.parse(configuredBaseUrl ?? LOCAL_BUSINESS_API_BASE_URL);
};

export { resolveApiBaseUrl };
