import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TableSkeleton } from "@/product/components/Skeleton";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loading,
  empty,
  className,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
}) {
  if (loading) {
    return (
      <div className="p-4">
        <TableSkeleton />
      </div>
    );
  }

  if (rows.length === 0) return <>{empty}</>;

  return (
    <>
      <div className={cn("rp-table-wrap hidden md:block", className)}>
        <table className="rp-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col.key} className={col.className}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-clickable={onRowClick ? "" : undefined}
                onClick={() => onRowClick?.(row)}
                onKeyDown={(event) => {
                  if (!onRowClick) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onRowClick(row);
                  }
                }}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {columns.map((col) => (
                  <td key={col.key} className={col.className}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <button
            key={rowKey(row)}
            type="button"
            className="flex w-full flex-col gap-1 px-4 py-3 text-left hover:bg-muted/50"
            onClick={() => onRowClick?.(row)}
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .slice(0, 3)
              .map((col, index) => (
                <div key={col.key} className={index === 0 ? "text-[13px] font-medium" : "text-[12px] text-muted-foreground"}>
                  {col.cell(row)}
                </div>
              ))}
          </button>
        ))}
      </div>
    </>
  );
}

export function Pagination({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
}) {
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 text-[12px]">
      <button type="button" className="rp-btn rp-btn-outline rp-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        Prev
      </button>
      <span className="tabular-nums text-muted-foreground">
        {page} / {pageCount}
      </span>
      <button type="button" className="rp-btn rp-btn-outline rp-btn-sm" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
      </button>
    </div>
  );
}
