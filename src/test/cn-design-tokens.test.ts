import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn with design-system tokens", () => {
  it("keeps a text color next to a custom font size", () => {
    expect(cn("text-primary-foreground", "text-meta")).toBe("text-primary-foreground text-meta");
  });

  it("dedupes custom font sizes against the default scale", () => {
    expect(cn("text-sm", "text-meta")).toBe("text-meta");
  });

  it("dedupes custom shadows, transitions and durations", () => {
    expect(cn("shadow-md", "shadow-overlay")).toBe("shadow-overlay");
    expect(cn("transition-colors", "transition-press")).toBe("transition-press");
    expect(cn("duration-200", "duration-state")).toBe("duration-state");
  });
});
