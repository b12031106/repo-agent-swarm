# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 開發指令

```bash
pnpm dev          # 開發伺服器 (port 3000)
pnpm build        # 生產構建
pnpm start        # 生產伺服器
pnpm lint         # ESLint 檢查
```

安裝依賴後若 better-sqlite3 編譯失敗，需手動執行 `pnpm rebuild better-sqlite3`。

## 架構概覽

多 Repo AI 程式碼分析平台，核心是透過可抽換的 AgentProvider（目前為 Claude Code CLI）實現串流式對話。

### 三層結構

```
前端 (React + Zustand Chat Store + SSE)
    ↓
API Routes (Next.js App Router, /api/*)  ←  NextAuth v5 中間件保護
    ↓
Agent Layer (AgentProvider → CLI spawn)  →  SQLite (Drizzle ORM)
```

### 認證與授權

使用 **NextAuth v5 Beta** + Google OAuth，自訂 SQLite adapter（`src/lib/auth/adapter.ts`）：

- `authConfig` 分離於 `src/lib/auth/config.ts`（Edge Runtime 相容，供中間件使用）
- 中間件（`src/middleware.ts`）保護所有路由，白名單：`/api/auth/*`, `/share/*`, `/login`, 靜態資源
- 未認證 API → 401；未認證頁面 → 302 重導 `/login?callbackUrl={pathname}`
- `getUser()` / `getRequiredUser()`（`src/lib/auth/get-user.ts`）供 API routes 取得當前使用者
- 可透過 `ALLOWED_EMAIL_DOMAINS` 限制允許登入的 email 網域

環境變數（`.env.local`）：
```
AUTH_SECRET=...
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
ALLOWED_EMAIL_DOMAINS=company.com  # 可選，逗號分隔
```

### 狀態管理

聊天狀態由 Zustand 全域 store (`src/stores/chat-store.ts`) 管理，而非元件層級 state：
- `sessions: Map<string, ChatSession>` — 每個對話獨立的狀態容器
- SSE fetch 迴圈在 store 層級運行，**切換對話不會中斷進行中的串流**
- 後台串流上限 `MAX_CONCURRENT_STREAMS = 3`，超過則自動 abort 最早的
- `src/hooks/useChat.ts` 是 store 的薄包裝，保持與元件相同的回傳介面

### Agent 系統

```
AgentProvider (interface)          ← 可抽換的底層
  └─ ClaudeCodeProvider            ← 目前唯一實作 (spawn CLI)
       ↑
RepoAgent / OrchestratorAgent     ← 業務層（session retry、prompt 組裝）
       ↑
AgentManager (singleton)           ← 生命週期管理、快取
```

- **AgentProvider** (`src/lib/agents/providers/types.ts`)：定義 `query()` → `AsyncGenerator<AgentStreamEvent>` 介面
- **ClaudeCodeProvider** (`src/lib/agents/providers/claude-code-provider.ts`)：封裝 `spawn` + stream parsing
- **RepoAgent** (`src/lib/agents/repo-agent.ts`)：單 repo 對話，工具 `Read,Glob,Grep,Bash`，預設無預算上限（可透過 config 設定），session resume 失敗自動重試
- **OrchestratorAgent** (`src/lib/agents/orchestrator-agent.ts`)：跨 repo 總顧問，`--agents` flag 定義 subagents，預算 $2.0/query
- **Provider registry** (`src/lib/agents/providers/index.ts`)：`registerProvider()`, `getProvider()`, `getDefaultProvider()`

Claude Code CLI 呼叫格式：
```bash
claude --print --output-format stream-json --verbose \
  --model sonnet --system-prompt "..." --tools "Read,Glob,Grep,Bash" \
  --dangerously-skip-permissions [--max-budget-usd N] \
  [--resume sessionId] "user message"
```

### 模型選擇

- 支援 per-conversation 切換：sonnet（預設）、haiku、opus
- DB `conversations.model` 欄位記錄每個對話的模型
- 前端 `ModelSelector` 在輸入框左下角，串流中停用切換
- API 優先級：request body `model` > conversation 已存 model > `"sonnet"`

### 資料層

