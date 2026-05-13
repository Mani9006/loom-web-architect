/**
 * lazy() wrapper that recovers from stale-chunk errors.
 *
 * When Vite/Vercel deploys new code, old chunk filenames (with content
 * hashes) stop existing. Any browser tab still running the OLD index.html
 * — referencing those old chunks — will throw "Failed to fetch dynamically
 * imported module" the next time the user navigates to a lazy-loaded route.
 *
 * Strategy:
 *   1. Try the import.
 *   2. On failure that looks like a chunk error, reload the page ONCE
 *      (session-scoped flag prevents infinite loops if the error is real).
 *      The reload pulls a fresh index.html with the new chunk hashes.
 *   3. Otherwise rethrow so the error boundary handles it.
 */
import { lazy, type ComponentType } from "react";

const RELOAD_FLAG = "rp.chunk-reload-attempted";

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const m = error.message || "";
  return (
    /Failed to fetch dynamically imported module/i.test(m) ||
    /Loading chunk \d+ failed/i.test(m) ||
    /ChunkLoadError/i.test(m) ||
    /Importing a module script failed/i.test(m)
  );
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      const mod = await factory();
      // Clear the flag once we've successfully loaded a chunk — the next stale
      // deploy gets a fresh chance to reload.
      sessionStorage.removeItem(RELOAD_FLAG);
      return mod;
    } catch (error) {
      if (isChunkLoadError(error)) {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, "1");
          // Give logs a beat to flush before we reload.
          window.location.reload();
          // Return a never-resolving promise so React doesn't render anything
          // before the reload kicks in.
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    }
  });
}

/**
 * Global safety net: window-level `error` listener that catches chunk-load
 * failures from module preloading (not just `import()` calls).
 */
export function installChunkReloadGuard(): void {
  if (typeof window === "undefined") return;
  window.addEventListener("error", (e) => {
    const target = e.target as HTMLElement | null;
    // `<script>` / `<link rel=modulepreload>` failed to load — same root cause
    // as the dynamic-import case.
    if (target && (target.tagName === "SCRIPT" || target.tagName === "LINK")) {
      const src = (target as HTMLScriptElement).src || (target as HTMLLinkElement).href || "";
      if (/\/assets\/.*\.js(\?|$)/.test(src) && !sessionStorage.getItem(RELOAD_FLAG)) {
        sessionStorage.setItem(RELOAD_FLAG, "1");
        window.location.reload();
      }
    }
  }, true);

  window.addEventListener("unhandledrejection", (e) => {
    if (isChunkLoadError(e.reason) && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  });
}
