import { describe, it, expect, vi, afterEach } from "vitest";
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/incidents", () => ({ captureIncident: vi.fn() }));

import { DocumentUpload } from "@/components/shared/DocumentUpload";
import { TemplateSelector } from "@/components/resume/TemplateSelector";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(ui: ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(ui));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function keyDown(el: Element, key: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  });
}

describe("DocumentUpload keyboard access", () => {
  it("exposes the drop zone as a focusable, named button", () => {
    const el = mount(<DocumentUpload onTextExtracted={() => {}} label="Import resume" />);
    const zone = el.querySelector('[role="button"][aria-label="Import resume"]');
    expect(zone).not.toBeNull();
    expect(zone).toHaveAttribute("tabindex", "0");
  });

  it("opens the file picker on Enter and Space only", () => {
    const el = mount(<DocumentUpload onTextExtracted={() => {}} label="Import resume" />);
    const input = el.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(input, "click").mockImplementation(() => {});
    const zone = el.querySelector('[role="button"][aria-label="Import resume"]')!;
    keyDown(zone, "Enter");
    keyDown(zone, " ");
    keyDown(zone, "a");
    expect(clickSpy).toHaveBeenCalledTimes(2);
  });
});

describe("TemplateSelector dialog semantics", () => {
  it("renders as a labelled modal dialog that closes on Escape", () => {
    const onClose = vi.fn();
    mount(<TemplateSelector isOpen onClose={onClose} onSelect={() => {}} />);
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    const labelledBy = dialog.getAttribute("aria-labelledby");
    expect(labelledBy && document.getElementById(labelledBy)?.textContent).toBe("Choose a Template");
    expect(document.querySelector('button[aria-label="Close template picker"]')).not.toBeNull();
    keyDown(dialog, "Escape");
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    mount(<TemplateSelector isOpen={false} onClose={() => {}} onSelect={() => {}} />);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
