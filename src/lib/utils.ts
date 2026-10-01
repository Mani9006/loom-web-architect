import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge the design-system tokens from tailwind.config.ts.
// Without this, a custom size such as `text-meta` is mistaken for a text
// color and silently removes `text-primary-foreground` (and vice versa).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["meta", "caption", "body", "body-lg", "title", "headline", "display", "hero"] }],
      shadow: [{ shadow: ["overlay"] }],
      transition: [{ transition: ["press", "surface"] }],
      duration: [{ duration: ["press", "state", "sheet"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
