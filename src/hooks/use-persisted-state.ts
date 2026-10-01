import { useState, useEffect, useCallback, useRef } from "react";

type StorageType = "localStorage" | "sessionStorage";

/**
 * Key prefixes used with usePersistedState across the app. These may hold
 * user data (resume text, job descriptions, chat history), so they are
 * cleared on sign-out. Add new page prefixes here when introducing keys.
 */
export const PERSISTED_STATE_PREFIXES = [
  "aiToolbox.",
  "atsChecker.",
  "autoApply.",
  "coverLetter.",
  "documents.",
  "interviewPrep.",
  "jobSearch.",
  "jobTracker.",
] as const;

function clearPrefixedKeys(storageObj: Storage, prefixes: readonly string[]) {
  const toRemove: string[] = [];
  for (let i = 0; i < storageObj.length; i++) {
    const key = storageObj.key(i);
    if (key && prefixes.some((prefix) => key.startsWith(prefix))) {
      toRemove.push(key);
    }
  }
  toRemove.forEach((key) => storageObj.removeItem(key));
}

/**
 * Remove all usePersistedState entries from localStorage and sessionStorage,
 * so one user's data is not restored for the next user on the same browser.
 */
export function clearPersistedState(
  prefixes: readonly string[] = PERSISTED_STATE_PREFIXES
): void {
  if (typeof window === "undefined") return;
  for (const getStorage of [() => window.localStorage, () => window.sessionStorage]) {
    try {
      clearPrefixedKeys(getStorage(), prefixes);
    } catch {
      // Storage unavailable, nothing to clear
    }
  }
}

/**
 * A hook that persists state to localStorage or sessionStorage.
 * On mount, it restores the saved value. On change, it saves to storage.
 *
 * @param key - Unique storage key (prefix with page name, e.g., "jobSearch.query")
 * @param defaultValue - Default value if nothing is stored
 * @param storage - "localStorage" (persists across sessions) or "sessionStorage" (cleared on tab close)
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T,
  storage: StorageType = "sessionStorage"
): [T, (value: T | ((prev: T) => T)) => void, () => void] {
  const storageObj =
    storage === "localStorage" ? window.localStorage : window.sessionStorage;

  // Track whether we've initialized from storage
  const initialized = useRef(false);

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = storageObj.getItem(key);
      if (stored !== null) {
        initialized.current = true;
        return JSON.parse(stored) as T;
      }
    } catch {
      // Invalid JSON or storage error, use default
    }
    return defaultValue;
  });

  useEffect(() => {
    try {
      // Serialize current value for comparison
      const serialized = JSON.stringify(value);
      const defaultSerialized = JSON.stringify(defaultValue);

      if (serialized === defaultSerialized) {
        // Clean up storage if value is back to default
        storageObj.removeItem(key);
      } else {
        storageObj.setItem(key, serialized);
      }
    } catch {
      // Storage full or unavailable, silently ignore
    }
  }, [key, value, storageObj, defaultValue]);

  const clear = useCallback(() => {
    storageObj.removeItem(key);
    setValue(defaultValue);
  }, [key, defaultValue, storageObj]);

  return [value, setValue, clear];
}
