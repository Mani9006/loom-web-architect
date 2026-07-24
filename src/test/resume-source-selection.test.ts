import { describe, expect, it } from "vitest";
import {
  isApplicationResumeVariant,
  selectProfileSourceResume,
  type ProfileResumeCandidate,
} from "@/lib/resume-source-selection";

const OWNER_ID = "user-1";

function resume(
  id: string,
  updatedAt: string,
  role?: string,
  overrides: Partial<ProfileResumeCandidate> = {},
): ProfileResumeCandidate {
  return {
    id,
    user_id: OWNER_ID,
    title: id,
    updated_at: updatedAt,
    created_at: updatedAt,
    source_document_id: null,
    personal_info: role ? { _v2_extras: { document_role: role } } : {},
    ...overrides,
  };
}

describe("Profile source resume selection", () => {
  it("prefers the owner's eligible primary resume over a newer application snapshot", () => {
    const primary = resume("master", "2026-07-01T00:00:00Z", "master");
    const snapshot = resume("pinterest", "2026-07-24T00:00:00Z", "application_snapshot");

    expect(selectProfileSourceResume([snapshot, primary], primary.id, OWNER_ID)?.id).toBe(primary.id);
  });

  it("falls back to the newest master/source when the primary points to a tailored variant", () => {
    const olderMaster = resume("older-master", "2026-06-01T00:00:00Z", "master");
    const newestMaster = resume("newest-master", "2026-07-10T00:00:00Z", "master");
    const tailored = resume("tailored", "2026-07-24T00:00:00Z", "tailored_draft");

    expect(
      selectProfileSourceResume([tailored, olderMaster, newestMaster], tailored.id, OWNER_ID)?.id,
    ).toBe(newestMaster.id);
  });

  it("excludes lineage-based snapshots and resumes owned by another user", () => {
    const lineageSnapshot = resume("snapshot", "2026-07-24T00:00:00Z", undefined, {
      personal_info: { _v2_extras: { source_resume_id: "master" } },
    });
    const otherUsersPrimary = resume("other", "2026-07-25T00:00:00Z", "master", {
      user_id: "user-2",
    });
    const legacySource = resume("legacy-source", "2026-07-01T00:00:00Z");

    expect(isApplicationResumeVariant(lineageSnapshot)).toBe(true);
    expect(
      selectProfileSourceResume(
        [lineageSnapshot, otherUsersPrimary, legacySource],
        otherUsersPrimary.id,
        OWNER_ID,
      )?.id,
    ).toBe(legacySource.id);
  });

  it("returns null when every owned resume is application-only", () => {
    expect(
      selectProfileSourceResume([
        resume("snapshot", "2026-07-24T00:00:00Z", "application_snapshot"),
        resume("tailored", "2026-07-23T00:00:00Z", "tailored_draft"),
      ], null, OWNER_ID),
    ).toBeNull();
  });
});
