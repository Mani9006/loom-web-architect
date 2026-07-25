/**
 * Environment + feature flag helpers.
 *
 * VITE_ENV is set per deployment target:
 *   - "production"  → resumeprep.com (vercel `production` branch)
 *   - "staging"     → staging.resumeprep.com or *.vercel.app preview deploys
 *   - "development" → local `npm run dev`
 *
 * Feature flags follow the convention `VITE_ENABLE_<FEATURE>`. When unset,
 * a feature defaults to "on in non-production, off in production", that's
 * what lets us test new work in staging without exposing it to real users.
 */

export type AppEnv = "production" | "staging" | "development";

export function getEnv(): AppEnv {
  const v = (import.meta.env.VITE_ENV ?? "").toLowerCase();
  if (v === "production") return "production";
  if (v === "staging") return "staging";
  if (v === "development" || import.meta.env.DEV) return "development";
  // Default conservative: treat unknown as production so we don't accidentally
  // leak unreleased features.
  return "production";
}

export const isProduction = () => getEnv() === "production";
export const isStaging = () => getEnv() === "staging";
export const isDevelopment = () => getEnv() === "development";
export const isPreProduction = () => !isProduction();

// Flag system lives in `src/lib/feature-flags.ts`, it supports
// localStorage overrides via the /admin/flags UI.
