/**
 * env — typed, fail-loud access to edge-function environment variables.
 *
 *   import { requireEnv, optionalEnv, requireEnvs } from "../_shared/env.ts";
 *
 *   const url = requireEnv("SUPABASE_URL");               // throws EnvError if unset/blank
 *   const model = optionalEnv("MODEL_FAST");              // string | undefined
 *   const base = optionalEnv("APP_BASE_URL", "https://resumepreps.com");
 *   const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } =
 *     requireEnvs(["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]); // reports ALL missing at once
 *
 * Blank / whitespace-only values are treated as unset (a common footgun with
 * `supabase secrets set FOO=`). Values are trimmed.
 *
 * The module reads Deno.env lazily, so it can be imported from vitest; tests
 * (or callers with a custom source) use createEnv(lookup).
 *
 * Inventory of every variable the codebase reads: docs/env-inventory.md
 * (regenerate with `node scripts/env-inventory.mjs`).
 */

export type EnvLookup = (key: string) => string | undefined;

export class EnvError extends Error {
  constructor(public readonly missing: string[], context?: string) {
    const list = missing.join(", ");
    super(
      `Missing required environment variable${missing.length > 1 ? "s" : ""}: ${list}` +
        (context ? ` (${context})` : "") +
        `. Set with \`supabase secrets set ${missing.map((m) => `${m}=...`).join(" ")}\`.`,
    );
    this.name = "EnvError";
  }
}

export interface Env {
  requireEnv(name: string, context?: string): string;
  optionalEnv(name: string): string | undefined;
  optionalEnv(name: string, fallback: string): string;
  requireEnvs<const K extends string>(names: readonly K[], context?: string): Record<K, string>;
  /** "1" / "true" / "yes" / "on" (case-insensitive) → true; unset → fallback. */
  boolEnv(name: string, fallback?: boolean): boolean;
}

export function createEnv(lookup: EnvLookup): Env {
  const read = (name: string): string | undefined => {
    const v = lookup(name);
    if (v === undefined || v === null) return undefined;
    const t = String(v).trim();
    return t === "" ? undefined : t;
  };

  function optionalEnv(name: string): string | undefined;
  function optionalEnv(name: string, fallback: string): string;
  function optionalEnv(name: string, fallback?: string): string | undefined {
    return read(name) ?? fallback;
  }

  return {
    requireEnv(name, context) {
      const v = read(name);
      if (v === undefined) throw new EnvError([name], context);
      return v;
    },
    optionalEnv,
    requireEnvs<const K extends string>(names: readonly K[], context?: string) {
      const out = {} as Record<K, string>;
      const missing: string[] = [];
      for (const n of names) {
        const v = read(n);
        if (v === undefined) missing.push(n);
        else out[n] = v;
      }
      if (missing.length) throw new EnvError(missing, context);
      return out;
    },
    boolEnv(name, fallback = false) {
      const v = read(name);
      if (v === undefined) return fallback;
      return /^(1|true|yes|on)$/i.test(v);
    },
  };
}

// deno-lint-ignore no-explicit-any
const denoLookup: EnvLookup = (k) => (globalThis as any).Deno?.env?.get(k);
const defaultEnv = createEnv(denoLookup);

export const requireEnv = defaultEnv.requireEnv;
export const optionalEnv = defaultEnv.optionalEnv;
export const requireEnvs = defaultEnv.requireEnvs;
export const boolEnv = defaultEnv.boolEnv;