- SQLite + Drizzle ORM，9 張表：`users`, `accounts`, `authSessions`, `repos`, `settings`, `conversations`, `messages`, `cache`, `usageRecords`, `shares`
- DB 路徑：`./data/repo-agent-swarm.db`（首次查詢自動建立）
- Schema 定義在 `src/lib/db/schema.ts`，連線與 inline migration 在 `src/lib/db/index.ts`
- 新欄位的 migration 使用 `ALTER TABLE ADD COLUMN` + try-catch 包裹
- `settings` 表為 key-value 結構，用於全域設定（如 `orchestratorCustomPrompt`）
- **Per-user 隔離**：`conversations.userId` 和 `usageRecords.userId` 關聯當前使用者，所有查詢都帶 userId 過濾

### 對話分享

- `shares` 表儲存分享連結，使用加密 base64url token
- 支援分享整個對話或選擇性訊息（`messageIds` JSON 欄位）
- 可設過期時間（1/7/30/90 天或永不），自動追蹤檢視次數
- 公開分享頁面 `/share/[token]` 無需認證，會過濾 `tool` 訊息（防止暴露內部路徑）
- 撤銷分享需驗證所有者身份

### 檔案上傳

- 支援圖片（png/jpg/gif/webp）、PDF、文字/程式碼檔案（詳見 `src/lib/uploads/index.ts` 的 `ALLOWED_EXTENSIONS`）
- 上傳路徑：`./data/uploads/[uuid]/`，大小限制：圖片 10MB / PDF 20MB / 文字 1MB
- 文字檔內容直接內嵌至訊息（最多 50K 字元），圖片/PDF 提供路徑讓 agent 用 Read 工具讀取
- `message-builder.ts` 負責將附件整合到發送給 CLI 的訊息中
- 自動清理 24 小時未使用的上傳

### 自訂角色提示

- Repo Agent：每個 repo 可設定 `customPrompt`（DB `repos.custom_prompt`）
- Orchestrator：全域設定（DB `settings` 表，key = `orchestratorCustomPrompt`）
- 預設提示定義在 `src/lib/constants/default-prompts.ts`

### SSE 串流

- `src/lib/streaming/sse-encoder.ts`：`createSSEStream(generator, { onCancel })` 建立 ReadableStream
- `onCancel` callback 在客戶端斷線時觸發，保存已累積的 assistant 文字到 DB
- Chat API routes 回傳 `text/event-stream`，header 帶 `X-Conversation-Id`
- `getActiveStreamIds()` 追蹤進行中的串流，防止清理程序誤刪活躍對話

### 自動清理排程

- 清理模組（`src/lib/cleanup/`）：過期快取、auth sessions、分享、對話（90 天）、使用記錄（180 天）
- 透過 Next.js `instrumentation.ts` hook 啟動排程器：啟動後 30 秒首次執行，之後每 6 小時
- 每 7 天執行一次 SQLite VACUUM
- 手動觸發：`POST /api/admin/cleanup`（需認證）

### GitHub App 整合

透過 GitHub App 的 Installation Access Token 認證 clone private repos，並支援從組織瀏覽及批次匯入 repo。

- **環境變數**（可選）：`GITHUB_APP_ID`、`GITHUB_PRIVATE_KEY`（PEM 內容或檔案路徑）
- **模組**：`src/lib/github/`（`auth.ts` JWT 產生與 token 快取、`api.ts` API 封裝、`types.ts` 型別）
- **認證流程**：App ID + Private Key → RS256 JWT → Installation Access Token（記憶體快取，過期前 5 分鐘自動刷新）
- **clone/sync**：有 `installationId` 的 repo 自動用 `x-access-token:{token}@github.com` URL 認證
- **安全**：帶 token 的 URL 不 log 也不存 DB，`syncRepo` 完成後還原 remote URL
- **不需額外 npm 套件**，用 Node.js 內建 `crypto` + `fetch`

## 關鍵技術限制

