export type RepoStatus = "cloning" | "ready" | "error" | "syncing";
export type ProfileStatus = "empty" | "draft" | "confirmed";

export interface RepoDependency {
  repoId?: string;
  name: string;
}

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
  // Service registry metadata
  description: string | null;
  domain: string | null;
  serviceType: string | null;
  dependenciesJson: string | null;
  exposedApisJson: string | null;
  techStack: string | null;
  teamOwner: string | null;
  profileStatus: ProfileStatus | null;
  installationId: number | null;
}

export type ConversationType = "chat" | "analysis";

export interface Conversation {
  id: string;
  repoId: string | null;
  sessionId: string | null;
  title: string;
  isOrchestrator: boolean;
  model: string | null;
  type: ConversationType | null;
  userId: string | null;
  outputStyleId: string | null;
  createdAt: string;
  updatedAt: string;
  repoName?: string | null;
}

export interface OutputStyle {
  id: string;
  userId: string | null;
  name: string;
  description: string | null;
  promptText: string | null;
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
  userId: string | null;
  inputTokens: number;
  outputTokens: number;
  totalCostUsd: number;
  createdAt: string;
}

export interface Share {
  id: string;
  token: string;
  conversationId: string;
  userId: string;
  messageIds: string | null;
  title: string | null;
  expiresAt: string | null;
  viewCount: number;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

// SSE event types
export type SSEEventType =
  | "text"
  | "tool_use"
  | "tool_result"
  | "error"
  | "done"
  | "usage"
  | "phase_start"
  | "phase_end"
  | "subagent_start"
  | "subagent_event"
  | "subagent_end"
  | "iteration_start"
  | "iteration_end";

export type OrchestratorPhase = "planning" | "execution" | "reflection" | "synthesis";

export interface SSEEvent {
  type: SSEEventType;
  data: string;
}

// Attachment types
export type AttachmentCategory = "image" | "pdf" | "text";

export interface UploadedAttachment {
  id: string;
  name: string;
  size: number;
  category: AttachmentCategory;
  serverPath: string;
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
  outputStyleId?: string;
  attachmentIds?: string[];
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
  phase?: OrchestratorPhase;
  subagentId?: string;
  subagentName?: string;
  subagentQuery?: string;
  innerEvent?: AgentStreamEvent;
  iteration?: number;
  maxIterations?: number;
  budgetExhausted?: boolean;
}
