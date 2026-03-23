import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const repos = sqliteTable("repos", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  githubUrl: text("github_url").notNull(),
  localPath: text("local_path").notNull(),
  status: text("status", {
    enum: ["cloning", "ready", "error", "syncing"],
  })
    .notNull()
    .default("cloning"),
  errorMessage: text("error_message"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  lastSyncedAt: text("last_synced_at"),
  customPrompt: text("custom_prompt"),
  // Service registry metadata
  description: text("description"),
  domain: text("domain"),
  serviceType: text("service_type"),
  dependenciesJson: text("dependencies_json"),
  exposedApisJson: text("exposed_apis_json"),
  techStack: text("tech_stack"),
  teamOwner: text("team_owner"),
  profileStatus: text("profile_status", {
    enum: ["empty", "draft", "confirmed"],
  }).default("empty"),
  // GitHub App installation
  installationId: integer("installation_id"),
  // Hash of repo's CLAUDE.md (or AGENTS.md / .generated-claude.md) for change detection
  claudeMdHash: text("claude_md_hash"),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  repoId: text("repo_id").references(() => repos.id, {
    onDelete: "cascade",
  }),
  sessionId: text("session_id"),
  title: text("title").notNull().default("New Conversation"),
  isOrchestrator: integer("is_orchestrator", { mode: "boolean" })
    .notNull()
    .default(false),
  model: text("model").default("sonnet"),
  type: text("type", {
    enum: ["chat", "analysis"],
  }).default("chat"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "tool"] }).notNull(),
  content: text("content").notNull(),
  toolName: text("tool_name"),
  attachmentsJson: text("attachments_json"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const cache = sqliteTable("cache", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  expiresAt: integer("expires_at").notNull(),
});

export const usageRecords = sqliteTable("usage_records", {
  id: text("id").primaryKey(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
