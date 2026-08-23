export interface DiffLine {
  kind: "same" | "removed" | "added";
  text: string;
}

/** Line-oriented resume diff for the before → after theater. */
export function diffResumeText(before: string, after: string): DiffLine[] {
  const a = normalizeLines(before);
  const b = normalizeLines(after);
  if (a.length === 0 && b.length === 0) return [];
  const rows: DiffLine[] = [];
  const used = new Set<number>();
  for (const line of a) {
    const idx = b.findIndex((candidate, i) => !used.has(i) && similar(line, candidate));
    if (idx >= 0) {
      used.add(idx);
      if (b[idx] === line) rows.push({ kind: "same", text: line });
      else {
        rows.push({ kind: "removed", text: line });
        rows.push({ kind: "added", text: b[idx] });
      }
    } else {
      rows.push({ kind: "removed", text: line });
    }
  }
  b.forEach((line, i) => {
    if (!used.has(i)) rows.push({ kind: "added", text: line });
  });
  return rows;
}

export function applyLifecycleLabel(status: string): string {
  switch (status) {
    case "queued": return "In the cloud queue";
    case "draft": return "Tailoring resume";
    case "ready": return "Packet ready";
    case "submitted": return "Submitted with receipt";
    case "failed": return "Needs attention";
    case "skipped": return "Skipped";
    default: return status;
  }
}

function normalizeLines(value: string): string[] {
  return value.split(/\r?\n/).map((line) => line.replace(/^[-*•]\s*/, "").trim()).filter(Boolean);
}

function similar(left: string, right: string): boolean {
  if (left === right) return true;
  const l = left.toLowerCase();
  const r = right.toLowerCase();
  const words = l.split(/\s+/).filter((w) => w.length > 3);
  if (words.length === 0) return false;
  const hits = words.filter((w) => r.includes(w)).length;
  return hits / words.length >= 0.55;
}
