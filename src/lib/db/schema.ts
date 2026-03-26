import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

// Auth tables (NextAuth v5)
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified"),
  image: text("image"),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("provider_account_id").notNull(),
  refreshToken: text("refresh_token"),
  accessToken: text("access_token"),
  expiresAt: integer("expires_at"),
  tokenType: text("token_type"),
  scope: text("scope"),
  idToken: text("id_token"),
});

export const authSessions = sqliteTable("auth_sessions", {
  id: text("id").primaryKey(),
  sessionToken: text("session_token").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: text("expires").notNull(),
});

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
  outputStyleId: text("output_style_id"),
  type: text("type", {
    enum: ["chat", "analysis"],
  }).default("chat"),
  userId: text("user_id"),
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
  model: text("model"),
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
  userId: text("user_id"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  totalCostUsd: real("total_cost_usd").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Output styles table
export const outputStyles = sqliteTable("output_styles", {
  id: text("id").primaryKey(),
  userId: text("user_id"), // null = system preset
  name: text("name").notNull(),
  description: text("description"),
  promptText: text("prompt_text"), // null for "default" preset
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// Shares table for conversation sharing
export const shares = sqliteTable("shares", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  conversationId: text("conversation_id")
    .notNull()
    .references(() => conversations.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  messageIds: text("message_ids"), // JSON string: ["msg-id-1", "msg-id-2"] or null for entire conversation
  title: text("title"),
  expiresAt: text("expires_at"),
  viewCount: integer("view_count").notNull().default(0),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});
