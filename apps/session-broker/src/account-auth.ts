// Session-broker has no user/auth database of its own - it defers to apps/api (the same
// service issuing API keys for the code-execution product) as the single source of truth for
// "who is signed in", by forwarding whatever cookie the browser sent it. This only works
// because both services' cookies share a Domain (see apps/api/src/auth.ts's KNOX_COOKIE_DOMAIN)
// - a sign-in on either product's page authenticates both.
const ACCOUNT_API_URL = process.env.KNOX_ACCOUNT_API_URL;

export interface Account {
  userId: string;
  email: string;
}

export async function resolveAccount(cookieHeader: string | undefined): Promise<Account | null> {
  if (!ACCOUNT_API_URL || !cookieHeader) return null;
  try {
    const res = await fetch(`${ACCOUNT_API_URL}/auth/whoami`, { headers: { Cookie: cookieHeader } });
    if (!res.ok) return null;
    const body = (await res.json()) as { userId?: string; email?: string };
    if (!body.userId || !body.email) return null;
    return { userId: body.userId, email: body.email };
  } catch {
    return null;
  }
}
