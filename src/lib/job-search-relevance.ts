interface SearchableJob {
  title?: string | null;
  description?: string | null;
  role_category?: string | null;
}

const ignored = new Set([
  "a", "an", "and", "for", "in", "job", "jobs", "near", "me", "of", "opening", "openings",
  "position", "positions", "remote", "role", "roles", "the", "with", "hiring",
  "junior", "senior", "sr", "lead", "staff", "principal", "associate", "entry", "level",
]);

const roleTerms = new Set([
  "accountant", "administrator", "analyst", "architect", "attorney", "consultant", "designer",
  "director", "engineer", "manager", "marketer", "nurse", "paralegal", "recruiter", "researcher",
  "scientist", "specialist", "technician",
]);

const aliases: Record<string, string> = {
  developer: "engineer",
  developers: "engineer",
  engineering: "engineer",
  engineers: "engineer",
  programmer: "engineer",
  programmers: "engineer",
  analytics: "data",
  managerial: "manager",
  management: "manager",
  recruiting: "recruiter",
};

function tokens(value: string): string[] {
  return Array.from(new Set(
    value.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").split(/\s+/)
      .map((token) => aliases[token] || token)
      .filter((token) => token.length > 1 && !ignored.has(token)),
  ));
}

/**
 * Final trust boundary for provider/cache results. Role searches must match
 * the requested occupation in the title; generic skill searches may match
 * title or description. This prevents a loose full-text cache hit from
 * entering the visible feed and application workflow.
 */
export function jobMatchesSearchIntent(job: SearchableJob, query: string): boolean {
  const wanted = tokens(query);
  if (!wanted.length) return true;
  const title = new Set(tokens(`${job.title || ""} ${job.role_category || ""}`));
  const allText = new Set(tokens(`${job.title || ""} ${job.role_category || ""} ${job.description || ""}`));
  const requestedRoles = wanted.filter((token) => roleTerms.has(token));

  if (requestedRoles.length) {
    if (!requestedRoles.some((token) => title.has(token))) return false;
    const titleHits = wanted.filter((token) => title.has(token)).length;
    const required = wanted.length <= 2 ? wanted.length : Math.ceil(wanted.length * 0.67);
    return titleHits >= required;
  }

  const titleHits = wanted.filter((token) => title.has(token)).length;
  if (titleHits > 0) return true;
  return wanted.every((token) => allText.has(token));
}

export function filterJobsForSearchIntent<T extends SearchableJob>(jobs: T[], query: string): T[] {
  return jobs.filter((job) => jobMatchesSearchIntent(job, query));
}
