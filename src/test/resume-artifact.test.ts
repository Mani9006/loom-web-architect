import { describe, expect, it } from "vitest";

import {
  mergeResumeArtifactSource,
  RESUME_PDF_RENDERER_VERSION,
  resumeArtifactIdentity,
  resumeArtifactLines,
  sourceResumeId,
} from "../../supabase/functions/_shared/resume-artifact";
import { blocksFromResumeLines } from "../../supabase/functions/_shared/resume-pdf-layout";

const completeResume = {
  personal_info: {
    name: "Asha Rao",
    title: "Principal Platform Engineer",
    location: "Austin, TX",
    email: "asha@example.com",
    phone: "555-0100",
    linkedin: "https://linkedin.com/in/asharao",
    portfolio: "https://asha.example",
  },
  summary: "Platform engineer focused on reliable distributed systems.",
  experience: [{
    role: "Principal Engineer",
    company_or_client: "Acme",
    start_date: "2021",
    end_date: "Present",
    location: "Remote",
    bullets: ["Cut deployment time by 60%."],
    environment: "Kubernetes, Go, PostgreSQL",
  }],
  education: [{
    degree: "M.S.",
    field: "Computer Science",
    institution: "State University",
    start_date: "2014",
    end_date: "2016",
    location: "Chicago, IL",
    gpa: "3.9",
    url: "https://state.example/cs",
  }],
  skills: {
    programming_languages: ["Go", "TypeScript"],
    cloud_platforms: ["AWS"],
  },
  certifications: [{
    name: "AWS Solutions Architect",
    issuer: "Amazon Web Services",
    date: "2025",
    url: "https://verify.example/aws",
  }],
  projects: [{
    title: "Open Scheduler",
    organization: "CNCF",
    date: "2024",
    url: "https://github.com/asha/scheduler",
    bullets: ["Built a policy-aware scheduling engine."],
  }],
  languages: [{ language: "English", proficiency: "Native" }],
  volunteer: [{
    role: "Mentor",
    organization: "Code Forward",
    date: "2022 - Present",
    location: "Austin, TX",
    url: "https://codeforward.example",
    bullets: ["Mentored 18 early-career engineers."],
  }],
  awards: [{
    title: "Distinguished Engineer Award",
    issuer: "Acme",
    date: "2024",
    url: "https://acme.example/awards",
  }],
  custom_sections: [{
    id: "professional_memberships",
    name: "Professional Memberships",
    entries: [{
      title: "Senior Member",
      subtitle: "IEEE",
      date: "2020 - Present",
      url: "https://ieee.example/member/asha",
      bullets: ["Served on the cloud systems working group."],
    }],
  }],
  section_order: [
    "summary",
    "skills",
    "experience",
    "projects",
    "education",
    "certifications",
    "languages",
    "volunteer",
    "awards",
    "professional_memberships",
  ],
};

