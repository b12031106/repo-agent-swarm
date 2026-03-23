import {
  DEFAULT_REPO_AGENT_ROLE,
} from "@/lib/constants/default-prompts";

export interface RepoMetaForPrompt {
  repoId: string;
  repoName: string;
  repoPath: string;
  description?: string | null;
  domain?: string | null;
  serviceType?: string | null;
  dependenciesJson?: string | null;
  exposedApisJson?: string | null;
  techStack?: string | null;
  teamOwner?: string | null;
  profileStatus?: string | null;
}

/**
 * Build rich repo descriptions from DB metadata.
 * Used as fallback when repos don't have CLAUDE.md files.
 */
export function buildRepoDescriptions(repos: RepoMetaForPrompt[]): string {
  return repos
    .map((r) => {
      const statusIcon =
        r.profileStatus === "confirmed"
          ? "✅ 已確認"
          : r.profileStatus === "draft"
            ? "📝 草稿"
            : "⚠️ 無資料";

      let desc = `### ${r.repoName} (id: ${r.repoId}) ${statusIcon}`;

      if (r.description) desc += `\n- 描述: ${r.description}`;
      if (r.domain) desc += `\n- 領域: ${r.domain}`;
      if (r.serviceType) desc += `\n- 類型: ${r.serviceType}`;
      if (r.techStack) desc += `\n- 技術棧: ${r.techStack}`;

      if (r.exposedApisJson) {
        try {
          const apis = JSON.parse(r.exposedApisJson);
          if (Array.isArray(apis) && apis.length > 0) {
            desc += `\n- 對外 API: ${apis.join(", ")}`;
          }
        } catch { /* ignore */ }
      }

      if (r.dependenciesJson) {
        try {
          const deps = JSON.parse(r.dependenciesJson);
          if (Array.isArray(deps) && deps.length > 0) {
            const depNames = deps.map((d: { name: string }) => d.name).join(", ");
            desc += `\n- 依賴: ${depNames}`;
          }
        } catch { /* ignore */ }
      }

      if (r.teamOwner) desc += `\n- 團隊: ${r.teamOwner}`;

      // Fallback if no metadata at all
      if (!r.description && !r.domain && !r.serviceType) {
        desc += `\n- 尚未掃描，請先執行自動掃描以取得服務元資料`;
      }

      return desc;
    })
    .join("\n\n");
}

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

/**
 * Repo scanner prompt: analyze a repo's codebase to extract service metadata.
 */
export function getRepoScannerPrompt(repoName: string, repoPath: string): string {
  return `You are a code analysis expert. Analyze the repository "${repoName}" at ${repoPath} to extract service metadata.

## Your Task
Examine the codebase and extract the following information. Output a JSON object and NOTHING else:

\`\`\`json
{
  "description": "Brief description of what this service does (1-2 sentences)",
  "domain": "Business domain (e.g., product, order, user, payment, frontend)",
  "serviceType": "One of: frontend, bff, backend, shared-lib, other",
  "techStack": "Key technologies (e.g., Node.js, Express, PostgreSQL)",
  "exposedApis": ["List of main API endpoints or routes"],
  "dependencies": ["List of external services or databases this service calls"]
}
\`\`\`

## Analysis Strategy
1. Check package.json / pom.xml / go.mod / Cargo.toml for project info and tech stack
2. Look for API route definitions (Express routes, Next.js API routes, Spring controllers, etc.)
3. Find HTTP client calls (fetch, axios, gRPC clients) to identify service dependencies
4. Check docker-compose.yml / k8s configs for infrastructure dependencies
5. Read README.md for service description
6. Check environment variables for external service URLs

## Rules
- Be concise and accurate. Only include what you can verify from the code.
- For "exposedApis", list the main route prefixes (e.g., "/api/users", "/api/products"), not every individual endpoint.
- For "dependencies", include both internal services and external infrastructure (Redis, PostgreSQL, etc.).
- Always respond in 繁體中文 for the description field.`;
}

/**
 * Direct orchestrator prompt: single CLI invocation from repos parent directory.
 * Claude Code reads CLAUDE.md in cwd and explores repos as needed.
 */
export function getOrchestratorDirectPrompt(
  customRolePrompt?: string | null,
  options?: { structuredOutput?: boolean }
): string {
  const role = customRolePrompt?.trim() || `You are a senior software architect who oversees multiple code repositories.

## Your Role
- You analyze code across multiple repositories, find cross-repo dependencies, explain architectures, and provide high-level technical insights.
- You explore repositories as needed using your tools — reading files, searching code, and running read-only commands.`;

  const structuredSection = options?.structuredOutput
    ? `

## Output Format
Your response MUST include the following sections in order:

### 1. 摘要
A concise executive summary (2-3 paragraphs).

### 2. 涉及的服務與團隊
A markdown table with columns: 服務名稱 | 領域 | 負責團隊 | 影響程度 (高/中/低) | 說明

### 3. 依賴關係圖
A Mermaid flowchart showing service dependencies relevant to this analysis. Use:
\`\`\`mermaid
graph TD
  A[Service A] --> B[Service B]
\`\`\`

### 4. 工作項清單
Organized by team, each item with: priority (P0/P1/P2), description, estimated complexity (S/M/L).

### 5. 影響範圍評估
Describe the blast radius: which services, APIs, and user flows are affected.

### 6. 風險與建議
Key risks, mitigation strategies, and implementation recommendations.`
    : "";

  return `${role}

## Core Constraints

Your working directory contains multiple code repositories. A \`CLAUDE.md\` file in this directory provides an index of all available repos with brief descriptions.

- **Start by reading \`CLAUDE.md\`** in the current directory to understand what repos are available.
- Navigate into relevant repo directories as needed to answer the user's question.
- Each repo may have its own \`CLAUDE.md\` with detailed information — read it when you need deeper context.
- You are **READ-ONLY**. Do NOT create, edit, delete, or write any files.

## Tool Guidelines
- Use Glob to find files by pattern across repos (e.g., \`*/src/**/*.ts\`).
- Use Grep to search for code patterns across all repos (e.g., function definitions, imports, API calls).
- Use Read to examine file contents.
- Use Bash ONLY for read-only operations like \`git log\`, \`git diff\`, \`ls\`, \`wc\`, etc.
- NEVER use Bash for commands that modify files.
- Always reference specific file paths and line numbers in your answers.
- When analyzing cross-repo interactions, trace the full call chain across repositories.

## Response Guidelines
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage) unless the user explicitly asks otherwise.
- Provide concrete evidence from the code, not speculation.
- When discussing cross-repo dependencies, cite the specific files and line numbers in each repo.${structuredSection}`;
}
