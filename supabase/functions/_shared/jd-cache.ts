/**
 * JD keyword cache — read-through cache for LLM job-description keyword
 * extraction (career-ops-ats, ats-score-v2). Extraction is deterministic per
 * normalized JD text, so results are keyed by content hash and shared across
 * users. A cache hit skips the LLM call entirely.
 *
 * Backed by public.jd_keyword_cache (migration 20260720050000_jd_keyword_cache,
 * RLS service-only). All failures are non-fatal: a read error is a miss and a
 * write error just means the next caller pays for the LLM again.
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/** Whitespace/case-insensitive normalization so trivially-different JD copies hash alike. */
export function normalizeJdText(jdText: string): string {
  return jdText.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * md5 hex of "<scope>\n<normalized JD>". The scope namespaces extractor
 * payload shapes so two functions caching different shapes for the same JD
 * never collide on the primary key.
 */
export function jdHash(jdText: string, scope: string): string {
  return md5Hex(`${scope}\n${normalizeJdText(jdText)}`);
}

export async function readJdKeywordCache<T>(
  svc: SupabaseClient,
  hash: string,
): Promise<{ keywords: T; model: string } | null> {
  try {
    const { data, error } = await svc
      .from("jd_keyword_cache")
      .select("keywords, model")
      .eq("jd_hash", hash)
      .maybeSingle();
    if (error || !data) return null;
    return {
      keywords: data.keywords as T,
      model: typeof data.model === "string" ? data.model : "",
    };
  } catch {
    return null;
  }
}

export async function writeJdKeywordCache(
  svc: SupabaseClient,
  hash: string,
  keywords: unknown,
  model: string,
): Promise<void> {
  try {
    await svc
      .from("jd_keyword_cache")
      .upsert({ jd_hash: hash, keywords, model }, { onConflict: "jd_hash" });
  } catch {
    // Non-fatal by design: the next caller simply re-extracts.
  }
}

// ── Vendored RFC 1321 MD5 ─────────────────────────────────────────────────
// WebCrypto has no MD5; this compact public-domain-style implementation keeps
// the cache key stable without runtime-specific crypto support. Verified
// against reference vectors (incl. UTF-8 + multi-block padding edges).

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
];
const MD5_K = Array.from({ length: 64 }, (_, i) => Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32));

function md5Hex(text: string): string {
  const msg = new TextEncoder().encode(text);
  const bitLen = msg.length * 8;
  const paddedLen = (((msg.length + 8) >> 6) + 1) << 6;
  const buf = new Uint8Array(paddedLen);
  buf.set(msg);
  buf[msg.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(paddedLen - 8, bitLen >>> 0, true);
  view.setUint32(paddedLen - 4, Math.floor(bitLen / 2 ** 32), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  for (let off = 0; off < paddedLen; off += 64) {
    const M = new Array<number>(16);
    for (let i = 0; i < 16; i += 1) M[i] = view.getUint32(off + i * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let i = 0; i < 64; i += 1) {
      let F: number, g: number;
      if (i < 16) { F = (B & C) | (~B & D); g = i; }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16; }
      else { F = C ^ (B | ~D); g = (7 * i) % 16; }
      const sum = (A + F + MD5_K[i] + M[g]) | 0;
      A = D;
      D = C;
      C = B;
      B = (B + ((sum << MD5_S[i]) | (sum >>> (32 - MD5_S[i])))) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  const out = new Uint8Array(16);
  const outView = new DataView(out.buffer);
  outView.setUint32(0, a0, true);
  outView.setUint32(4, b0, true);
  outView.setUint32(8, c0, true);
  outView.setUint32(12, d0, true);
  return Array.from(out).map((b) => b.toString(16).padStart(2, "0")).join("");
}
