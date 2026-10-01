import type { ResumeHeader } from "@/types/resume";

const str = (v: unknown) => (typeof v === "string" ? v : "");

/**
 * Build a ResumeHeader from a `resumes.personal_info` row value.
 * V2 writes `fullName` while older writers use `name`, so accept both and
 * default every field to "" so downstream scorers never see undefined.
 */
export function personalInfoToHeader(personalInfo: unknown): ResumeHeader {
  const p = personalInfo && typeof personalInfo === "object"
    ? (personalInfo as Record<string, unknown>)
    : {};
  return {
    name: str(p.name) || str(p.fullName),
    title: str(p.title),
    location: str(p.location),
    email: str(p.email),
    phone: str(p.phone),
    linkedin: str(p.linkedin),
  };
}
