import type { AgentStreamEvent } from "@/types";

export interface ModelInfo {
  id: string;
  label: string;
  description: string;
}

export interface AgentQueryOptions {
  message: string;
  systemPrompt: string;
  tools?: string;
  model?: string;
  maxBudgetUsd?: number;
  cwd?: string;
  sessionId?: string | null;
  agents?: Record<string, { description: string; prompt: string }>;
}

export interface AgentProvider {
  readonly name: string;
  query(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent>;
  isAvailable(): Promise<boolean>;
  getSupportedModels(): ModelInfo[];
}