- **`--print --output-format stream-json` 必須搭配 `--verbose`**，否則 stdout 無輸出
- **spawn 後必須 `proc.stdin.end()`**，否則程序可能卡住等待 stdin
- **tsconfig.json 必須 exclude `repos/` 和 `data/`**，避免 TypeScript 檢查 cloned repos
- **next.config.ts 需要 `serverExternalPackages: ["better-sqlite3", "simple-git"]`**
- **.npmrc 需設定 `onlyBuiltDependencies[]=better-sqlite3`** 讓 pnpm 正確編譯 native module
- shadcn/ui CSS 變數格式是 HSL 無 `hsl()` 函數：`--primary: 0 0% 9%`，使用時要包 `hsl(var(--primary))`
- **Zustand SSR**：所有使用 store 的元件必須為 `"use client"`
- **NextAuth Edge 相容**：中間件只能用 `authConfig`（不含 adapter），完整 `auth()` 只在 Node.js runtime 使用
- **AgentProvider 介面目前仍有 Claude Code 耦合**：`AgentQueryOptions` 的 `tools`, `agents`, `sessionId` 等欄位是 Claude Code 特有的，未來擴展到其他 provider 時需重構

## API 端點

| 端點 | 方法 | 功能 |
|-----|------|------|
| `/api/repos` | GET/POST | 列出/新增 repo（POST 觸發 clone） |
| `/api/repos/[id]` | GET/DELETE | 取得/移除 repo |
| `/api/repos/[id]/sync` | POST | 拉取最新變更 |
| `/api/repos/[id]/scan` | POST | 自動掃描 repo 元資料（SSE stream） |
| `/api/repos/[id]/scan-with-doc` | POST | 文件輔助掃描（body 含 `attachmentId?`, `documentText?`） |
| `/api/chat/[repoId]` | POST | 單 repo 對話（SSE stream，body 含 `message`, `conversationId?`, `model?`, `attachmentIds?`） |
| `/api/chat/[repoId]/history` | GET | 取得對話歷史訊息 |
| `/api/chat/orchestrator` | POST | 跨 repo 對話（SSE stream，同上） |
| `/api/chat/analysis` | POST | 需求分析模式（SSE stream，structuredOutput + 多輪迭代 + Opus） |
| `/api/conversations` | GET | 對話列表（query: `repoId?`, `type?`） |
| `/api/conversations/[id]` | DELETE | 刪除對話 |
| `/api/conversations/[id]/shares` | GET | 列出對話的分享連結 |
| `/api/share` | POST | 建立分享連結 |
| `/api/share/[token]` | GET/DELETE | 讀取/撤銷分享（GET 公開無需認證） |
| `/api/upload` | POST | 上傳附件（multipart/form-data） |
| `/api/settings` | GET/PUT | 全域設定（如 orchestrator 自訂提示） |
| `/api/usage` | GET | Token 使用統計 |
| `/api/admin/cleanup` | POST | 手動觸發資料清理 |
| `/api/github/status` | GET | GitHub App 設定狀態 |
| `/api/github/installations` | GET | 列出已安裝 App 的組織 |
| `/api/github/installations/[id]/repos` | GET | 列出組織的 repo（標記已匯入） |
| `/api/github/import` | POST | 批次匯入 repo |

## 前端頁面

| 路由 | 功能 |
|------|------|
| `/` | 首頁（repo 列表 + 總覽） |
| `/repos` | Repo 管理 |
| `/repos/[repoId]` | 單 repo 聊天介面 |
| `/orchestrator` | 跨 repo 總顧問 |
| `/analysis` | PM 需求分析（structuredOutput + Opus） |
| `/conversations` | 全域對話列表（標籤過濾：全部/Repo/總顧問/分析） |
| `/settings` | 全域設定 |
| `/login` | Google OAuth 登入 |
| `/share/[token]` | 公開分享頁面（無需登入） |

## 執行時路徑

- Clone 的 repos：`./repos/[name]-[id-prefix]/`
- SQLite DB：`./data/repo-agent-swarm.db`
- 上傳檔案：`./data/uploads/[uuid]/`
- Claude CLI binary：`./node_modules/.bin/claude`

## 語言

所有回覆與 UI 文字使用繁體中文（台灣用語）。系統提示（`src/lib/agents/prompts.ts`）也以繁體中文撰寫。
