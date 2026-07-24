import { describe, expect, it } from "vitest";
import { jobIdentityKey } from "@/lib/job-identity";

describe("saved job identity", () => {
  it("matches a saved listing when the provider changes or omits its location", () => {
    expect(
      jobIdentityKey({
        title: "Senior Software Engineer",
        company: "Example Labs",
      }),
    ).toBe(
      jobIdentityKey({
        title: " Senior   Software Engineer ",
        company: "EXAMPLE LABS",
      }),
    );
  });

  it("does not collapse different roles at the same company", () => {
    expect(jobIdentityKey({ title: "Data Engineer", company: "Example Labs" })).not.toBe(
      jobIdentityKey({ title: "Product Manager", company: "Example Labs" }),
    );
  });
});
