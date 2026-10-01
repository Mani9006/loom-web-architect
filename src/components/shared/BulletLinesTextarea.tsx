import { useState } from "react";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { parseBulletLines } from "@/lib/bullet-lines";

type BulletLinesTextareaProps = Omit<TextareaProps, "value" | "onChange"> & {
  bullets: string[];
  onBulletsChange: (bullets: string[]) => void;
};

/**
 * "One bullet per line" textarea. Keeps the raw text locally while focused so
 * pressing Enter (an empty trailing line) isn't immediately filtered away,
 * while still emitting the cleaned bullet list on every change.
 */
export function BulletLinesTextarea({ bullets, onBulletsChange, onBlur, ...props }: BulletLinesTextareaProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Textarea
      {...props}
      value={draft ?? bullets.join("\n")}
      onChange={(e) => {
        setDraft(e.target.value);
        onBulletsChange(parseBulletLines(e.target.value));
      }}
      onBlur={(e) => {
        setDraft(null);
        onBlur?.(e);
      }}
    />
  );
}
