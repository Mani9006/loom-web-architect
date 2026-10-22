import type { BoardRow, BoardTab } from "@/lib/application-board";

/** Product IA tabs: All / Submitted / In flight / Needs you / Failed / Skipped */
export type ProductAppTab = "all" | "submitted" | "in_flight" | "needs_you" | "failed" | "skipped";

export const PRODUCT_APP_TABS: Array<{ id: ProductAppTab; label: string }> = [
  { id: "all", label: "All" },
  { id: "submitted", label: "Submitted" },
  { id: "in_flight", label: "In flight" },
  { id: "needs_you", label: "Needs you" },
  { id: "failed", label: "Failed" },
  { id: "skipped", label: "Skipped" },
];

export function rowMatchesProductTab(row: BoardRow, tab: ProductAppTab): boolean {
  if (tab === "all") return true;
  if (tab === "submitted") return row.status.key === "submitted";
  if (tab === "in_flight") return row.status.tab === "in_flight" && row.status.key !== "submitted";
  return row.status.tab === (tab as BoardTab);
}

export function productTabCounts(rows: BoardRow[]): Record<ProductAppTab, number> {
  const counts: Record<ProductAppTab, number> = {
    all: rows.length,
    submitted: 0,
    in_flight: 0,
    needs_you: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of rows) {
    if (row.status.key === "submitted") counts.submitted += 1;
    else if (row.status.tab === "in_flight") counts.in_flight += 1;
    else counts[row.status.tab] += 1;
  }
  return counts;
}