describe("canonical resume artifact", () => {
  it("preserves every structured section and ATS-relevant detail", () => {
    const document = resumeArtifactLines(completeResume).join("\n");

    for (const expected of [
      "Asha Rao",
      "Principal Platform Engineer",
      "Austin, TX",
      "asha@example.com",
      "555-0100",
      "https://linkedin.com/in/asharao",
      "https://asha.example",
      "Platform engineer focused on reliable distributed systems.",
      "Principal Engineer | Acme | 2021 - Present | Remote",
      "Cut deployment time by 60%.",
      "Environment: Kubernetes, Go, PostgreSQL",
      "M.S. in Computer Science | State University | 2014 - 2016 | Chicago, IL | GPA: 3.9 | https://state.example/cs",
      "Programming Languages: Go, TypeScript",
      "AWS Solutions Architect | Amazon Web Services | 2025 | https://verify.example/aws",
      "Open Scheduler | CNCF | 2024 | https://github.com/asha/scheduler",
      "English (Native)",
      "Mentor | Code Forward | 2022 - Present | Austin, TX | https://codeforward.example",
      "Distinguished Engineer Award | Acme | 2024 | https://acme.example/awards",
      "## PROFESSIONAL MEMBERSHIPS",
      "Senior Member | IEEE | 2020 - Present | https://ieee.example/member/asha",
    ]) {
      expect(document).toContain(expected);
    }
  });

  it("appends populated sections omitted by a legacy section order", () => {
    const document = resumeArtifactLines({
      ...completeResume,
      section_order: ["summary", "experience"],
    }).join("\n");

    expect(document).toContain("## PROJECTS");
    expect(document).toContain("## VOLUNTEER EXPERIENCE");
    expect(document).toContain("## AWARDS & PUBLICATIONS");
    expect(document).toContain("## PROFESSIONAL MEMBERSHIPS");
  });

  it("recognizes an arbitrary custom section as a heading and keeps its entry together", () => {
    const lines = resumeArtifactLines(completeResume);
    const blocks = blocksFromResumeLines(lines, {
      wrap: (value, size, style, indent = 0) => [{
        value,
        size,
        style,
        indent,
      }].map(({ value: text }) => text),
    });
    const headingIndex = blocks.findIndex((block) =>
      block.kind === "heading" && block.lines.some((line) => line.text === "PROFESSIONAL MEMBERSHIPS")
    );

    expect(headingIndex).toBeGreaterThan(-1);
    expect(blocks[headingIndex].keepWithNext).toBe(true);
    expect(blocks[headingIndex + 1].kind).toBe("entry");
    expect(blocks[headingIndex + 1].lines.map((line) => line.text).join(" ")).toContain("Senior Member");
  });

  it("uses markdown as the source of truth for My Collection resume rows", () => {
    const markdown = [
      "# Jordan Lee",
      "jordan@example.com",
      "",
      "## Experience",
      "**Engineer** - Example Co",
      "- Shipped the application.",
    ].join("\n");

    expect(resumeArtifactLines({ name: "Jordan resume", cv_md: markdown }))
      .toEqual(markdown.split("\n"));
  });

  it("recovers only absent supplemental fields from an application snapshot source", () => {
    const snapshot = {
      personal_info: {
        name: "Asha Rao",
        title: "Target Role",
        _v2_extras: { source_resume_id: "source-1" },
      },
      volunteer: null,
      awards: [],
    };
    const source = {
      personal_info: { name: "Asha Rao", portfolio: "https://asha.example" },
      volunteer: [{ role: "Mentor", organization: "Code Forward" }],
      awards: [{ title: "Source award" }],
      custom_sections: [{ id: "memberships", name: "Memberships", entries: [] }],
    };
    const merged = mergeResumeArtifactSource(snapshot, source);

    expect(sourceResumeId(snapshot)).toBe("source-1");
    expect(merged.personal_info).toMatchObject({
      name: "Asha Rao",
      title: "Target Role",
      portfolio: "https://asha.example",
    });
    expect(merged.volunteer).toEqual(source.volunteer);
    expect(merged.awards).toEqual([]);
    expect(merged.custom_sections).toEqual(source.custom_sections);
  });

  it("produces a stable identity and changes it when canonical content changes", () => {
    const first = resumeArtifactIdentity(resumeArtifactLines(completeResume));
    const repeated = resumeArtifactIdentity(resumeArtifactLines(completeResume));
    const changed = resumeArtifactIdentity(resumeArtifactLines({
      ...completeResume,
      summary: "A materially different summary.",
    }));

    expect(repeated).toBe(first);
    expect(changed).not.toBe(first);
  });

  it("includes the PDF renderer version so layout releases invalidate immutable artifacts", () => {
    const lines = resumeArtifactLines(completeResume);
    const currentIdentity = resumeArtifactIdentity(lines);
    const legacyIdentity = JSON.stringify({
      version: "resume-artifact-v2",
      lines,
    });
    const identity = JSON.parse(
      currentIdentity,
    ) as {
      schemaVersion?: string;
      rendererVersion?: string;
      lines?: string[];
    };

    expect(currentIdentity).not.toBe(legacyIdentity);
    expect(identity.schemaVersion).toBe("resume-artifact-v2");
    expect(RESUME_PDF_RENDERER_VERSION).toBe("resume-pdf-v3");
    expect(identity.rendererVersion).toBe(RESUME_PDF_RENDERER_VERSION);
    expect(identity.lines).toEqual(lines);
  });
});
