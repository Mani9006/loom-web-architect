import { describe, expect, it } from "vitest";
import { personalInfoToHeader } from "@/lib/resume-personal-info";
import { calculateATSScore } from "@/lib/ats-scorer";
import { createEmptyResumeJSON } from "@/types/resume";

describe("personalInfoToHeader", () => {
  it("reads V2 fullName when name is missing", () => {
    const header = personalInfoToHeader({ fullName: "Ada Lovelace", title: "Engineer", _v2_extras: {} });
    expect(header).toEqual({
      name: "Ada Lovelace",
      title: "Engineer",
      location: "",
      email: "",
      phone: "",
      linkedin: "",
    });
  });

  it("prefers name and handles null/garbage input", () => {
    expect(personalInfoToHeader({ name: "A", fullName: "B" }).name).toBe("A");
    expect(personalInfoToHeader(null).name).toBe("");
    expect(personalInfoToHeader({ name: 42 }).name).toBe("");
  });

  it("produces a header the ATS scorer accepts", () => {
    const data = { ...createEmptyResumeJSON(), header: personalInfoToHeader({ fullName: "Ada" }) };
    expect(() => calculateATSScore(data)).not.toThrow();
  });
});
