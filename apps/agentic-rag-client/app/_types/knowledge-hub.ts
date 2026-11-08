import type { RefObject } from 'react';
import type { UIMessage } from 'ai';

export interface AuthUser {
  userId: string;
  username: string;
  realName?: string | null;
  email?: string | null;
  avatar?: string | null;
  roles: string[];
  permissions: string[];
  teamIds?: string[];
}

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  userInfo: AuthUser;
}

export interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface DocumentItem {
  id: string;
  title: string;
  summary?: string | null;
  content?: string;
  categoryId?: string | null;
  teamId?: string | null;
  authorId?: string | null;
  tags?: string | null;
  status: number;
  isPublic: boolean;
  viewCount?: number;
  likeCount?: number;
  wordCount?: number;
  publishTime?: string | null;
  createdAt?: string;
  updatedAt?: string;
  remark?: string | null;
}

export interface SearchHit {
  id: string;
  title: string;
  summary?: string | null;
  categoryId?: string | null;
  tags?: string | null;
  authorId?: string | null;
  teamId?: string | null;
  isPublic?: boolean | null;
  status?: number | null;
  publishTime?: string | null;
  score: number;
  highlight: {
    title: string[];
    summary: string[];
    content: string[];
  };
}

export interface ChunkHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  content: string;
  heading: string | null;
  score: number;
  bm25Score?: number;
  vectorScore?: number;
}

export interface ChatSource {
  index: number;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  excerpt: string;
  score: number;
}

export interface CiteItem {
  index?: number;
  documentId: string;
  documentTitle: string;
  heading?: string | null;
  excerpt?: string;
}

export interface SourceCiteListProps {
  items: CiteItem[];
  scope: string;
  activeIndex?: number | null;
  onSelect?: (index: number) => void;
}

export interface AnswerMarkdownProps {
  text: string;
  sources?: CiteItem[];
  scope: string;
  onCite?: (index: number) => void;
}

export interface ChatResult {
  sessionId: string | null;
  answer: string;
  sources: ChatSource[];
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[] | null;
  createdAt: string;
}

export interface ChatBubble {
  role: 'user' | 'assistant';
  content: string;
  sources?: ChatSource[] | null;
}

export interface RetrieveHit {
  index: number;
  documentId: string;
  documentTitle: string;
  heading: string | null;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  siteName?: string;
}

export interface WebSearchResult {
  query: string;
  items: WebSearchHit[];
  error?: string;
}

export type KhUIMessage = UIMessage<
  unknown,
  {
    status: { stage: string; text: string };
    think: { text: string };
    sources: ChatSource[];
    retrieve: { query: string; items: RetrieveHit[] };
    session: { sessionId: string };
  }
>;

export interface GraphHit {
  id: string;
  name: string;
  label?: string | null;
  type?: string | null;
  title?: string | null;
  description?: string | null;
  heading?: string | null;
  documentId?: string | null;
  summary?: string | null;
  snippet?: string | null;
}

export interface GraphViewNode {
  id: string;
  name: string;
  kind: 'document' | 'entity' | 'tag';
  type?: string | null;
  documentId?: string | null;
  updatedAt?: string | null;
  description?: string | null;
}

export interface GraphViewEdge {
  source: string;
  target: string;
  relation: string;
  kind: 'mentions' | 'related' | 'tagged';
}

export interface GraphOverview {
  nodes: GraphViewNode[];
  edges: GraphViewEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    documentCount: number;
    entityCount: number;
    tagCount: number;
    mentionCount: number;
    relatedCount: number;
    entityTypes: Array<{ type: string; count: number }>;
  };
  topEntities: Array<{ name: string; type: string | null; degree: number }>;
  recentNodes: Array<{
    id: string;
    name: string;
    kind: string;
    updatedAt: string | null;
  }>;
  entityTypes: string[];
}

export interface GraphNode {
  id: string;
  name: string;
  type?: string | null;
  description?: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  weight: number;
}

export interface UserVO {
  id: string;
  username: string;
  email?: string | null;
  realName?: string | null;
  avatar?: string | null;
  status: number;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
  roleCodes: string[];
}

export interface RoleItem {
  id: string;
  roleName: string;
  roleCode: string;
  description?: string | null;
  status?: number;
}

export interface TeamItem {
  id: string;
  teamName: string;
  teamCode?: string | null;
  description?: string | null;
  leaderId?: string | null;
  parentId?: string;
  sort?: number;
  status?: number;
  memberCount?: number;
}

export interface TeamTreeNode extends TeamItem {
  children?: TeamTreeNode[];
}

export interface ReviewTask {
  id: string;
  documentId: string;
  reviewerId?: string | null;
  reviewerName?: string | null;
  reviewResult?: number | null;
  reviewComment?: string | null;
  beforeStatus: number;
  reviewedAt?: string | null;
  createdAt: string;
}

export interface UserStats {
  documentCount: number;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface PermissionNode {
  id: string;
  parentId: string;
  permissionName: string;
  permissionCode: string;
  permissionType: number;
  children?: PermissionNode[];
}

export interface ChatSessionSidebarProps {
  activeSessionId?: string;
  busy: boolean;
  sessions: ChatSession[];
  onCreate: () => void;
  onRemove: (id: string) => void;
  onSelect: (id: string) => void;
}

export interface ChatConversationProps {
  errorMessage?: string;
  input: string;
  loading: boolean;
  logRef: RefObject<HTMLDivElement | null>;
  messages: KhUIMessage[];
  streaming: boolean;
  onInputChange: (value: string) => void;
  onLogScroll: () => void;
  onSend: () => void;
  onStop: () => void;
}

export interface ChatMessagePartsProps {
  messageId: string;
  parts: KhUIMessage['parts'];
  role: KhUIMessage['role'];
  showSources?: boolean;
}

export interface RetrieveCardProps {
  query: string;
  items: RetrieveHit[];
}

export interface ThinkBlockProps {
  text: string;
  streaming?: boolean;
}

export interface WebSearchCardProps {
  part: {
    state: string;
    input?: unknown;
    output?: unknown;
    errorText?: string;
  };
}

export interface ChatProcessPartsProps {
  parts: KhUIMessage['parts'];
}
