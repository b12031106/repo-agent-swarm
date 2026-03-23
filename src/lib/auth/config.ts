import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAINS =
  process.env.ALLOWED_EMAIL_DOMAINS?.split(",")
    .map((d) => d.trim())
    .filter(Boolean) || [];

/**
 * Edge-safe auth config (no adapter, no Node.js dependencies).
 * Used by middleware and as base for the full auth config.
 */
export const authConfig: NextAuthConfig = {
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    signIn({ profile }) {
      if (ALLOWED_DOMAINS.length === 0) return true;
      const email = profile?.email;
      if (!email) return false;
      const domain = email.split("@")[1];
      return ALLOWED_DOMAINS.includes(domain);
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
};
