/**
 * Thin banner that sits at the very top of every page in non-production
 * environments. Makes it impossible to confuse staging for prod when you're
 * looking at a screenshot.
 *
 * It publishes its height as --env-banner-h so full-height layouts (the app
 * shell) can subtract it instead of overflowing the viewport.
 */
import { useEffect } from "react";
import { getEnv } from "@/lib/env";
import { useFlag } from "@/lib/feature-flags";

export function EnvBanner() {
  const enabled = useFlag("ENV_BANNER");

  useEffect(() => {
    if (!enabled) return;
    const root = document.documentElement;
    root.style.setProperty("--env-banner-h", "1.5rem");
    return () => {
      root.style.removeProperty("--env-banner-h");
    };
  }, [enabled]);

  if (!enabled) return null;
  const env = getEnv();
  const palette = env === "staging" ? "bg-amber-500 text-amber-950" : "bg-sky-500 text-sky-950";
  const label = env === "staging" ? "Staging" : "Development";
  const note =
    env === "staging"
      ? "Test environment. Data here does not affect resumeprep.com."
      : "Local build with hot reload.";
  return (
    <div role="status" className={`${palette} flex h-6 items-center justify-center gap-2 px-3 text-xs font-medium`}>
      <span className="font-semibold">{label}</span>
      <span>{note}</span>
    </div>
  );
}
