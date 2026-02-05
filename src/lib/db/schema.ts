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
