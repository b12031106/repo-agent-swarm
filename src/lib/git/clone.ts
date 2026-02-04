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

/** Get local path for a repo */
export function getRepoLocalPath(repoId: string, repoName: string): string {
  return path.join(REPOS_DIR, `${repoName}-${repoId.slice(0, 8)}`);
}

/** Clone a GitHub repo to the local repos directory */
export async function cloneRepo(
  githubUrl: string,
  localPath: string
): Promise<void> {
  ensureReposDir();

  // Remove existing directory if it exists
  if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { recursive: true, force: true });
  }

  const git = simpleGit();
  await git.clone(githubUrl, localPath, ["--depth", "1"]);
}

/** Pull latest changes for a repo */
export async function syncRepo(localPath: string): Promise<void> {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Repo directory not found: ${localPath}`);
  }

  const git = simpleGit(localPath);
  await git.pull();
}

/** Remove a cloned repo from disk */
export function removeRepo(localPath: string): void {
  if (fs.existsSync(localPath)) {
    fs.rmSync(localPath, { recursive: true, force: true });
  }
}
