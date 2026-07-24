export type SecretReader = (name: string) => string | undefined;

export function timingSafeEqual(a: string, b: string): boolean {
  const bufA = new TextEncoder().encode(a);
  const bufB = new TextEncoder().encode(b);
  if (bufA.length !== bufB.length) return false;

  let diff = 0;
  for (let i = 0; i < bufA.length; i += 1) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

export function isAuthorizedDirectEmailRequest(
  req: Request,
  readSecret: SecretReader,
): boolean {
  const internalToken = readSecret("INTERNAL_EMAIL_TOKEN");
  const providedToken = req.headers.get("x-internal-token");
  if (
    internalToken &&
    providedToken &&
    timingSafeEqual(providedToken, internalToken)
  ) {
    return true;
  }

  const serviceKey = readSecret("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (serviceKey && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice("Bearer ".length).trim();
    if (bearer && timingSafeEqual(bearer, serviceKey)) return true;
  }

  return false;
}

export function getAuthHookSigningSecret(
  readSecret: SecretReader,
): string | null {
  const configured = (
    readSecret("SEND_EMAIL_HOOK_SECRET") ??
      readSecret("AUTH_EMAIL_HOOK_SECRET") ??
      ""
  ).trim();
  if (!configured) return null;

  // Supabase displays generated HTTP Auth Hook secrets as
  // `v1,whsec_<base64>`, while the Standard Webhooks verifier expects only
  // the base64 portion.
  const normalized = configured.replace(/^v1,whsec_/, "").trim();
  return normalized || null;
}
