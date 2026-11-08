type WebSearchHit = {
  title: string;
  url: string;
  snippet: string;
  siteName?: string;
};

type WebSearchResult = {
  query: string;
  items: WebSearchHit[];
  error?: string;
};

export type { WebSearchHit, WebSearchResult };
