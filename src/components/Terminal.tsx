/* eslint-disable react-hooks/set-state-in-effect */
/**
 * Terminal primitives — vintage CLI aesthetic with a Nothing-style red
 * block cursor.
 *
 * Components:
 *   <TerminalText text="..." />          — types one string out
 *   <TerminalLines lines={[...]} />      — types a sequence of lines, one
 *                                          after another, like a build log
 *   <TerminalCursor />                   — just the blinking red block
 *   <TerminalLoader status="..." />      — used by loading / uploading /
 *                                          importing states
 *
 * Visual: monospace JetBrains Mono, white text, blinking red square
 * cursor that animates via CSS (.terminal-cursor in index.css).
 */
import { useEffect, useRef, useState, useMemo } from "react";
import { cn } from "@/lib/utils";

// ─── <TerminalCursor /> ───────────────────────────────────────────────
// Standalone red blinking block. Use after any inline content that should
// read as a CLI prompt.
export function TerminalCursor({ className }: { className?: string }) {
  return <span aria-hidden className={cn("terminal-cursor", className)} />;
}

// ─── <TerminalText /> ─────────────────────────────────────────────────
// Types `text` character by character at `speed` ms/char. When done,
// leaves the red cursor blinking at the end (or removes it if
// `hideCursorWhenDone`). Respects prefers-reduced-motion.
export function TerminalText({
  text,
  speed = 28,
  startDelay = 200,
  className,
  cursor = true,
  hideCursorWhenDone = false,
  onDone,
}: {
  text: string;
  speed?: number;
  startDelay?: number;
  className?: string;
  cursor?: boolean;
  hideCursorWhenDone?: boolean;
  onDone?: () => void;
}) {
  const reduce = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const [shown, setShown] = useState(reduce ? text : "");
  const [done, setDone] = useState(reduce);
  const onDoneRef = useRef(onDone);
  // eslint-disable-next-line react-hooks/refs
  onDoneRef.current = onDone;

  useEffect(() => {
    if (reduce) {
      setShown(text);
      setDone(true);
      onDoneRef.current?.();
      return;
    }
    setShown("");
    setDone(false);
    let i = 0;
    let stopped = false;
    const start = setTimeout(function tick() {
      const advance = () => {
        if (stopped) return;
        i += 1;
        setShown(text.slice(0, i));
        if (i >= text.length) {
          setDone(true);
          onDoneRef.current?.();
          return;
        }
        setTimeout(advance, speed);
      };
      advance();
    }, startDelay);
    return () => {
      stopped = true;
      clearTimeout(start);
    };
  }, [text, speed, startDelay, reduce]);

  return (
    <span className={className}>
      {shown}
      {cursor && (!done || !hideCursorWhenDone) && <TerminalCursor />}
    </span>
  );
}

// ─── <TerminalLines /> ────────────────────────────────────────────────
// Types a sequence of lines. Each one fades-in + types in sequence.
// Last line keeps the cursor.
export function TerminalLines({
  lines,
  prefix = "▸ ",
  speed = 22,
  perLineDelay = 280,
  className,
}: {
  lines: string[];
  prefix?: string;
  speed?: number;
  perLineDelay?: number;
  className?: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);

  // Reset when lines change identity (e.g., status sequence updates)
  useEffect(() => {
    setActiveIndex(0);
  }, [lines]);

  return (
    <div className={cn("space-y-1", className)} style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "12.5px" }}>
      {lines.slice(0, activeIndex).map((l, i) => (
        <div key={i} className="text-rp-ink-2 animate-line-in">
          <span className="text-rp-accent mr-1.5">{prefix}</span>
          {l}
        </div>
      ))}
      {activeIndex < lines.length && (
        <div className="text-rp-ink animate-line-in">
          <span className="text-rp-accent mr-1.5">{prefix}</span>
          <TerminalText
            text={lines[activeIndex]}
            speed={speed}
            startDelay={0}
            cursor
            onDone={() => {
              setTimeout(() => setActiveIndex((i) => i + 1), perLineDelay);
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── <TerminalLoader /> ───────────────────────────────────────────────
// Drop-in for any "we're working on it" state. Shows a sequence of
// status lines that type out one after another. When `status` prop
// changes, we add it as the next line.
//
// Use cases:
//   - Resume upload + parse
//   - AI tailor in progress
//   - Job search running
//   - Cover-letter generation
//   - ATS analysis
export function TerminalLoader({
  title = "Working",
  lines,
  className,
  showFrame = true,
}: {
  title?: string;
  lines: string[];
  className?: string;
  showFrame?: boolean;
}) {
  const Wrap = showFrame ? "div" : "div";
  return (
    <Wrap
      className={cn(
        showFrame && "terminal-frame scanlines p-4",
        "max-w-lg w-full",
        className,
      )}
    >
      {title && (
        <div
          className="flex items-center gap-2 mb-3 pb-2 border-b border-rp-rule/60"
          style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: "10.5px", letterSpacing: "0.14em" }}
        >
          <span className="size-2 rounded-full bg-rp-accent" />
          <span className="text-rp-ink uppercase">{title}</span>
        </div>
      )}
      <TerminalLines lines={lines} />
    </Wrap>
  );
}
