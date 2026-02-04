# GitHub Copilot SDK 整合規劃

> 研究結論與技術整合方案，目標：讓使用者在對話時自由選擇 Agent Provider（Claude Code / GitHub Copilot）及底層模型。

---

## 一、研究結論

### 1.1 GitHub Copilot 生態系現況

GitHub Copilot 目前有三個程式化整合途徑：

| 途徑 | 套件 | 狀態 | 適用場景 |
|------|------|------|----------|
| **Copilot SDK** | `@github/copilot-sdk` | Technical Preview (2026-01) | 嵌入 Copilot agentic 引擎到自有應用 |
| **Copilot CLI** | `@github/copilot` (npm) / `copilot` (binary) | Stable | 終端互動 / `-p` 單次查詢 |
| **Copilot Extensions SDK** | `@copilot-extensions/preview-sdk` | Preview | 建構 GitHub App 類型的 @mention agent |

**結論：採用 `@github/copilot-sdk`（JSON-RPC 方式）作為整合途徑。** 理由：
- 提供完整的 streaming events、session 管理、custom tools
- 透過 JSON-RPC 與 Copilot CLI server mode 溝通，比 stdout parsing 穩定
- 支援多模型切換（Claude Sonnet 4.5/4、GPT-5、Gemini 3 等）
- Copilot CLI 本身**沒有** `--output-format stream-json` 等結構化輸出（[Issue #52](https://github.com/github/copilot-cli/issues/52) 仍 open），所以 raw spawn 不可行

### 1.2 Copilot SDK 架構

```
我們的應用 → CopilotClient → JSON-RPC → copilot CLI (server mode)
```

**核心 API：**

```typescript
import { CopilotClient, defineTool } from "@github/copilot-sdk";

const client = new CopilotClient({ githubToken: process.env.GH_TOKEN });

const session = await client.createSession({
  model: "claude-sonnet-4.5",
  streaming: true,
  systemMessage: { content: "..." },
  tools: [customToolDef],
});

// 事件驅動串流
session.on("assistant.message_delta", (e) => /* 文字串流 */);
session.on("tool.execution_start", (e) => /* 工具呼叫 */);
session.on("tool.execution_end", (e) => /* 工具結果 */);
session.on("session.idle", () => /* 查詢完成 */);

await session.send({ prompt: "..." });
```

**Copilot SDK 支援的串流事件：**

| 事件 | 對應 AgentStreamEvent |
|------|----------------------|
| `assistant.message_delta` | `{ type: "text", content }` |
| `assistant.message` | `{ type: "text", content }` (完整) |
| `tool.execution_start` | `{ type: "tool_use", tool }` |
| `tool.execution_end` | `{ type: "tool_result", toolResult }` |
| `session.idle` | `{ type: "done" }` |
| `session.created` | 擷取 sessionId |

### 1.3 Copilot 支援的模型

| 模型 | 備註 |
|------|------|
| Claude Sonnet 4.5 | Copilot CLI 預設 |
| Claude Sonnet 4 | 可用 |
| GPT-5 | 可用 |
| GPT-5 mini | 免 premium request |
| GPT-4.1 | 免 premium request |
| Gemini 3 Pro | 可用 |
| Gemini 3 Flash | 可用 |
| Gemini 2.5 Pro | 可用 |

### 1.4 認證需求

- 需要 GitHub Copilot 訂閱（Pro/Pro+/Business/Enterprise）
- 認證方式：`GH_TOKEN` 環境變數（Fine-Grained PAT，需有 "Copilot Requests" 權限）
- 或使用 `gh` CLI 已認證的 credentials（自動偵測）

### 1.5 與 Claude Code CLI 比較

| 面向 | Claude Code CLI | Copilot SDK |
|------|----------------|-------------|
| 串流方式 | spawn → stdout JSON lines | JSON-RPC events |
| 結構化輸出 | `--output-format stream-json` ✅ | CLI 無，SDK 有 ✅ |
| 模型 | Sonnet/Haiku/Opus（Anthropic only） | 多家（Anthropic/OpenAI/Google） |
| Session 管理 | `--resume sessionId` | `createSession()` / `resumeSession()` |
| 預算控制 | `--max-budget-usd` | 訂閱配額制 |
| 子 Agent | `--agents` flag | 內建 Explore/Task/Plan/Code-review |
| 權限控制 | `--dangerously-skip-permissions` | `--allow-all-tools` / `--allow-tool` |
| 穩定度 | GA (穩定) | Technical Preview (可能破壞) |
| Custom Tools | 命名工具集 | Zod-based `defineTool()` |

---

## 二、現有架構分析

### 2.1 現有 Provider 介面

```typescript
// src/lib/agents/providers/types.ts
interface AgentProvider {
  readonly name: string;
  query(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent>;
  isAvailable(): Promise<boolean>;
  getSupportedModels(): ModelInfo[];
}

interface AgentQueryOptions {
  message: string;
  systemPrompt: string;
  tools?: string;          // ← Claude Code 特有：逗號分隔的工具名
  model?: string;
  maxBudgetUsd?: number;   // ← Claude Code 特有：預算控制
  cwd?: string;
  sessionId?: string | null;
  agents?: Record<...>;    // ← Claude Code 特有：子 agent 定義
}
```

**問題：`AgentQueryOptions` 耦合 Claude Code 概念。** `tools`（字串）、`agents`（Claude CLI --agents 格式）、`maxBudgetUsd` 等都是 Claude Code 特有的。

### 2.2 現有資料流

```
前端 ModelSelector → ChatStore(session.model) → POST body { model }
    → API Route → effectiveModel → Agent.query(msg, sid, model)
    → Provider.query({ model, ... }) → Claude CLI --model
```

**目前缺少的：** Provider 選擇，只有 model 選擇。

### 2.3 DB Schema 現狀

```sql
conversations (
  ...
  model TEXT DEFAULT 'sonnet',  -- 只記錄模型，不記錄 provider
  session_id TEXT               -- Claude Code session，不同 provider 的 session 語義不同
)
```

---

## 三、整合方案設計

### 3.1 核心設計原則

1. **Provider 與 Model 正交化** — Provider 決定「用哪個引擎」，Model 決定「用哪個模型」
2. **向後相容** — 現有對話不受影響，預設仍為 `claude-code` + `sonnet`
3. **漸進式** — 先重構介面，再加 Copilot provider，最後更新 UI
4. **Provider 能力差異透過介面抽象** — 不是每個 provider 都支援 sub-agents 或 budget control

### 3.2 重構 AgentQueryOptions — 拆分通用/專屬

```typescript
// ===== 通用選項（所有 provider 共用） =====
interface AgentQueryOptions {
  message: string;
  systemPrompt: string;
  model?: string;
  cwd?: string;
  sessionId?: string | null;
}

// ===== Provider 特有能力（用 capabilities 物件攜帶） =====
interface ProviderCapabilities {
  // Claude Code 特有
  claudeCode?: {
    tools?: string;                    // "Read,Glob,Grep,Bash"
    agents?: Record<string, { description: string; prompt: string }>;
    maxBudgetUsd?: number;
  };
  // Copilot SDK 特有
  copilot?: {
    tools?: CopilotToolDef[];          // defineTool() 產生的工具定義
    allowAllTools?: boolean;
    allowedTools?: string[];
    deniedTools?: string[];
  };
}

// 合併後的完整選項
interface AgentQueryOptions {
  message: string;
  systemPrompt: string;
  model?: string;
  cwd?: string;
  sessionId?: string | null;
  capabilities?: ProviderCapabilities; // ← 新增
}
```

**為什麼不用 `extends`？** 因為 RepoAgent/OrchestratorAgent 需要在不知道底層 provider 類型的情況下組裝 options。用 capabilities 物件可以讓業務層同時準備多個 provider 的參數，由 provider 自行取用。

### 3.3 擴展 AgentProvider 介面

```typescript
interface AgentProvider {
  readonly name: string;
  readonly displayName: string;                    // ← 新增：UI 顯示名
  query(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent>;
  isAvailable(): Promise<boolean>;
  getSupportedModels(): ModelInfo[];
  getCapabilityFlags(): ProviderCapabilityFlags;   // ← 新增
}

interface ProviderCapabilityFlags {
  supportsSubAgents: boolean;      // Claude Code: true, Copilot: false (用內建)
  supportsBudgetControl: boolean;  // Claude Code: true, Copilot: false
  supportsSessionResume: boolean;  // 兩者都 true
  supportsCustomTools: boolean;    // 兩者都 true，但格式不同
}
```

### 3.4 CopilotSdkProvider 實作

```typescript
// src/lib/agents/providers/copilot-sdk-provider.ts

import { CopilotClient, defineTool } from "@github/copilot-sdk";

export class CopilotSdkProvider implements AgentProvider {
  readonly name = "copilot";
  readonly displayName = "GitHub Copilot";

  private client: CopilotClient | null = null;
  private sessions: Map<string, CopilotSession> = new Map();

  async *query(options: AgentQueryOptions): AsyncGenerator<AgentStreamEvent> {
    const client = await this.getClient();

    // 建立或恢復 session
    const session = options.sessionId
      ? await client.resumeSession(options.sessionId)
      : await client.createSession({
          model: this.mapModel(options.model),
          streaming: true,
          systemMessage: { content: options.systemPrompt },
          workingDirectory: options.cwd,
        });

    // 轉為 AsyncGenerator
    yield* this.sessionToGenerator(session, options.message);
  }

  private async *sessionToGenerator(
    session: CopilotSession,
    message: string,
  ): AsyncGenerator<AgentStreamEvent> {
    // 使用 Promise + event listener 轉換為 async generator
    const eventQueue: AgentStreamEvent[] = [];
    let resolve: (() => void) | null = null;
    let done = false;

    session.on("assistant.message_delta", (e) => {
      eventQueue.push({ type: "text", content: e.data.deltaContent });
      resolve?.();
    });

    session.on("tool.execution_start", (e) => {
      eventQueue.push({ type: "tool_use", tool: e.data.toolName });
      resolve?.();
    });

    session.on("tool.execution_end", (e) => {
      eventQueue.push({
        type: "tool_result",
        tool: e.data.toolName,
        toolResult: e.data.output,
      });
      resolve?.();
    });

    session.on("session.idle", () => {
      eventQueue.push({ type: "done", sessionId: session.id });
      done = true;
      resolve?.();
    });

    await session.send({ prompt: message });

    // Yield events as they arrive
    while (!done || eventQueue.length > 0) {
      if (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      } else {
        await new Promise<void>((r) => { resolve = r; });
      }
    }
  }

  getSupportedModels(): ModelInfo[] {
    return [
      { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", description: "Copilot 預設，平衡品質" },
      { id: "claude-sonnet-4", label: "Claude Sonnet 4", description: "前代 Sonnet" },
      { id: "gpt-5", label: "GPT-5", description: "OpenAI 最強模型" },
      { id: "gpt-5-mini", label: "GPT-5 mini", description: "快速且免 premium" },
      { id: "gpt-4.1", label: "GPT-4.1", description: "穩定且免 premium" },
      { id: "gemini-3-pro", label: "Gemini 3 Pro", description: "Google 最強模型" },
      { id: "gemini-3-flash", label: "Gemini 3 Flash", description: "Google 快速模型" },
    ];
  }

  async isAvailable(): Promise<boolean> {
    // 檢查 GH_TOKEN 是否存在，以及 copilot CLI 是否可用
    return !!(process.env.GH_TOKEN || process.env.GITHUB_TOKEN);
  }

  private mapModel(model?: string): string {
    // 允許使用者傳入短名或完整名
    const map: Record<string, string> = {
      "sonnet": "claude-sonnet-4.5",
      "claude-sonnet-4.5": "claude-sonnet-4.5",
      "gpt-5": "gpt-5",
      "gemini-3-pro": "gemini-3-pro",
      // ... 其他映射
    };
    return map[model || "claude-sonnet-4.5"] || model || "claude-sonnet-4.5";
  }

  private async getClient(): Promise<CopilotClient> {
    if (!this.client) {
      this.client = new CopilotClient({
        githubToken: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
      });
    }
    return this.client;
  }

  getCapabilityFlags(): ProviderCapabilityFlags {
    return {
      supportsSubAgents: false,       // Copilot 用內建 agent，不支援自訂子 agent
      supportsBudgetControl: false,
      supportsSessionResume: true,
      supportsCustomTools: true,
    };
  }
}
```

### 3.5 DB Schema 變更

```sql
-- conversations 表新增 provider 欄位
ALTER TABLE conversations ADD COLUMN provider TEXT DEFAULT 'claude-code';
```

```typescript
// src/lib/db/schema.ts
export const conversations = sqliteTable("conversations", {
  // ... 現有欄位
  provider: text("provider").default("claude-code"),  // ← 新增
  model: text("model").default("sonnet"),
});
```

Migration 方式（同現有做法）：
```typescript
// src/lib/db/index.ts
try {
  db.run(sql`ALTER TABLE conversations ADD COLUMN provider TEXT DEFAULT 'claude-code'`);
} catch { /* column already exists */ }
```

### 3.6 Provider Registry 改進

```typescript
// src/lib/agents/providers/index.ts

import { ClaudeCodeProvider } from "./claude-code-provider";
import { CopilotSdkProvider } from "./copilot-sdk-provider";

const providers = new Map<string, AgentProvider>();

// 自動註冊所有 provider
const allProviders = [
  new ClaudeCodeProvider(),
  new CopilotSdkProvider(),
];

for (const p of allProviders) {
  providers.set(p.name, p);
}

// 預設 provider 改為可配置
const DEFAULT_PROVIDER = process.env.DEFAULT_PROVIDER || "claude-code";

export function getDefaultProvider(): AgentProvider {
  return providers.get(DEFAULT_PROVIDER) || allProviders[0];
}

// 新增：取得所有可用的 provider（檢查 isAvailable）
export async function getAvailableProviders(): Promise<AgentProvider[]> {
  const results = await Promise.all(
    Array.from(providers.values()).map(async (p) => ({
      provider: p,
      available: await p.isAvailable(),
    }))
  );
  return results.filter((r) => r.available).map((r) => r.provider);
}

// 新增：跨 provider 的模型清單
export async function getAllAvailableModels(): Promise<{
  provider: string;
  providerDisplayName: string;
  models: ModelInfo[];
}[]> {
  const available = await getAvailableProviders();
  return available.map((p) => ({
    provider: p.name,
    providerDisplayName: p.displayName,
    models: p.getSupportedModels(),
  }));
}
```

### 3.7 RepoAgent / OrchestratorAgent 調整

**核心改動：provider 動態切換，不再寫死。**

```typescript
// RepoAgent 調整
export interface RepoAgentConfig {
  repoId: string;
  repoName: string;
  repoPath: string;
  model?: string;
  provider?: AgentProvider;
  providerName?: string;  // ← 新增：允許用名字指定
}

export class RepoAgent {
  // query() 新增 provider 切換能力
  async *query(
    message: string,
    conversationSessionId?: string,
    model?: string,
    providerOverride?: AgentProvider,  // ← 新增
  ): AsyncGenerator<AgentStreamEvent> {
    const provider = providerOverride || this.provider;
    const sid = conversationSessionId || this.sessionId;
    yield* this.runQuery(provider, message, sid, model);
  }

  private async *runQuery(
    provider: AgentProvider,
    message: string,
    sessionId?: string | null,
    model?: string,
  ): AsyncGenerator<AgentStreamEvent> {
    const systemPrompt = getRepoAgentSystemPrompt(/*...*/);

    // 根據 provider 能力組裝 options
    const caps = provider.getCapabilityFlags();
    const options: AgentQueryOptions = {
      message,
      systemPrompt,
      model: model || this.config.model || "sonnet",
      cwd: this.config.repoPath,
      sessionId,
    };

    if (caps.supportsCustomTools) {
      // Claude Code 用字串格式，Copilot 用另一種
      // 由 capabilities 物件攜帶
      options.capabilities = {
        claudeCode: {
          tools: "Read,Glob,Grep,Bash",
          maxBudgetUsd: this.config.maxBudgetUsd || 0.5,
        },
        copilot: {
          allowAllTools: true,
        },
      };
    }

    for await (const event of provider.query(options)) {
      // ... 現有邏輯不變
    }
  }
}
```

**OrchestratorAgent 的子 agent 問題：**

Claude Code 的 `--agents` flag 是一個獨特功能，Copilot SDK 沒有直接對應。處理策略：

| 策略 | 說明 | 推薦 |
|------|------|------|
| A. 忽略子 agent | Copilot 不使用子 agent，所有 repo 資訊放入 system prompt | ✅ 第一階段推薦 |
| B. 多 session 模擬 | 為每個 repo 開一個 Copilot session，orchestrator 自己串接 | 太複雜 |
| C. MCP 整合 | 用 MCP server 暴露各 repo 的工具 | 未來方向 |

**第一階段建議：策略 A。** OrchestratorAgent 偵測到 Copilot provider 時，將所有 repo 資訊注入 system prompt，不使用 `agents` 選項。Copilot 支援的內建工具（file read, grep, shell）足以完成跨 repo 分析。

### 3.8 AgentManager 調整

```typescript
class AgentManagerImpl {
  private agents: Map<string, RepoAgent> = new Map();

  // Key 改為 `${repoId}:${providerName}` 避免衝突
  getAgent(config: RepoAgentConfig, providerName?: string): RepoAgent {
    const key = `${config.repoId}:${providerName || "default"}`;
    const existing = this.agents.get(key);
    if (existing) return existing;

    let provider: AgentProvider | undefined;
    if (providerName) {
      provider = getProvider(providerName);
    }
    if (!provider) {
      provider = getDefaultProvider();
    }

    const agent = new RepoAgent({ ...config, provider });
    this.agents.set(key, agent);
    return agent;
  }
}
```

### 3.9 API 層變更

```typescript
// POST /api/chat/[repoId]
// Request body 新增 provider 欄位
interface ChatRequest {
  message: string;
  conversationId?: string;
  model?: string;
  provider?: string;     // ← 新增："claude-code" | "copilot"
}

// Route handler 調整
const { message, conversationId, model, provider: providerName } = body;

// Provider 優先級：request > conversation 已存 > default
const effectiveProvider = providerName || convProvider || "claude-code";
const effectiveModel = model || convModel || "sonnet";

// 驗證 provider 可用性
const providerInst = getProvider(effectiveProvider);
if (!providerInst || !(await providerInst.isAvailable())) {
  return NextResponse.json(
    { error: `Provider "${effectiveProvider}" is not available` },
    { status: 400 }
  );
}

// 取得 agent 時帶入 provider
const agent = agentManager.getAgent({ repoId, repoName, repoPath }, effectiveProvider);
```

**新增 API：取得可用 provider 與模型**

```typescript
// GET /api/providers
// Response:
[
  {
    name: "claude-code",
    displayName: "Claude Code",
    available: true,
    models: [
      { id: "sonnet", label: "Sonnet", description: "平衡速度與品質" },
      { id: "haiku", label: "Haiku", description: "快速回應" },
      { id: "opus", label: "Opus", description: "最高品質" },
    ],
    capabilities: {
      supportsSubAgents: true,
      supportsBudgetControl: true,
      supportsSessionResume: true,
      supportsCustomTools: true,
    }
  },
  {
    name: "copilot",
    displayName: "GitHub Copilot",
    available: true, // 取決於 GH_TOKEN 是否存在
    models: [
      { id: "claude-sonnet-4.5", label: "Claude Sonnet 4.5", description: "Copilot 預設" },
      { id: "gpt-5", label: "GPT-5", description: "OpenAI 最強模型" },
      // ...
    ],
    capabilities: {
      supportsSubAgents: false,
      supportsBudgetControl: false,
      supportsSessionResume: true,
      supportsCustomTools: true,
    }
  }
]
```

### 3.10 前端 UI 變更

#### ProviderModelSelector 元件（取代現有 ModelSelector）

```
┌─────────────────────────────────────────────────┐
│ ┌──────────────┐  ┌──────────────────────────┐  │
│ │ Claude Code ▼│  │ Sonnet │ Haiku │ Opus    │  │
│ └──────────────┘  └──────────────────────────┘  │
│                                                  │
│  切換 provider 後，模型列表自動更新：            │
│                                                  │
│ ┌──────────────┐  ┌──────────────────────────┐  │
│ │ Copilot    ▼ │  │ Sonnet 4.5 │ GPT-5 │ ...│  │
│ └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────┘
```

**設計要點：**
- Provider 用 dropdown，model 用 horizontal button group（保持現有風格）
- 不可用的 provider 灰顯並標注原因（如「需要 GH_TOKEN」）
- 切換 provider 時自動選擇該 provider 的預設模型
- 串流中禁止切換 provider 和 model
- Provider 與 model 選擇隨對話儲存

#### ChatStore 擴展

```typescript
interface ChatSession {
  // ... 現有欄位
  provider: string;  // ← 新增
  model: string;
}

// 新增 action
setSessionProvider(chatId: string, provider: string): void;
```

#### 資料流擴展

```
ProviderModelSelector
    → ChatStore(session.provider, session.model)
    → POST body { message, conversationId, provider, model }
    → API Route
    → DB (conversation.provider, conversation.model)
    → AgentManager(providerName)
    → Provider.query({ model })
```

---

## 四、實作階段規劃

### Phase 1：介面重構（低風險，無功能變更）

1. `AgentQueryOptions` 加入 `capabilities` 物件
2. `AgentProvider` 加入 `displayName`、`getCapabilityFlags()`
3. `ClaudeCodeProvider` 從 `capabilities.claudeCode` 讀取 `tools`/`agents`/`maxBudgetUsd`
4. 保持向後相容：`options.tools` 仍可用（deprecated）
5. DB migration：`conversations` 加 `provider` 欄位

**驗證：** 現有功能完全不受影響，所有測試通過。

### Phase 2：CopilotSdkProvider 實作

1. `pnpm add @github/copilot-sdk @github/copilot`
2. 實作 `CopilotSdkProvider`（如 3.4 節）
3. Provider registry 自動註冊
4. 環境變數：`GH_TOKEN` 或 `GITHUB_TOKEN`
5. 新增 `GET /api/providers` API

**驗證：** Copilot provider 可獨立查詢，串流事件正確轉換。

### Phase 3：前端 Provider + Model 選擇器

1. 新增 `ProviderModelSelector` 元件
2. ChatStore 加入 `provider` 狀態
3. `useChat` hook 傳遞 provider
4. API routes 處理 provider 參數
5. DB 記錄每個對話的 provider

**驗證：** 使用者可在 UI 切換 provider 和 model，選擇會被記憶。

### Phase 4：Orchestrator 多 provider 支援

1. OrchestratorAgent 根據 provider capabilities 調整行為
2. 非 Claude Code provider 時，將 repo 資訊注入 system prompt（策略 A）
3. 串流與 session 管理適配

**驗證：** 跨 repo 對話在兩個 provider 下都能運作。

### Phase 5（未來）：進階整合

- `@anthropic-ai/claude-agent-sdk` 作為 Claude Code 的替代 provider（更高階 API）
- Copilot MCP server 整合
- 自訂工具（Zod-based）對兩個 provider 的統一抽象
- BYOK 支援（Copilot Enterprise 功能）

---

## 五、檔案變更清單

| 檔案 | 變更 | Phase |
|------|------|-------|
| `src/lib/agents/providers/types.ts` | 擴展 `AgentQueryOptions`、`AgentProvider` | 1 |
| `src/lib/agents/providers/claude-code-provider.ts` | 適配新 capabilities 格式 | 1 |
| `src/lib/agents/providers/copilot-sdk-provider.ts` | **新增** | 2 |
| `src/lib/agents/providers/index.ts` | 多 provider 註冊、`getAvailableProviders()` | 2 |
| `src/lib/agents/repo-agent.ts` | provider 動態切換 | 1 |
| `src/lib/agents/orchestrator-agent.ts` | 多 provider 適配 | 4 |
| `src/lib/agents/agent-manager.ts` | cache key 含 provider | 1 |
| `src/lib/db/schema.ts` | `conversations.provider` 欄位 | 1 |
| `src/lib/db/index.ts` | migration | 1 |
| `src/types/index.ts` | `ChatRequest.provider`, `Conversation.provider` | 1 |
| `src/app/api/chat/[repoId]/route.ts` | provider 參數處理 | 3 |
| `src/app/api/chat/orchestrator/route.ts` | provider 參數處理 | 4 |
| `src/app/api/providers/route.ts` | **新增** GET API | 2 |
| `src/components/chat/provider-model-selector.tsx` | **新增** UI 元件 | 3 |
| `src/components/chat/chat-container.tsx` | 使用新 selector | 3 |
| `src/stores/chat-store.ts` | `provider` 狀態 | 3 |
| `src/hooks/useChat.ts` | `provider` 傳遞 | 3 |
| `package.json` | `@github/copilot-sdk` 依賴 | 2 |

---

## 六、風險與注意事項

| 風險 | 影響 | 緩解措施 |
|------|------|----------|
| Copilot SDK 是 Technical Preview | API 可能破壞性變更 | 用 adapter pattern 隔離，鎖定版本 |
| Copilot CLI 需要安裝 | 部署環境可能沒有 | `isAvailable()` 檢查，UI 灰顯不可用 provider |
| 不同 provider 的 session 語義不同 | 切換 provider 後舊 session 失效 | 切換 provider 時清除 sessionId |
| Copilot 無預算控制 | 可能超出預期用量 | 文件告知使用者，Copilot 依賴訂閱配額 |
| 模型 ID 跨 provider 不統一 | `sonnet` 在 Claude Code 有效但在 Copilot 要寫 `claude-sonnet-4.5` | 每個 provider 內部做映射 |
| Copilot 不支援 `--agents` 子 agent 模式 | Orchestrator 功能受限 | 退化為全文 system prompt 注入（策略 A） |

---

## 七、環境變數

```env
# 現有
# (Claude Code 使用 Anthropic API key，由 CLI 自行管理)

# 新增
GH_TOKEN=ghp_xxxx              # GitHub Fine-Grained PAT (需 Copilot Requests 權限)
DEFAULT_PROVIDER=claude-code    # 預設 provider (可選)
```
