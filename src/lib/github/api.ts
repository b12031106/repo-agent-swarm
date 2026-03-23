import { isConfigured, generateJWT, getInstallationToken } from "./auth";
import type { GitHubInstallation, GitHubRepository } from "./types";
import { getDb, schema } from "@/lib/db";
import { eq, and, gt } from "drizzle-orm";

export { isConfigured };

const GITHUB_API = "https://api.github.com";
const HEADERS = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
};

const DEFAULT_CACHE_TTL_MINUTES = 10;

function getCacheTtlSeconds(): number {
  try {
    const db = getDb();
    const row = db
      .select()
      .from(schema.settings)
      .where(eq(schema.settings.key, "githubRepoCacheTtlMinutes"))
      .get();
    if (row) {
      const minutes = parseInt(row.value, 10);
      if (!isNaN(minutes) && minutes > 0) return minutes * 60;
    }
  } catch {
    // settings table might not exist yet
  }
  return DEFAULT_CACHE_TTL_MINUTES * 60;
}

function getCacheKey(installationId: number): string {
  return `github:repos:${installationId}`;
}

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
  const db = getDb();
  const cacheKey = getCacheKey(installationId);
  const now = Math.floor(Date.now() / 1000);

  // Check cache
  const cached = db
    .select()
    .from(schema.cache)
    .where(and(eq(schema.cache.key, cacheKey), gt(schema.cache.expiresAt, now)))
    .get();

  if (cached) {
    return JSON.parse(cached.value) as GitHubRepository[];
  }

  // Fetch from GitHub API
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

  // Write to cache
  const ttl = getCacheTtlSeconds();
  db.insert(schema.cache)
    .values({ key: cacheKey, value: JSON.stringify(repos), expiresAt: now + ttl })
    .onConflictDoUpdate({
      target: schema.cache.key,
      set: { value: JSON.stringify(repos), expiresAt: now + ttl },
    })
    .run();

  return repos;
}

export function invalidateRepoCache(installationId: number): void {
  const db = getDb();
  db.delete(schema.cache)
    .where(eq(schema.cache.key, getCacheKey(installationId)))
    .run();
}
