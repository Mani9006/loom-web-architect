/**
 * Runtime-toggleable feature flags.
 *
 * Three layers of precedence (highest wins):
 *   1. Local override — flipped via `/admin/flags` UI, stored in localStorage.
 *      Per-browser. Useful for owner to test features in prod without
 *      affecting other users.
 *   2. Env override — `VITE_ENABLE_<NAME>=true|false` at build time.
 *   3. Env default — true in staging/dev, false in production.
 *
 * Components consume flags via `useFlag(name)` — reactive, re-renders when
 * the local override changes. Non-React code can call `getFlag(name)` for
 * a one-shot read.
 */
import { create } from "zustand";
import { isPreProduction } from "@/lib/env";

const STORAGE_KEY = "rp.flags.overrides";

export type FlagName =
  | "RESUME_BUILDER_V2"
  | "JOB_SEARCH_STRICT"
  | "ENV_BANNER";

export interface FlagSpec {
  name: FlagName;
  label: string;
  description: string;
  /** Force on/off regardless of env. Undefined = follow env defaults. */
  forceDefault?: boolean;
}

export const FLAG_SPECS: FlagSpec[] = [
  {
    name: "RESUME_BUILDER_V2",
    label: "Resume Builder v2",
    description: "Adds /resume-builder/v2 route, canvas editor, AI tailor panel, unified ATS score. Off in prod until tested.",
  },
  {
    name: "JOB_SEARCH_STRICT",
    label: "Strict Job Search",
    description: "Switches Job Search page to the new job-search-strict edge function (company-direct pages only, no Indeed/LinkedIn). Requires the function to be deployed first.",
  },
  {
    name: "ENV_BANNER",
    label: "Env Banner",
    description: "Shows the yellow STAGING / blue DEVELOPMENT banner at the top of every page. Hides itself in production by default.",
    forceDefault: undefined, // env-based: on in non-prod
  },
];

// ─── Local override storage (localStorage) ────────────────────────────────

type Overrides = Partial<Record<FlagName, boolean>>;

function readLocalOverrides(): Overrides {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) as Overrides : {};
  } catch {
    return {};
  }
}

function writeLocalOverrides(o: Overrides): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(o));
  } catch {
    /* quota / SSR — noop */
  }
}

// ─── Env override (build-time VITE_ENABLE_*) ──────────────────────────────

function readEnvOverride(name: FlagName): boolean | null {
  const v = import.meta.env[`VITE_ENABLE_${name}`];
  if (v === "true" || v === "1") return true;
  if (v === "false" || v === "0") return false;
  return null;
}

// ─── Env default ──────────────────────────────────────────────────────────

function defaultFor(name: FlagName): boolean {
  const spec = FLAG_SPECS.find((s) => s.name === name);
  if (spec && typeof spec.forceDefault === "boolean") return spec.forceDefault;
  return isPreProduction();
}

// ─── Resolution ───────────────────────────────────────────────────────────

interface ResolvedFlag {
  enabled: boolean;
  source: "local" | "env" | "default";
}

export function resolveFlag(name: FlagName, overrides?: Overrides): ResolvedFlag {
  const local = (overrides ?? readLocalOverrides())[name];
  if (typeof local === "boolean") return { enabled: local, source: "local" };
  const envOverride = readEnvOverride(name);
  if (typeof envOverride === "boolean") return { enabled: envOverride, source: "env" };
  return { enabled: defaultFor(name), source: "default" };
}

export function getFlag(name: FlagName): boolean {
  return resolveFlag(name).enabled;
}

// ─── Reactive store (Zustand) ─────────────────────────────────────────────

interface FlagsStore {
  overrides: Overrides;
  setLocal: (name: FlagName, value: boolean | undefined) => void;
  clearLocal: (name: FlagName) => void;
  clearAllLocal: () => void;
}

export const useFlagsStore = create<FlagsStore>((set) => ({
  overrides: readLocalOverrides(),
  setLocal: (name, value) =>
    set((state) => {
      const next: Overrides = { ...state.overrides };
      if (typeof value === "boolean") next[name] = value;
      else delete next[name];
      writeLocalOverrides(next);
      return { overrides: next };
    }),
  clearLocal: (name) =>
    set((state) => {
      const next: Overrides = { ...state.overrides };
      delete next[name];
      writeLocalOverrides(next);
      return { overrides: next };
    }),
  clearAllLocal: () => {
    writeLocalOverrides({});
    return set({ overrides: {} });
  },
}));

/** Reactive flag read. Components re-render when local override changes. */
export function useFlag(name: FlagName): boolean {
  const overrides = useFlagsStore((s) => s.overrides);
  return resolveFlag(name, overrides).enabled;
}

/** Reactive flag read returning the full source info — used by the admin UI. */
export function useResolvedFlag(name: FlagName): ResolvedFlag {
  const overrides = useFlagsStore((s) => s.overrides);
  return resolveFlag(name, overrides);
}
