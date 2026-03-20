import crypto from "crypto";
import fs from "fs";
import type { InstallationToken } from "./types";

interface GitHubAppConfig {
  appId: string;
  privateKey: string;
}

function resolvePrivateKey(): string | null {
  const keyOrPath = process.env.GITHUB_PRIVATE_KEY;
  if (!keyOrPath) return null;

  // If it looks like PEM content, use directly
  if (keyOrPath.includes("-----BEGIN")) {
    return keyOrPath;
  }

  // Otherwise treat as file path
  try {
    return fs.readFileSync(keyOrPath, "utf-8");
  } catch {
    return null;
  }
}

function getConfig(): GitHubAppConfig | null {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = resolvePrivateKey();
  if (!appId || !privateKey) return null;
  return { appId, privateKey };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

function generateJWT(): string {
  const config = getConfig();
  if (!config) throw new Error("GitHub App not configured");

  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({
      iat: now - 60,
      exp: now + 600,
      iss: config.appId,
    })
  ).toString("base64url");

  const signature = crypto
    .createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(config.privateKey, "base64url");

  return `${header}.${payload}.${signature}`;
}

const tokenCache = new Map<number, InstallationToken>();

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = tokenCache.get(installationId);
  if (cached && cached.expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return cached.token;
  }

  const jwt = generateJWT();
  const res = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to get installation token: ${res.status} ${text}`);
  }

  const data = await res.json();
  const token: InstallationToken = {
    token: data.token,
    expiresAt: new Date(data.expires_at),
    installationId,
  };

  tokenCache.set(installationId, token);
  return token.token;
}

export { generateJWT };
