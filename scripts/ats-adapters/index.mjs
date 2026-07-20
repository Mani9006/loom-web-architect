// Adapter registry. Order matters: specific ATS adapters first, generic last.
//
// Roadmap (docs/job-source-capability-matrix.md): Greenhouse -> Lever ->
// Ashby. New adapters plug in here without touching the worker loop.

import { greenhouseAdapter } from "./greenhouse.mjs";
import { leverAdapter } from "./lever.mjs";
import { ashbyAdapter } from "./ashby.mjs";
import { genericAdapter } from "./generic.mjs";

export { greenhouseAdapter, leverAdapter, ashbyAdapter, genericAdapter };
export { defineAdapter, submitRefusal } from "./contract.mjs";

export const adapters = [greenhouseAdapter, leverAdapter, ashbyAdapter, genericAdapter];

/**
 * Pick the first adapter whose detect() matches. `page` may be null (URL-only
 * detection, e.g. in tests). Detection failures fall through to the next
 * adapter; generic matches everything, so this never returns null.
 *
 * @param {string} url
 * @param {import("@playwright/test").Page|null} page
 * @returns {Promise<import("./contract.mjs").AtsAdapter>}
 */
export async function pickAdapter(url, page = null) {
  for (const adapter of adapters) {
    try {
      if (await adapter.detect(url, page)) return adapter;
    } catch {
      // A broken detect() must never take the worker down; try the next one.
    }
  }
  return genericAdapter;
}
