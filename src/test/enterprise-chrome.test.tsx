import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MarketingLayout } from "@/product/marketing/MarketingLayout";
import LandingPage from "@/product/marketing/LandingPage";
import { SkipLink } from "@/product/ui/SkipLink";
import { Btn } from "@/product/ui/Btn";
import { DataTable } from "@/product/ui/DataTable";

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null, signOut: vi.fn() }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({ theme: "dark", toggleTheme: vi.fn() }),
}));

describe("enterprise chrome", () => {
  it("exposes a skip link on marketing pages", () => {
    render(
      <MemoryRouter>
        <MarketingLayout>
          <main>Visible hero</main>
        </MarketingLayout>
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: /skip to content/i })).toHaveAttribute("href", "#main");
  });

  it("composes the landing desk preview instead of a card grid", () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>,
    );
    expect(screen.getByText("Top matches")).toBeInTheDocument();
    expect(screen.getByText("Applications")).toBeInTheDocument();
    expect(screen.getByText(/worker receipt only/i)).toBeInTheDocument();
  });

  it("keeps button hierarchy as primary, outline, ghost, destructive", () => {
    render(
      <>
        <Btn>Primary</Btn>
        <Btn variant="ghost">Ghost</Btn>
        <Btn variant="destructive">Delete</Btn>
      </>,
    );
    expect(screen.getByRole("button", { name: "Primary" })).toHaveClass("rp-btn-primary");
    expect(screen.getByRole("button", { name: "Ghost" })).toHaveClass("rp-btn-ghost");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("rp-btn-destructive");
  });

  it("renders table headers and rows", () => {
    render(
      <DataTable
        columns={[
          { key: "role", header: "Role", cell: (row) => row.role },
          { key: "company", header: "Company", cell: (row) => row.company },
        ]}
        rows={[{ role: "Analyst", company: "Acme" }]}
        rowKey={(row) => row.role}
      />,
    );
    expect(screen.getByRole("columnheader", { name: "Role" })).toBeInTheDocument();
    expect(screen.getAllByText("Analyst").length).toBeGreaterThan(0);
  });

  it("renders skip link component", () => {
    render(<SkipLink />);
    expect(screen.getByRole("link", { name: /skip to content/i })).toBeInTheDocument();
  });
});
