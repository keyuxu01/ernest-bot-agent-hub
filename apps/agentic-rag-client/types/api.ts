/**
 * @description Inputs used to select the correct business API origin for a server or browser runtime.
 */
type ResolveApiBaseUrlParams = {
  isBrowser: boolean;
  publicBaseUrl?: string;
  serverBaseUrl?: string;
};

export type { ResolveApiBaseUrlParams };
