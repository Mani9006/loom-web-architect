export const PIPELINE_COLUMNS = [
  { key: "Applied", label: "Applied" },
  { key: "Ghosted", label: "Ghosted" },
  { key: "Interviewing", label: "Interviewing" },
  { key: "Rejected", label: "Rejected" },
  { key: "Offer", label: "Offer" },
] as const;

export type PipelineStatus = (typeof PIPELINE_COLUMNS)[number]["key"];

export interface PipelineCard {
  id: string;
  title: string;
  company: string;
  status: PipelineStatus;
  url?: string | null;
  notes?: string | null;
  updated_at: string;
}

const STATUS_SET = new Set<string>(PIPELINE_COLUMNS.map((column) => column.key));

export function normalizePipelineStatus(value: string | null | undefined): PipelineStatus {
  const raw = String(value || "").trim();
  if (raw === "Saved") return "Applied";
  if (STATUS_SET.has(raw)) return raw as PipelineStatus;
  return "Applied";
}

export function pipelineToCsv(rows: PipelineCard[]): string {
  const header = "title,company,status,url,notes,updated_at";
  const body = rows.map((row) => [row.title, row.company, row.status, row.url ?? "", row.notes ?? "", row.updated_at]
    .map(csvCell)
    .join(","));
  return [header, ...body].join("\n");
}

export function pipelineFromCsv(text: string): Array<Pick<PipelineCard, "title" | "company" | "status" | "url" | "notes">> {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return [];
  const start = /title/i.test(lines[0]) ? 1 : 0;
  const rows: Array<Pick<PipelineCard, "title" | "company" | "status" | "url" | "notes">> = [];
  for (const line of lines.slice(start)) {
    const cells = parseCsvLine(line);
    const title = (cells[0] || "").trim();
    if (!title) continue;
    rows.push({
      title,
      company: (cells[1] || "").trim(),
      status: normalizePipelineStatus(cells[2]),
      url: (cells[3] || "").trim() || null,
      notes: (cells[4] || "").trim() || null,
    });
  }
  return rows;
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  return cells;
}
