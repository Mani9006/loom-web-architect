import { useEffect, useRef } from "react";

export const isMacPlatform = () =>
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** True when a keystroke would be typing into something. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return Boolean(target.closest("[contenteditable='true'], [role='textbox'], [role='combobox']"));
}

interface ShellShortcutOptions {
  /** ⌘K / Ctrl+K. Fires even while typing, like every other command menu. */
  onTogglePalette: () => void;
  /** Second key of a "g then x" sequence. Return true if the key was handled. */
  onGoTo: (key: string) => boolean;
  /** Disable the single-key sequences (e.g. while a dialog is open). */
  sequencesEnabled?: boolean;
}

const SEQUENCE_TIMEOUT_MS = 1200;

/**
 * Global keyboard shortcuts for the app shell.
 *
 * - ⌘K / Ctrl+K toggles the command palette.
 * - "g" then a destination key navigates, only when focus is not in a field
 *   and no modifier is held, so it never steals typing.
 */
export function useShellShortcuts({ onTogglePalette, onGoTo, sequencesEnabled = true }: ShellShortcutOptions) {
  const pendingG = useRef<number | null>(null);
  const handlers = useRef({ onTogglePalette, onGoTo, sequencesEnabled });
  useEffect(() => {
    handlers.current = { onTogglePalette, onGoTo, sequencesEnabled };
  });

  useEffect(() => {
    const clearPending = () => {
      if (pendingG.current !== null) window.clearTimeout(pendingG.current);
      pendingG.current = null;
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const key = event.key.toLowerCase();

      if (key === "k" && (event.metaKey || event.ctrlKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        clearPending();
        handlers.current.onTogglePalette();
        return;
      }

      if (!handlers.current.sequencesEnabled) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
      if (isTypingTarget(event.target)) return;

      if (pendingG.current !== null) {
        clearPending();
        if (handlers.current.onGoTo(key)) event.preventDefault();
        return;
      }

      if (key === "g" && !event.shiftKey) {
        pendingG.current = window.setTimeout(clearPending, SEQUENCE_TIMEOUT_MS);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      clearPending();
    };
  }, []);
}
