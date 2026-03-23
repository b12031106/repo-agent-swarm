import { auth } from "@/lib/auth";

/**
 * Get the authenticated user from the current request.
 * Returns the user object or null if not authenticated.
 */
export async function getUser() {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Get the authenticated user, throwing a Response if not authenticated.
 * Use this in API routes that require authentication.
 */
export async function getRequiredUser() {
  const user = await getUser();
  if (!user?.id) {
    throw new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  return user as { id: string; name?: string | null; email?: string | null; image?: string | null };
}
