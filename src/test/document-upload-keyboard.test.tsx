import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { DocumentUpload } from "@/components/shared/DocumentUpload";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<DocumentUpload onTextExtracted={() => {}} label="Upload Resume" />);
  });
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("DocumentUpload keyboard access", () => {
  it("exposes the drop zone as a focusable, labelled button", () => {
    const el = mount();
    const zone = el.querySelector('[role="button"][aria-label="Upload Resume"]');
    expect(zone).not.toBeNull();
    expect(zone).toHaveAttribute("tabindex", "0");
  });

  it("opens the file picker on Enter and Space only", () => {
    const el = mount();
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    const zone = el.querySelector('[role="button"][aria-label="Upload Resume"]') as HTMLElement;

    for (const key of ["Enter", " ", "a"]) {
      act(() => {
        zone.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
      });
    }

    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});
