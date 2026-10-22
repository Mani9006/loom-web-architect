import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { MarketingLayout } from "@/product/marketing/MarketingLayout";
import LandingPage from "@/product/marketing/LandingPage";
import PlansPage from "@/product/marketing/PlansPage";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

vi.mock("@/components/SubscriptionGate", () => ({
  useSubscription: () => ({ plan: "free" }),
}));

describe("MarketingLayout", () => {
  it("renders wrapped children instead of an empty outlet", () => {
    render(
      <MemoryRouter>
        <MarketingLayout>
          <main>Visible hero</main>
        </MarketingLayout>
      </MemoryRouter>,
    );
    expect(screen.getByText("Visible hero")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("renders the landing hero", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: /apply to the right us jobs/i })).toBeInTheDocument();
    expect(screen.getByText(/never invent the past/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toBeInTheDocument();
  });

  it("renders plan cards", () => {
    render(
      <MemoryRouter>
        <PlansPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole("heading", { name: "Plans" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Free" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Pro" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Autopilot" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /choose pro/i })).toBeInTheDocument();
  });

  it("still supports route-outlet usage", () => {
    render(
      <MemoryRouter initialEntries={["/nested"]}>
        <Routes>
          <Route element={<MarketingLayout />}>
            <Route path="/nested" element={<main>Outlet body</main>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText("Outlet body")).toBeInTheDocument();
  });
});
