export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMin = Math.max(0, Math.round((Date.now() - then) / 60000));
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.round(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function careerFitScore(evaluation: { fit_score?: number | null; score?: number | null }): number {
  if (typeof evaluation.fit_score === "number") return Math.round(evaluation.fit_score);
  if (typeof evaluation.score === "number") return Math.round(evaluation.score <= 5 ? evaluation.score * 20 : evaluation.score);
  return 0;
}

export function initials(name: string | null | undefined, fallback = "RP"): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return fallback;
  return parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || fallback;
}

export function slugFromEmail(email: string | null | undefined): string {
  const local = (email || "member").split("@")[0] || "member";
  return local.replace(/[^a-z0-9]+/gi, ".").replace(/^\.+|\.+$/g, "").toLowerCase() || "member";
}

export function applyFromAddress(email: string | null | undefined, userId: string): string {
  const slug = slugFromEmail(email);
  const short = userId.replace(/-/g, "").slice(0, 6);
  return `${slug}.${short}@apply.resumepreps.com`;
}

export function detectAts(url: string | null | undefined): string {
  const value = (url || "").toLowerCase();
  if (value.includes("greenhouse.io")) return "greenhouse";
  if (value.includes("jobs.lever.co") || value.includes("lever.co")) return "lever";
  if (value.includes("ashbyhq.com") || value.includes("jobs.ashby")) return "ashby";
  if (value.includes("workable.com")) return "workable";
  if (value.includes("myworkdayjobs.com") || value.includes("workday.com")) return "workday";
  if (value.includes("jobvite.com")) return "jobvite";
  if (value.includes("icims.com")) return "icims";
  if (value.includes("taleo")) return "taleo";
  if (value.includes("smartrecruiters.com")) return "smartrecruiters";
  return "unknown";
}

export const SUPPORTED_ATS = new Set(["greenhouse", "lever", "ashby", "workable"]);

export function atsSupported(portal: string): boolean {
  return SUPPORTED_ATS.has(portal);
}

export function workplaceLabel(policy: string | null | undefined): string {
  const value = (policy || "").toLowerCase();
  if (value.includes("remote")) return "Remote";
  if (value.includes("hybrid")) return "Hybrid";
  if (value.includes("on-site") || value.includes("onsite") || value.includes("office")) return "On-site";
  return policy?.trim() || "US";
}

export function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadText(filename: string, contents: string, type = "text/csv;charset=utf-8"): void {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
