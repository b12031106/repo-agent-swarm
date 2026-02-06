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
API Routes (Next.js App Router, /api/*)
    ↓
Agent Layer (AgentProvider → CLI spawn)  →  SQLite (Drizzle ORM)
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
- **RepoAgent** (`src/lib/agents/repo-agent.ts`)：單 repo 對話，工具 `Read,Glob,Grep,Bash`，預算 $0.5/query，session resume 失敗自動重試
- **OrchestratorAgent** (`src/lib/agents/orchestrator-agent.ts`)：跨 repo 總顧問，`--agents` flag 定義 subagents，預算 $2.0/query
- **Provider registry** (`src/lib/agents/providers/index.ts`)：`registerProvider()`, `getProvider()`, `getDefaultProvider()`

Claude Code CLI 呼叫格式：
```bash
claude --print --output-format stream-json --verbose \
  --model sonnet --system-prompt "..." --tools "Read,Glob,Grep,Bash" \
  --dangerously-skip-permissions --max-budget-usd 0.5 \
  [--resume sessionId] "user message"
```

### 模型選擇

- 支援 per-conversation 切換：sonnet（預設）、haiku、opus
- DB `conversations.model` 欄位記錄每個對話的模型
- 前端 `ModelSelector` 在輸入框左下角，串流中停用切換
- API 優先級：request body `model` > conversation 已存 model > `"sonnet"`

### 資料層

- SQLite + Drizzle ORM，5 張表：`repos`, `settings`, `conversations`, `messages`, `usageRecords`
- DB 路徑：`./data/repo-agent-swarm.db`（首次查詢自動建立）
- Schema 定義在 `src/lib/db/schema.ts`，連線與 inline migration 在 `src/lib/db/index.ts`
- 新欄位的 migration 使用 `ALTER TABLE ADD COLUMN` + try-catch 包裹
- `settings` 表為 key-value 結構，用於全域設定（如 `orchestratorCustomPrompt`）

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

## 關鍵技術限制

- **`--print --output-format stream-json` 必須搭配 `--verbose`**，否則 stdout 無輸出
- **spawn 後必須 `proc.stdin.end()`**，否則程序可能卡住等待 stdin
- **tsconfig.json 必須 exclude `repos/` 和 `data/`**，避免 TypeScript 檢查 cloned repos
- **next.config.ts 需要 `serverExternalPackages: ["better-sqlite3", "simple-git"]`**
- **.npmrc 需設定 `onlyBuiltDependencies[]=better-sqlite3`** 讓 pnpm 正確編譯 native module
- shadcn/ui CSS 變數格式是 HSL 無 `hsl()` 函數：`--primary: 0 0% 9%`，使用時要包 `hsl(var(--primary))`
- **Zustand SSR**：所有使用 store 的元件必須為 `"use client"`
- **AgentProvider 介面目前仍有 Claude Code 耦合**：`AgentQueryOptions` 的 `tools`, `agents`, `sessionId` 等欄位是 Claude Code 特有的，未來擴展到其他 provider 時需重構

## API 端點

| 端點 | 方法 | 功能 |
|-----|------|------|
| `/api/repos` | GET/POST | 列出/新增 repo（POST 觸發 clone） |
| `/api/repos/[id]` | GET/DELETE | 取得/移除 repo |
| `/api/repos/[id]/sync` | POST | 拉取最新變更 |
| `/api/chat/[repoId]` | POST | 單 repo 對話（SSE stream，body 含 `message`, `conversationId?`, `model?`, `attachmentIds?`） |
| `/api/chat/[repoId]/history` | GET | 取得對話歷史訊息 |
| `/api/chat/orchestrator` | POST | 跨 repo 對話（SSE stream，同上） |
| `/api/conversations` | GET/POST | 對話列表/載入訊息 |
| `/api/conversations/[id]` | DELETE | 刪除對話 |
| `/api/upload` | POST | 上傳附件（multipart/form-data） |
| `/api/settings` | GET/PUT | 全域設定（如 orchestrator 自訂提示） |
| `/api/usage` | GET | Token 使用統計 |

## 執行時路徑

- Clone 的 repos：`./repos/[name]-[id-prefix]/`
- SQLite DB：`./data/repo-agent-swarm.db`
- 上傳檔案：`./data/uploads/[uuid]/`
- Claude CLI binary：`./node_modules/.bin/claude`

## 語言

所有回覆與 UI 文字使用繁體中文（台灣用語）。系統提示（`src/lib/agents/prompts.ts`）也以繁體中文撰寫。
