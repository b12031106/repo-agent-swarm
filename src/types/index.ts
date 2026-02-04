export type RepoStatus = "cloning" | "ready" | "error" | "syncing";

export interface Repo {
  id: string;
  name: string;
  githubUrl: string;
  localPath: string;
  status: RepoStatus;
  errorMessage: string | null;
  createdAt: string;
  lastSyncedAt: string | null;
  customPrompt: string | null;
}

export interface Conversation {
  id: string;
  repoId: string | null;
  sessionId: string | null;
  title: string;
  isOrchestrator: boolean;
  model: string | null;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant" | "tool";

export interface Message {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  toolName: string | null;
  createdAt: string;
}

export interface UsageRecord {
  id: string;
  conversationId: string;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  createdAt: string;
}

// SSE event types
export type SSEEventType =
  | "text"
  | "tool_use"
  | "tool_result"
  | "error"
  | "done"
  | "usage";

export interface SSEEvent {
  type: SSEEventType;
  data: string;
}

// API request/response types
export interface CreateRepoRequest {
  githubUrl: string;
  name?: string;
  customPrompt?: string;
}

export interface Setting {
  key: string;
  value: string;
  updatedAt: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
}

export interface AgentStreamEvent {
  type: string;
  content?: string;
  tool?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  };
  sessionId?: string;
  error?: string;
}
