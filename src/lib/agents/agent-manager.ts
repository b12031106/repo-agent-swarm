import { RepoAgent, type RepoAgentConfig } from "./repo-agent";
import { getProvider, getDefaultProvider } from "./providers";
import type { AgentProvider } from "./providers";

/**
 * Singleton manager for all active RepoAgent instances.
 * Handles lifecycle, caching, and cleanup.
 */
class AgentManagerImpl {
  private agents: Map<string, RepoAgent> = new Map();

  /** Get or create a RepoAgent for a given repo */
  getAgent(config: RepoAgentConfig, providerName?: string): RepoAgent {
    const existing = this.agents.get(config.repoId);
    if (existing) {
      return existing;
    }

    let provider: AgentProvider | undefined;
    if (providerName) {
      provider = getProvider(providerName);
    }
    if (!provider) {
      provider = getDefaultProvider();
    }

    const agent = new RepoAgent({ ...config, provider });
    this.agents.set(config.repoId, agent);
    return agent;
  }

  /** Remove an agent instance (e.g., when repo is deleted) */
  removeAgent(repoId: string): void {
    this.agents.delete(repoId);
  }

  /** List all active agent IDs */
  getActiveAgentIds(): string[] {
    return Array.from(this.agents.keys());
  }

  /** Get all agents (for orchestrator) */
  getAllAgents(): Map<string, RepoAgent> {
    return this.agents;
  }

  /** Clear all agents */
  clear(): void {
    this.agents.clear();
  }
}

// Singleton: survive HMR in development
const globalForAgents = globalThis as unknown as {
  agentManager: AgentManagerImpl | undefined;
};

export const agentManager =
  globalForAgents.agentManager ?? new AgentManagerImpl();

if (process.env.NODE_ENV !== "production") {
  globalForAgents.agentManager = agentManager;
}
