import { describe, expect, it } from "vitest";
import { toUserFacingError, withSupportReference } from "@/lib/user-facing-error";

describe("user-facing error boundary", () => {
  it("never exposes provider or secret configuration details", () => {
    const safe = toUserFacingError(
      new Error("PERPLEXITY_API_KEY not configured in Supabase function perplexity-job-search"),
      { operation: "job_search" },
    );

    const rendered = withSupportReference(safe);
    expect(rendered).not.toMatch(/perplexity|api_key|supabase|function/i);
    expect(rendered).toMatch(/Reference: RP-[A-F0-9]{8}/);
  });

  it("returns actionable timeout copy without raw internals", () => {
    const safe = toUserFacingError(new Error("upstream provider timed out after 25000ms"), {
      operation: "resume_parse",
    });
    expect(safe.title).toBe("This is taking longer than expected");
    expect(safe.message).not.toContain("provider");
  });

  it("uses stable support references for the same failure", () => {
    const one = toUserFacingError("database relation public.secret_table missing", { operation: "save" });
    const two = toUserFacingError("database relation public.secret_table missing", { operation: "save" });
    expect(one.reference).toBe(two.reference);
  });
});

