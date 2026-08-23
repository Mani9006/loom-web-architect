export interface MatchFilters {
  date: "any" | "24h" | "3d" | "7d" | "14d" | "30d";
  location: string;
  workplace: "any" | "remote" | "hybrid" | "onsite";
  companies: string;
  degree: "any" | "none" | "bachelors" | "masters" | "phd";
  maxExp: string;
  visaSponsor: "any" | "yes" | "no";
  role: string;
  jobType: "any" | "full_time" | "part_time" | "contract" | "internship";
  employment: "any" | "full_time" | "part_time" | "contract";
}

export const EMPTY_FILTERS: MatchFilters = {
  date: "any",
  location: "",
  workplace: "any",
  companies: "",
  degree: "any",
  maxExp: "",
  visaSponsor: "any",
  role: "",
  jobType: "any",
  employment: "any",
};

export function postedWithin(iso: string | null | undefined, date: MatchFilters["date"]): boolean {
  if (date === "any" || !iso) return true;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return true;
  const days = { "24h": 1, "3d": 3, "7d": 7, "14d": 14, "30d": 30 }[date];
  return Date.now() - then <= days * 86400000;
}

export interface FilterableJob {
  title: string;
  company: string;
  location: string | null;
  workplace?: string | null;
  postedAt?: string | null;
  description?: string | null;
  visaSponsor?: boolean | null;
  yearsRequired?: number | null;
}

export function matchesFilters(job: FilterableJob, filters: MatchFilters): boolean {
  if (!postedWithin(job.postedAt, filters.date)) return false;

  if (filters.location.trim()) {
    const needle = filters.location.trim().toLowerCase();
    if (!(job.location || "").toLowerCase().includes(needle)) return false;
  }

  if (filters.workplace !== "any") {
    const policy = (job.workplace || job.location || "").toLowerCase();
    if (filters.workplace === "remote" && !policy.includes("remote")) return false;
    if (filters.workplace === "hybrid" && !policy.includes("hybrid")) return false;
    if (filters.workplace === "onsite" && (policy.includes("remote") && !policy.includes("on"))) return false;
  }

  if (filters.companies.trim()) {
    const allowed = filters.companies.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowed.length && !allowed.some((c) => job.company.toLowerCase().includes(c))) return false;
  }

  if (filters.role.trim()) {
    const needle = filters.role.trim().toLowerCase();
    if (!job.title.toLowerCase().includes(needle)) return false;
  }

  if (filters.visaSponsor === "yes" && job.visaSponsor === false) return false;
  if (filters.visaSponsor === "no" && job.visaSponsor === true) return false;

  const maxExp = Number(filters.maxExp);
  if (Number.isFinite(maxExp) && maxExp > 0 && typeof job.yearsRequired === "number" && job.yearsRequired > maxExp) {
    return false;
  }

  if (filters.degree !== "any") {
    const text = `${job.title} ${job.description || ""}`.toLowerCase();
    if (filters.degree === "none" && /\b(ph\.?d|doctorate|master'?s|mba|bachelor'?s)\b/.test(text) && /\brequired\b/.test(text)) {
      return false;
    }
    if (filters.degree === "phd" && !/\b(ph\.?d|doctorate)\b/.test(text)) return false;
    if (filters.degree === "masters" && !/\b(master'?s|mba|ms\b|m\.s\.)/.test(text)) return false;
    if (filters.degree === "bachelors" && !/\b(bachelor|bs\b|b\.s\.|ba\b)\b/.test(text)) return false;
  }

  if (filters.jobType !== "any" || filters.employment !== "any") {
    const text = `${job.title} ${job.description || ""}`.toLowerCase();
    const kind = filters.jobType !== "any" ? filters.jobType : filters.employment;
    if (kind === "internship" && !/intern/.test(text)) return false;
    if (kind === "contract" && !/contract|c2h|contractor/.test(text)) return false;
    if (kind === "part_time" && !/part[-\s]?time/.test(text)) return false;
    if (kind === "full_time" && /part[-\s]?time|intern/.test(text) && !/full[-\s]?time/.test(text)) return false;
  }

  return true;
}
