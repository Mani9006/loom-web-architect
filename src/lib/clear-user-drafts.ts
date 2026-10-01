/**
 * Storage key prefixes for drafts that hold personal résumé / job text.
 * These are cleared on sign-out so the next account on a shared browser
 * never sees the previous user's content.
 */
export const USER_DRAFT_KEY_PREFIXES = ["coverLetter.", "atsChecker."] as const;

type KeyedStorage = Pick<Storage, "length" | "key" | "removeItem">;

export function clearUserDrafts(storages?: KeyedStorage[]): void {
  const targets = storages ?? defaultStorages();
  for (const storage of targets) {
    try {
      const doomed: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (key && USER_DRAFT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) {
          doomed.push(key);
        }
      }
      for (const key of doomed) storage.removeItem(key);
    } catch {
      // Storage unavailable (private mode, blocked site data), nothing to clear.
    }
  }
}

function defaultStorages(): KeyedStorage[] {
  const out: KeyedStorage[] = [];
  try {
    if (typeof window !== "undefined") {
      out.push(window.localStorage, window.sessionStorage);
    }
  } catch {
    // Accessing storage can throw when site data is blocked.
  }
  return out;
}
