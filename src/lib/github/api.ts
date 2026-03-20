import { isConfigured, generateJWT, getInstallationToken } from "./auth";
import type { GitHubInstallation, GitHubRepository } from "./types";

export { isConfigured };

const GITHUB_API = "https://api.github.com";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

export async function listInstallations(): Promise<GitHubInstallation[]> {
  const jwt = generateJWT();
  const res = await fetch(`${GITHUB_API}/app/installations`, {
    headers: { ...HEADERS, Authorization: `Bearer ${jwt}` },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to list installations: ${res.status} ${text}`);
  }

  return res.json();
}

export async function listInstallationRepos(
  installationId: number
): Promise<GitHubRepository[]> {
  const token = await getInstallationToken(installationId);
  const repos: GitHubRepository[] = [];
  let page = 1;

  while (true) {
    const res = await fetch(
      `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`,
      {
        headers: { ...HEADERS, Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to list repos: ${res.status} ${text}`);
    }

    const data = await res.json();
    repos.push(...data.repositories);

    if (repos.length >= data.total_count) break;
    page++;
  }

  return repos;
}
