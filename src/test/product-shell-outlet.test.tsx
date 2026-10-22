import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Outlet, Route, Routes } from "react-router-dom";
import { ProductShell } from "@/product/shell/ProductShell";
import { AdminShell } from "@/product/admin/AdminShell";
import type { OperatorSession } from "@/product/lib/company-ops";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "owner@example.com" }, signOut: vi.fn() }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return {
    ...actual,
    useQuery: () => ({ data: 25 }),
  };
});

vi.mock("@/product/assistant/AssistantDrawer", () => ({
  AssistantDrawer: () => null,
}));

const session: OperatorSession = {
  org: { id: "org", name: "ResumePreps", slug: "resumepreps", seat_limit: 25, global_auto_apply: true, used_seats: 1 },
  member: { id: "m1", user_id: "u1", email: "owner@example.com", role: "owner" },
  permissions: ["billing", "user_support", "impersonate", "promo_codes", "worker_replay", "feature_flags", "audit_log"],
};

describe("signed-in shells", () => {
  it("renders Home through ProductShell outlet", () => {
    render(
      <MemoryRouter initialEntries={["/home"]}>
        <Routes>
          <Route element={<ProductShell />}>
            <Route path="/home" element={<main><h1>US matches, then receipts.</h1></main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /us matches, then receipts/i })).toBeInTheDocument();
  });

  it("renders Team through AdminShell outlet", () => {
    render(
      <MemoryRouter initialEntries={["/admin/team"]}>
        <Routes>
          <Route element={<Outlet context={session} />}>
            <Route element={<AdminShell />}>
              <Route path="/admin/team" element={<main><h1>People who run the company</h1></main>} />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /people who run the company/i })).toBeInTheDocument();
    expect(screen.getByText("Company")).toBeInTheDocument();
  });
});
