import { describe, expect, it } from "vitest";
import {
  createOpaqueOAuthState,
  hashOpaqueOAuthState,
} from "../../supabase/functions/_shared/oauth-crypto";
import { resolveInboxReturnTo } from "../../supabase/functions/_shared/oauth-return-url";

describe("Gmail OAuth state", () => {
  it("creates a random, opaque 256-bit value without embedded workspace data", () => {
    const first = createOpaqueOAuthState();
    const second = createOpaqueOAuthState();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(first).not.toContain(".");
    expect(first).not.toContain("{");
  });

  it("persists a deterministic hash rather than the bearer state", async () => {
    const state = createOpaqueOAuthState();
    const firstHash = await hashOpaqueOAuthState(state);
    const secondHash = await hashOpaqueOAuthState(state);

    expect(firstHash).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(firstHash).toBe(secondHash);
    expect(firstHash).not.toBe(state);
  });

  it.each(["", "abc", "a".repeat(42), "a".repeat(44), `${"a".repeat(42)}.`])(
    "rejects malformed callback state before hashing: %s",
    async (state) => {
      await expect(hashOpaqueOAuthState(state)).rejects.toThrow("Invalid OAuth state");
    },
  );

  it.each([
    ["https://www.resumepreps.com/jobs?next=evil", "https://www.resumepreps.com/inbox"],
    ["https://resumepreps.com", "https://resumepreps.com/inbox"],
    ["http://localhost:5173/anything", "http://localhost:5173/inbox"],
    [
      "https://loom-web-architect-git-codex-recovery-maanys-projects-8bbfa798.vercel.app/jobs",
      "https://loom-web-architect-git-codex-recovery-maanys-projects-8bbfa798.vercel.app/inbox",
    ],
  ])("normalizes a trusted return URL: %s", (candidate, expected) => {
    expect(resolveInboxReturnTo(candidate, "https://www.resumepreps.com")).toBe(expected);
  });

  it.each([
    "https://attacker.vercel.app/inbox",
    "https://loom-web-architect-attacker.vercel.app/inbox",
    "https://resumepreps.com.attacker.example/inbox",
    "javascript:alert(1)",
    "http://www.resumepreps.com/inbox",
  ])("rejects an untrusted OAuth return origin: %s", (candidate) => {
    expect(resolveInboxReturnTo(candidate, "https://www.resumepreps.com"))
      .toBe("https://www.resumepreps.com/inbox");
  });
});
