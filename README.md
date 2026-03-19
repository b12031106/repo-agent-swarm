# Repo Agent Swarm

多 Repo AI 程式碼分析平台，透過 Claude Code CLI 實現串流式對話，支援單一 repo 問答、跨 repo 總顧問、以及 PM 需求分析模式。

## 功能

- **單 Repo 對話** — 針對單一程式碼庫進行 AI 問答、程式碼分析
- **跨 Repo 總顧問 (Orchestrator)** — 跨多個 repo 的架構層級分析，自動分派子 agent
- **需求分析模式** — 上傳 PRD 文件，AI 進行多輪迭代分析，產出結構化評估
- **服務目錄 (Service Registry)** — 自動掃描 repo 元資料（技術棧、API、依賴關係）
- **檔案上傳** — 支援圖片、PDF、程式碼檔案作為對話附件
- **模型切換** — 每個對話可獨立選擇 Sonnet / Haiku / Opus
- **Token 使用追蹤** — 記錄每次對話的 token 用量與費用

## 技術棧

- **前端**：Next.js 16 (App Router) + React 19 + TailwindCSS 4 + shadcn/ui + Zustand
- **後端**：Next.js API Routes + SQLite (better-sqlite3 + Drizzle ORM)
- **AI**：Claude Code CLI (`@anthropic-ai/claude-code`) via `child_process.spawn`
- **串流**：Server-Sent Events (SSE)

## 快速開始

### 前置需求

- Node.js 20+
- pnpm
- Claude Code CLI（需有效的 API key 或登入）

### 安裝與啟動

```bash
pnpm install

# 若 better-sqlite3 編譯失敗
pnpm rebuild better-sqlite3

# 開發模式
pnpm dev
```

開啟 http://localhost:3000。

## 開發指令

```bash
pnpm dev          # 開發伺服器 (port 3000)
pnpm build        # 生產構建
pnpm start        # 生產伺服器
pnpm lint         # ESLint 檢查
```

## 頁面

| 路徑 | 功能 |
|-----|------|
| `/` | 首頁 |
| `/repos` | Repo 管理（新增、刪除、同步） |
| `/repos/[repoId]` | 單 Repo 對話 |
| `/orchestrator` | 跨 Repo 總顧問對話 |
| `/analysis` | PM 需求分析模式 |

## 架構

```
前端 (React + Zustand Chat Store + SSE)
    ↓
API Routes (Next.js App Router, /api/*)
    ↓
Agent Layer (AgentProvider → CLI spawn)  →  SQLite (Drizzle ORM)
```

詳細架構說明請參考 [CLAUDE.md](./CLAUDE.md)。
