import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Result = { data: unknown; error: { message: string } | null };
let sessionsResult: Result = { data: [], error: null };
let jobsResult: Result = { data: [], error: null };

function chain(result: () => Result) {
  const builder: Record<string, unknown> = {};
  for (const m of ["select", "order", "in", "is", "eq", "update", "delete"]) {
    builder[m] = () => builder;
  }
  builder.then = (resolve: (r: Result) => unknown) => Promise.resolve(result()).then(resolve);
  return builder;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => chain(() => (table === "mc_sessions" ? sessionsResult : jobsResult)),
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
}));

vi.mock("@/components/my-collection/NewSessionWizard", () => ({ default: () => null }));

import MyCollectionPage from "@/pages/MyCollection/MyCollectionPage";

let container: HTMLDivElement;
let root: Root;

async function renderPage() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter>
        <MyCollectionPage />
      </MemoryRouter>,
    );
  });
  // Flush the chained supabase promises (sessions, then per-session stats).
  for (let i = 0; i < 3; i++) await act(async () => {});
}

const text = () => container.textContent ?? "";

const baseSession = {
  master_resume_id: null,
  target_profile: { target_roles: ["ML Engineer"] },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-02T00:00:00Z",
};

describe("MyCollectionPage", () => {
  beforeEach(() => {
    sessionsResult = { data: [], error: null };
    jobsResult = { data: [], error: null };
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows a retryable error instead of the empty state when loading fails", async () => {
    sessionsResult = { data: null, error: { message: "network down" } };
    await renderPage();
    expect(text()).toContain("Couldn't load your sessions");
    expect(text()).toContain("Try again");
    expect(text()).not.toContain("No sessions yet");
  });

  it("counts cards in later stages as applied on the session card", async () => {
    sessionsResult = { data: [{ ...baseSession, id: "s1", name: "ML search", status: "active" }], error: null };
    jobsResult = {
      data: [
        { session_id: "s1", status: "applied", applied_at: null },
        { session_id: "s1", status: "interview", applied_at: null },
        { session_id: "s1", status: "saved", applied_at: null },
      ],
      error: null,
    };
    await renderPage();
    const card = container.querySelector('[aria-label="Open session ML search"]');
    expect(card).not.toBeNull();
    const values = Array.from(card!.querySelectorAll(".text-base.font-semibold")).map((n) => n.textContent);
    expect(values).toEqual(["3", "2", "1"]);
  });

  it("offers a way back when every session is archived", async () => {
    sessionsResult = { data: [{ ...baseSession, id: "s2", name: "Old search", status: "archived" }], error: null };
    await renderPage();
    expect(text()).toMatch(/all your sessions are archived/i);
  });
});
