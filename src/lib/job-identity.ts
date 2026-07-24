interface JobIdentityInput {
  title: string | null | undefined;
  company: string | null | undefined;
}

function normalizeIdentityPart(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("en-US");
}

/**
 * Saved-job identity deliberately excludes location. Providers frequently
 * represent the same listing as "Remote", a metro area, or an empty value
 * between requests, while title and company remain stable.
 */
export function jobIdentityKey(job: JobIdentityInput): string {
  return JSON.stringify([
    normalizeIdentityPart(job.company),
    normalizeIdentityPart(job.title),
  ]);
}
