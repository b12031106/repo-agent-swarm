import simpleGit from "simple-git";
import path from "path";
import fs from "fs";

const REPOS_DIR = path.join(process.cwd(), "repos");

function ensureReposDir() {
  if (!fs.existsSync(REPOS_DIR)) {
    fs.mkdirSync(REPOS_DIR, { recursive: true });
  }
}

/** Extract repo name from GitHub URL */
export function extractRepoName(githubUrl: string): string {
  const cleaned = githubUrl.replace(/\.git$/, "").replace(/\/$/, "");
  const parts = cleaned.split("/");
  return parts[parts.length - 1] || "unknown-repo";
}

/** Get local path for a repo, using the original name from the GitHub URL */
export function getRepoLocalPath(githubUrl: string): string {
  const repoName = extractRepoName(githubUrl);
  const basePath = path.join(REPOS_DIR, repoName);

  // 同名衝突時加數字後綴
  if (!fs.existsSync(basePath)) return basePath;
  let i = 2;
  while (fs.existsSync(`${basePath}-${i}`)) i++;
  return `${basePath}-${i}`;
}

/** Build an authenticated clone URL by injecting token credentials */
function buildAuthenticatedUrl(githubUrl: string, token: string): string {
  const url = new URL(githubUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

/** Clone a GitHub repo to the local repos directory */
export async function cloneRepo(
  githubUrl: string,
  localPath: string,
  options?: { authToken?: string }
): Promise<void> {
  ensureReposDir();

  // Remove existing directory if it exists
  if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { recursive: true, force: true });
  }

  const cloneUrl = options?.authToken
    ? buildAuthenticatedUrl(githubUrl, options.authToken)
    : githubUrl;

  const git = simpleGit();
  await git.clone(cloneUrl, localPath, ["--depth", "1"]);
}

/** Pull latest changes for a repo */
export async function syncRepo(
  localPath: string,
  options?: { githubUrl?: string; authToken?: string }
): Promise<void> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Repo directory not found: ${localPath}`);
  }

  const git = simpleGit(localPath);

  if (options?.authToken && options?.githubUrl) {
    const authUrl = buildAuthenticatedUrl(options.githubUrl, options.authToken);
    // Temporarily set remote URL with token, pull, then restore
    const originalUrl = (await git.remote(["get-url", "origin"])) as string;
    await git.remote(["set-url", "origin", authUrl]);
    try {
      await git.pull();
    } finally {
      await git.remote(["set-url", "origin", originalUrl.trim()]);
    }
  } else {
    await git.pull();
  }
}

/** Remove a cloned repo from disk */
export function removeRepo(localPath: string): void {
  if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { recursive: true, force: true });
  }
}
