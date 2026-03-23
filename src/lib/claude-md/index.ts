import fs from "fs";
import path from "path";
import crypto from "crypto";
import { getDefaultProvider } from "@/lib/agents/providers";
import { buildRepoDescriptions, type RepoMetaForPrompt } from "@/lib/agents/prompts";

const REPOS_DIR = path.join(process.cwd(), "repos");
const MASTER_CLAUDE_MD_PATH = path.join(REPOS_DIR, "CLAUDE.md");

/** Description source priority files */
const DESCRIPTION_FILES = ["CLAUDE.md", "AGENTS.md", ".generated-claude.md"] as const;

/** Simple lock to prevent concurrent master generation */
let isGenerating = false;

/** Debounce timer for batch operations */
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 3000;

// ─── Source Detection ───

export interface DescriptionSource {
  content: string;
  source: string;
}

/**
 * Find the highest-priority description file for a repo.
 * Priority: CLAUDE.md > AGENTS.md > .generated-claude.md
 */
export function getRepoDescriptionSource(repoPath: string): DescriptionSource | null {
  for (const filename of DESCRIPTION_FILES) {
    const filePath = path.join(repoPath, filename);
    try {
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf-8");
        if (content.trim()) {
          return { content, source: filename };
        }
      }
    } catch {
      // skip unreadable files
    }
  }
  return null;
}

// ─── Hashing ───

/**
 * Compute SHA-256 hash of the repo's best description file.
 * Returns null if no description file exists.
 */
export function computeClaudeMdHash(repoPath: string): string | null {
  const source = getRepoDescriptionSource(repoPath);
  if (!source) return null;
  return crypto.createHash("sha256").update(source.content).digest("hex");
}

// ─── Per-Repo .generated-claude.md ───

const REPO_SCAN_PROMPT = `You are a code analysis expert. Analyze this repository and produce a concise CLAUDE.md-style overview in Traditional Chinese (Taiwan usage).

## Output Format

Write a markdown document covering:
1. **Purpose** — What this service/app does (1-2 sentences)
2. **Tech Stack** — Key technologies, frameworks, languages
3. **Directory Structure** — Main directories and their purpose
4. **Key APIs / Entry Points** — Main routes, commands, or exports
5. **Dependencies** — External services, databases, or other repos this depends on
6. **Important Patterns** — Notable architectural patterns or conventions

Keep it concise (under 200 lines). Focus on what another developer (or AI) needs to quickly understand this repo.
Do NOT wrap the output in a code block — output raw markdown directly.`;

/**
 * Generate a .generated-claude.md for a repo that has no CLAUDE.md or AGENTS.md.
 * Uses a lightweight agent (haiku) to scan the repo and produce a summary.
 */
export async function generateRepoClaudeMd(repoPath: string, repoName: string): Promise<void> {
  const provider = getDefaultProvider();
  let fullText = "";

  try {
    for await (const event of provider.query({
      message: `Analyze the repository "${repoName}" and produce a CLAUDE.md overview.`,
      systemPrompt: REPO_SCAN_PROMPT,
      tools: "Read,Glob,Grep,Bash",
      model: "haiku",
      cwd: repoPath,
    })) {
      if (event.type === "text" && event.content) {
        fullText += event.content;
      }
    }

    if (fullText.trim()) {
      fs.writeFileSync(path.join(repoPath, ".generated-claude.md"), fullText.trim() + "\n", "utf-8");
      console.log(`[claude-md] Generated .generated-claude.md for ${repoName}`);
    }
  } catch (error) {
    console.error(`[claude-md] Failed to generate .generated-claude.md for ${repoName}:`, error);
  }
}

// ─── Master CLAUDE.md Generation ───

