import type { AgentProvider } from "./types";
import { ClaudeCodeProvider } from "./claude-code-provider";

export type { AgentProvider, AgentQueryOptions, ModelInfo } from "./types";
export { ClaudeCodeProvider } from "./claude-code-provider";

const providers = new Map<string, AgentProvider>();

// Auto-register default provider
const defaultProvider = new ClaudeCodeProvider();
providers.set(defaultProvider.name, defaultProvider);

export function registerProvider(provider: AgentProvider): void {
  providers.set(provider.name, provider);
}

export function getProvider(name: string): AgentProvider | undefined {
  return providers.get(name);
}

export function getDefaultProvider(): AgentProvider {
  return defaultProvider;
}

export function getAllProviders(): AgentProvider[] {
  return Array.from(providers.values());
}
