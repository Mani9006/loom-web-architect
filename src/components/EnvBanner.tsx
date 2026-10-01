/**
 * Thin banner that sits at the very top of every page in non-production
 * environments. Makes it impossible to confuse staging for prod when you're
 * looking at a screenshot.
 */
import { getEnv } from "@/lib/env";
import { useFlag } from "@/lib/feature-flags";
import { AlertTriangle } from "lucide-react";

export function EnvBanner() {
  const enabled = useFlag("ENV_BANNER");
  if (!enabled) return null;
  const env = getEnv();
  const palette = env === "staging"
    ? "bg-amber-500 text-amber-950"
    : "bg-sky-500 text-sky-950";
  const label = env === "staging" ? "STAGING" : "DEVELOPMENT";
  const note = env === "staging"
    ? "Test environment. Data here does not affect resumeprep.com."
    : "Local dev. Hot reload on file save.";
  return (
    <div
      role="status"
      className={`${palette} flex items-center justify-center gap-2 px-3 py-1 text-xs font-medium tracking-wide`}
    >
      <AlertTriangle className="size-3.5" />
      <span className="font-bold">{label}</span>
      <span className="opacity-80">·</span>
      <span className="opacity-85">{note}</span>
    </div>
  );
}
