#!/usr/bin/env node

/**
 * 自動更新腳本 - 定期檢查 git remote 是否有新 commit
 * 有更新時自動 pull → install → build → pm2 reload（零停機）
 *
 * 由 PM2 管理為獨立 process（ecosystem.config.cjs 中的 updater）
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync, mkdirSync, appendFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const APP_DIR = resolve(__dirname, "..");
const CHECK_INTERVAL = parseInt(
  process.env.UPDATE_CHECK_INTERVAL_MS || "300000"
);
const BRANCH = process.env.UPDATE_BRANCH || "main";
const LOG_DIR = resolve(APP_DIR, "data", "logs");
const LOG_FILE = resolve(LOG_DIR, "auto-updater.log");

let isUpdating = false;

// ─── Helpers ───

function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  try {
    if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true });
    appendFileSync(LOG_FILE, line + "\n");
  } catch {
    // ignore log write errors
  }
}

function run(cmd, options = {}) {
  return execSync(cmd, {
    cwd: APP_DIR,
    encoding: "utf-8",
    timeout: options.timeout || 120_000,
    stdio: options.stdio || ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}

function hasLocalChanges() {
  const status = run("git status --porcelain");
  return status.length > 0;
}

// ─── Core ───

async function checkForUpdates() {
  if (isUpdating) {
    log("更新進行中，跳過本次檢查");
    return;
  }

  try {
    run(`git fetch origin ${BRANCH}`);

    const localHead = run("git rev-parse HEAD");
    const remoteHead = run(`git rev-parse origin/${BRANCH}`);

    if (localHead === remoteHead) {
      log(`無更新 (HEAD: ${localHead.slice(0, 8)})`);
      return;
    }

    log(
      `偵測到更新: ${localHead.slice(0, 8)} → ${remoteHead.slice(0, 8)}`
    );

    // 檢查是否有未 commit 的本地變更
    if (hasLocalChanges()) {
      log("⚠ 有未 commit 的本地變更，跳過自動更新");
      return;
    }

    await performUpdate(localHead, remoteHead);
  } catch (err) {
    log(`檢查失敗: ${err.message}`);
  }
}

async function performUpdate(fromCommit, toCommit) {
  isUpdating = true;
  const startTime = Date.now();

  try {
    // 1. Pull
    log("正在拉取變更...");
    run(`git pull origin ${BRANCH}`);

    // 2. 分析變更的檔案，決定是否需要 install / build
    const changedFiles = run(
      `git diff --name-only ${fromCommit} ${toCommit}`
    );
    const changedList = changedFiles.split("\n").filter(Boolean);

    const needsInstall =
      changedList.some(
        (f) => f === "package.json" || f === "pnpm-lock.yaml"
      );

    // 如果只有 scripts/、data/、.md 檔案變更，不需要 rebuild
    const needsBuild = changedList.some(
      (f) =>
        !f.startsWith("scripts/") &&
        !f.startsWith("data/") &&
        !f.endsWith(".md") &&
        f !== "ecosystem.config.cjs"
    );

    // 3. Install（如果 lockfile 有變動）
    if (needsInstall) {
      log("正在安裝依賴...");
      run("pnpm install --frozen-lockfile", { timeout: 300_000 });

      // 重新編譯 native modules
      if (changedList.includes("package.json")) {
        try {
          log("正在重新編譯 better-sqlite3...");
          run("pnpm rebuild better-sqlite3", { timeout: 120_000 });
        } catch (err) {
          log(`⚠ better-sqlite3 rebuild 失敗: ${err.message}`);
        }
      }
    }

    // 4. Build + Reload
    if (needsBuild) {
      log("正在建構...");
      run("pnpm build", { timeout: 300_000 });

      // 複製 standalone 所需的靜態資源
      log("正在複製靜態資源...");
      run("cp -r .next/static .next/standalone/.next/static");
      if (existsSync(resolve(APP_DIR, "public"))) {
        run("cp -r public .next/standalone/public");
      }

      // 確保 .env.local 可被 standalone server 讀取
      if (existsSync(resolve(APP_DIR, ".env.local"))) {
        run("ln -sf ../../.env.local .next/standalone/.env.local");
      }

      // 零停機重載（PM2 cluster mode 會逐一重啟 worker）
      log("正在重載應用（零停機）...");
      run("pm2 reload app --update-env");

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);
      log(
        `✓ 應用更新完成，耗時 ${duration}s (${fromCommit.slice(0, 8)} → ${toCommit.slice(0, 8)})`
      );
    } else {
      log("變更不影響應用，跳過 build");
    }

    // 5. 如果 updater 自身或 PM2 config 有變更，重啟 updater
    if (
      changedList.includes("scripts/auto-updater.mjs") ||
      changedList.includes("ecosystem.config.cjs")
    ) {
      log("Updater 腳本有變更，正在重啟 updater...");
      // PM2 會自動重啟這個 process
      run("pm2 restart updater");
      return;
    }
  } catch (err) {
    log(`✗ 更新失敗: ${err.message}`);

    // 嘗試回滾
    try {
      log("正在回滾...");
      run(`git reset --hard ${fromCommit}`);
      log(`已回滾至 ${fromCommit.slice(0, 8)}`);
    } catch (resetErr) {
      log(`✗ 回滾也失敗: ${resetErr.message}`);
    }
  } finally {
    isUpdating = false;
  }
}

// ─── Main ───

log("=".repeat(60));
log(
  `Auto-updater 啟動 (branch: ${BRANCH}, 間隔: ${CHECK_INTERVAL / 1000}s)`
);
log(`應用目錄: ${APP_DIR}`);

// 啟動後立即檢查一次
checkForUpdates();

// 定期檢查
setInterval(checkForUpdates, CHECK_INTERVAL);

// Graceful shutdown
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    log(`收到 ${signal}，正在關閉`);
    process.exit(0);
  });
}
