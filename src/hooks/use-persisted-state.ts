import { useState, useEffect, useCallback } from "react";

type StorageType = "localStorage" | "sessionStorage";

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

  const [value, setValue] = useState<T>(() => {
    try {
      const stored = storageObj.getItem(key);
      if (stored !== null) {
        return JSON.parse(stored) as T;
      }
    } catch {
      // Invalid JSON or storage error — use default
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
      // Storage full or unavailable — silently ignore
    }
  }, [key, value, storageObj, defaultValue]);

  const clear = useCallback(() => {
    storageObj.removeItem(key);
    setValue(defaultValue);
  }, [key, defaultValue, storageObj]);

  return [value, setValue, clear];
}
