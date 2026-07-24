const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function deriveAesKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function deriveHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

const OPAQUE_OAUTH_STATE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

/**
 * Generate a 256-bit bearer value for an OAuth authorization request.
 *
 * The value itself must never be persisted. Store only hashOpaqueOAuthState's
 * output so a database read cannot recover or replay an in-flight state.
 */
export function createOpaqueOAuthState(): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/**
 * Hash an opaque OAuth state into the fixed-width lookup key persisted by the
 * server. Rejecting every other shape also bounds callback input before it is
 * handed to WebCrypto.
 */
export async function hashOpaqueOAuthState(state: string): Promise<string> {
  if (!OPAQUE_OAUTH_STATE_PATTERN.test(state)) {
    throw new Error("Invalid OAuth state");
  }
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(state));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function encryptSecret(value: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(value)),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(ciphertext)}`;
}

export async function decryptSecret(value: string, secret: string): Promise<string> {
  const [version, encodedIv, encodedCiphertext] = value.split(".");
  if (version !== "v1" || !encodedIv || !encodedCiphertext) {
    throw new Error("Unsupported encrypted value");
  }
  const key = await deriveAesKey(secret);
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(encodedIv) },
    key,
    base64UrlToBytes(encodedCiphertext),
  );
  return decoder.decode(plaintext);
}

export async function createSignedState(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const encodedPayload = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await deriveHmacKey(secret);
  const signature = new Uint8Array(
    await crypto.subtle.sign("HMAC", key, encoder.encode(encodedPayload)),
  );
  return `${encodedPayload}.${bytesToBase64Url(signature)}`;
}

export async function verifySignedState<T extends { exp?: number }>(
  state: string,
  secret: string,
): Promise<T | null> {
  const [encodedPayload, encodedSignature] = state.split(".");
  if (!encodedPayload || !encodedSignature) return null;

  try {
    const key = await deriveHmacKey(secret);
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64UrlToBytes(encodedSignature),
      encoder.encode(encodedPayload),
    );
    if (!valid) return null;
    const payload = JSON.parse(decoder.decode(base64UrlToBytes(encodedPayload))) as T;
    if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
