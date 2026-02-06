import {
  DEFAULT_REPO_AGENT_ROLE,
  DEFAULT_ORCHESTRATOR_ROLE,
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
 * Build rich repo descriptions for orchestrator prompts.
 * Shows service registry metadata when available.
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
        desc += `\n- 路徑: ${r.repoPath}`;
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

export function getOrchestratorPlanningPrompt(
  repoDescriptions: string,
  customRolePrompt?: string | null
): string {
  const role = customRolePrompt?.trim() || DEFAULT_ORCHESTRATOR_ROLE;

  return `${role}

## Available Repositories
${repoDescriptions}

## Your Task
Analyze the user's question and decide which repositories need to be queried. Output a JSON object with the following format and NOTHING else before or after the JSON:

\`\`\`json
{
  "reasoning": "Brief explanation of why these repos are relevant",
  "queries": [
    {
      "repoId": "the repo ID",
      "repoName": "the repo name",
      "question": "A specific question tailored for this repo's agent"
    }
  ]
}
\`\`\`

Rules:
- Use the service metadata (描述, 領域, 類型, 對外 API, 依賴) to make informed decisions about which repos are relevant.
- Repos marked ✅ 已確認 have more reliable metadata than 📝 草稿 or ⚠️ 無資料.
- If the question is general chat (greetings, non-code topics), return an empty queries array.
- If the question involves a specific repo, only query that repo.
- If the question spans multiple repos or is about cross-repo architecture, query all relevant repos.
- Tailor each question to be specific and actionable for the repo agent.
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage).`;
}

export interface IterationContext {
  iteration: number;
  previousResults: Array<{
    repoName: string;
    summary: string;
  }>;
  reflectionNote?: string;
}

/**
 * Build planning prompt with iteration context for multi-round queries.
 */
export function getIterativePlanningPrompt(
  repoDescriptions: string,
  customRolePrompt: string | null | undefined,
  context: IterationContext
): string {
  const base = getOrchestratorPlanningPrompt(repoDescriptions, customRolePrompt);

  if (context.iteration <= 1) return base;

  const prevSummary = context.previousResults
    .map((r) => `- **${r.repoName}**: ${r.summary}`)
    .join("\n");

  return `${base}

## Previous Iteration Results (Round ${context.iteration - 1})
${prevSummary}

${context.reflectionNote ? `## Reflection Note\n${context.reflectionNote}\n` : ""}
Based on the above findings, identify any ADDITIONAL repos that need to be queried to fully answer the user's question. Do NOT re-query repos that were already queried unless the question needs different information from them.`;
}

/**
 * Reflection prompt: evaluate if gathered information is sufficient.
 */
export function getOrchestratorReflectionPrompt(
  repoDescriptions: string,
  customRolePrompt?: string | null
): string {
  const role = customRolePrompt?.trim() || DEFAULT_ORCHESTRATOR_ROLE;

  return `${role}

## Available Repositories
${repoDescriptions}

## Your Task
You are reviewing the analysis results collected so far. Evaluate whether the information is sufficient to fully answer the user's question.

Output a JSON object with the following format and NOTHING else before or after the JSON:

\`\`\`json
{
  "assessment": "Brief assessment of information coverage",
  "sufficient": true/false,
  "additionalQueries": [
    {
      "repoId": "the repo ID",
      "repoName": "the repo name",
      "question": "A specific follow-up question",
      "reason": "Why this additional query is needed"
    }
  ]
}
\`\`\`

Rules:
- Set "sufficient" to true if the collected information can answer the user's question comprehensively.
- Set "sufficient" to false if critical information is missing from repos that haven't been queried.
- "additionalQueries" should only contain NEW queries (don't re-query already analyzed repos unless asking a different question).
- Be conservative: only request additional queries when there's a clear gap.
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage).`;
}

/**
 * Synthesis prompt with optional structured output format.
 */
export function getOrchestratorSynthesisPrompt(
  repoDescriptions: string,
  customRolePrompt?: string | null,
  options?: { structuredOutput?: boolean }
): string {
  const role = customRolePrompt?.trim() || DEFAULT_ORCHESTRATOR_ROLE;

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

## Available Repositories
${repoDescriptions}

## Context
You have received analysis results from repo-specific agents. Each agent has examined its repository in detail.

## Your Task
- Synthesize and integrate the findings from all repo agents into a coherent response.
- Provide high-level architectural insights and cross-repo analysis.
- Highlight cross-repo dependencies, patterns, or inconsistencies.
- If any agent reported an error, acknowledge it and work with available data.
- Always respond in 繁體中文 (Traditional Chinese, Taiwan usage) unless the user explicitly asks otherwise.${structuredSection}`;
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
