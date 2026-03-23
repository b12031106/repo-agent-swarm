import NextAuth from "next-auth";
import { sqliteAdapter } from "./adapter";
import { authConfig } from "./config";

/**
 * Full auth config with adapter (Node.js only - not edge-safe).
 * Used by API routes and server components.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: sqliteAdapter,
});