interface RepoRowForIndex {
  id: string;
  name: string;
  localPath: string;
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
 * Build a fallback description from DB metadata for repos without any description file.
 */
function buildFallbackDescription(repo: RepoRowForIndex): string {
  const meta: RepoMetaForPrompt = {
    repoId: repo.id,
    repoName: repo.name,
    repoPath: repo.localPath,
    description: repo.description,
    domain: repo.domain,
    serviceType: repo.serviceType,
    dependenciesJson: repo.dependenciesJson,
    exposedApisJson: repo.exposedApisJson,
    techStack: repo.techStack,
    teamOwner: repo.teamOwner,
    profileStatus: repo.profileStatus,
  };
  // Reuse existing function but strip the ### header (we'll add our own)
  const raw = buildRepoDescriptions([meta]);
  // Remove the first "### ..." line and return the rest
  const lines = raw.split("\n");
  return lines.slice(1).map((l) => l.replace(/^- /, "")).join("\n").trim();
}

/**
 * Summarize a repo's description file content using AI.
 * Returns a concise 3-5 line summary.
 */
async function summarizeRepoContent(repoName: string, content: string): Promise<string> {
  const provider = getDefaultProvider();
  let summary = "";

  try {
    for await (const event of provider.query({
      message: `Summarize the following repository documentation for "${repoName}" into 3-5 lines. Include: purpose, tech stack, key APIs, and dependencies. Write in Traditional Chinese (Taiwan usage). Output raw text only, no markdown headers or code blocks.\n\n---\n${content.slice(0, 8000)}\n---`,
      systemPrompt: "You are a technical writer. Produce a concise 3-5 line summary in plain text.\nRules:\n- Output ONLY the summary text, nothing else\n- Do NOT include greetings, questions, thoughts, or explanations\n- Do NOT say you cannot complete the task — summarize whatever information is available\n- If the content is insufficient, output a one-line description based on the repo name",
      model: "haiku",
      tools: "",
      cwd: REPOS_DIR,
    })) {
      if (event.type === "text" && event.content) {
        summary += event.content;
      }
    }
  } catch (error) {
    console.error(`[claude-md] Failed to summarize ${repoName}:`, error);
  }

  return summary.trim();
}

/**
 * Get the folder name relative to repos dir for a given repo path.
 */
function getRepoFolderName(repoPath: string): string {
  return path.basename(repoPath);
}

/**
 * Generate the master CLAUDE.md index from all repos.
 * Reads each repo's description source, summarizes with AI, and writes to repos/CLAUDE.md.
 */
export async function generateMasterClaudeMd(repos: RepoRowForIndex[]): Promise<void> {
  if (isGenerating) {
    console.log("[claude-md] Generation already in progress, skipping");
    return;
  }

  isGenerating = true;
  try {
    console.log(`[claude-md] Generating master CLAUDE.md for ${repos.length} repos...`);

    // Ensure repos dir exists
    if (!fs.existsSync(REPOS_DIR)) {
      fs.mkdirSync(REPOS_DIR, { recursive: true });
    }

    const sections: string[] = [];

    for (const repo of repos) {
      const folderName = getRepoFolderName(repo.localPath);
      const source = getRepoDescriptionSource(repo.localPath);

      let description: string;
      if (source) {
        description = await summarizeRepoContent(repo.name, source.content);
      } else {
        description = buildFallbackDescription(repo);
      }

      if (!description) {
        description = `(尚無描述資訊，請進入目錄查看)`;
      }

      sections.push(`## ${repo.name} (\`./${folderName}/\`)\n${description}`);
    }

    const masterContent = `# Repos 索引

以下是所有可用的程式碼倉庫。需要深入了解任何 repo 時，請進入對應目錄查看其 CLAUDE.md 或直接閱讀程式碼。

${sections.join("\n\n")}
`;

    fs.writeFileSync(MASTER_CLAUDE_MD_PATH, masterContent, "utf-8");
    console.log(`[claude-md] Master CLAUDE.md generated at ${MASTER_CLAUDE_MD_PATH}`);
  } catch (error) {
    console.error("[claude-md] Failed to generate master CLAUDE.md:", error);
  } finally {
    isGenerating = false;
  }
}

/**
 * Update only one repo's section in the master CLAUDE.md.
 * Falls back to full regeneration if the master file doesn't exist.
 */
export async function updateMasterClaudeMdForRepo(
  repo: RepoRowForIndex,
  allRepos: RepoRowForIndex[],
): Promise<void> {
  if (!fs.existsSync(MASTER_CLAUDE_MD_PATH)) {
    return generateMasterClaudeMd(allRepos);
  }

  try {
    const folderName = getRepoFolderName(repo.localPath);
    const source = getRepoDescriptionSource(repo.localPath);

    let description: string;
    if (source) {
      description = await summarizeRepoContent(repo.name, source.content);
    } else {
      description = buildFallbackDescription(repo);
    }

    if (!description) {
      description = `(尚無描述資訊，請進入目錄查看)`;
    }

    const newSection = `## ${repo.name} (\`./${folderName}/\`)\n${description}`;

    let masterContent = fs.readFileSync(MASTER_CLAUDE_MD_PATH, "utf-8");

    // Find and replace the existing section for this repo
    const sectionRegex = new RegExp(
      `## ${escapeRegex(repo.name)} \\(\`\\./${escapeRegex(folderName)}/\`\\)\n[\\s\\S]*?(?=\n## |$)`,
    );

    if (sectionRegex.test(masterContent)) {
      masterContent = masterContent.replace(sectionRegex, newSection);
    } else {
      // Repo not found in master — append
      masterContent = masterContent.trimEnd() + "\n\n" + newSection + "\n";
    }

    fs.writeFileSync(MASTER_CLAUDE_MD_PATH, masterContent, "utf-8");
    console.log(`[claude-md] Updated master CLAUDE.md for ${repo.name}`);
  } catch (error) {
    console.error(`[claude-md] Failed to update master for ${repo.name}, regenerating:`, error);
    return generateMasterClaudeMd(allRepos);
  }
}

/**
 * Remove a repo's section from the master CLAUDE.md.
 */
export function removeRepoFromMasterClaudeMd(repoName: string, repoPath: string): void {
  if (!fs.existsSync(MASTER_CLAUDE_MD_PATH)) return;

  try {
    const folderName = getRepoFolderName(repoPath);
    let masterContent = fs.readFileSync(MASTER_CLAUDE_MD_PATH, "utf-8");

    const sectionRegex = new RegExp(
      `\n*## ${escapeRegex(repoName)} \\(\`\\./${escapeRegex(folderName)}/\`\\)\n[\\s\\S]*?(?=\n## |$)`,
    );

    masterContent = masterContent.replace(sectionRegex, "");
    fs.writeFileSync(MASTER_CLAUDE_MD_PATH, masterContent, "utf-8");
    console.log(`[claude-md] Removed ${repoName} from master CLAUDE.md`);
  } catch (error) {
    console.error(`[claude-md] Failed to remove ${repoName} from master:`, error);
  }
}

// ─── Debounced Trigger ───

/**
 * Debounced wrapper for generateMasterClaudeMd.
 * Prevents multiple regenerations during batch clone/sync operations.
 */
export function debouncedGenerateMasterClaudeMd(repos: RepoRowForIndex[]): void {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    generateMasterClaudeMd(repos).catch((error) => {
      console.error("[claude-md] Debounced generation failed:", error);
    });
  }, DEBOUNCE_MS);
}

/**
 * Check if the master CLAUDE.md exists.
 */
export function masterClaudeMdExists(): boolean {
  return fs.existsSync(MASTER_CLAUDE_MD_PATH);
}

// ─── Helpers ───

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
