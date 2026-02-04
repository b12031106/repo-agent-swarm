import {
  DEFAULT_REPO_AGENT_ROLE,
  DEFAULT_ORCHESTRATOR_ROLE,
} from "@/lib/constants/default-prompts";

export function getRepoAgentSystemPrompt(
  repoName: string,
  repoPath: string,
  customRolePrompt?: string | null
): string {
  const role =
    customRolePrompt?.trim() ||
    `${DEFAULT_REPO_AGENT_ROLE}\n\nYou are analyzing the repository "${repoName}".`;

  const coreConstraints = `## Core Constraints (immutable)

Your working directory is: ${repoPath}

- You are READ-ONLY. You must NOT modify any files.
- You must NOT create, edit, delete, or write any files.

## Tool Guidelines
- Use Glob to find files by pattern.
- Use Grep to search for code patterns, function definitions, imports, etc.
- Use Read to examine file contents.
- Use Bash ONLY for read-only operations like \`git log\`, \`git diff\`, \`ls\`, \`wc\`, etc.
- NEVER use Bash for commands that modify files (rm, mv, cp, sed, etc.)
- Always reference specific file paths and line numbers in your answers.
- Provide concise, accurate answers based on the actual code.
- When explaining architecture, describe the directory structure and key files.
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage) unless the user explicitly asks otherwise.`;

  return `${role}\n\n${coreConstraints}`;
}

export function getOrchestratorSystemPrompt(
  repoDescriptions: string,
  customRolePrompt?: string | null
): string {
  const role = customRolePrompt?.trim() || DEFAULT_ORCHESTRATOR_ROLE;

  const coreConstraints = `## Available Repositories
${repoDescriptions}

## Guidelines
- Identify which repos are relevant to each question.
- Delegate specific code analysis to the repo agents.
- Synthesize and summarize findings from multiple agents.
- Provide your own architectural insights on top of agent findings.
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage) unless the user explicitly asks otherwise.`;

  return `${role}\n\n${coreConstraints}`;
}
