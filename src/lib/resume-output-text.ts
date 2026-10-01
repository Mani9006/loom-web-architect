/* eslint-disable no-control-regex -- imported resumes can contain hidden control glyphs that break export rendering */
import type { ResumeJSON } from "@/types/resume";

/**
 * Cleans artifacts commonly introduced by AI-generated resume drafts or copied
 * markdown while preserving real resume content such as CI/CD, R&D, dates, and
 * company names.
 */
export function cleanResumeDisplayText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/\s*--+\s*/g, " - ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]+([,;)])/g, "$1")
    .replace(/[ \t]+([.:])(?=\s|$)/g, "$1")
    .replace(/\([ \t]+/g, "(")
    .replace(/(?:^|\n)\s*[-–—]\s*(?=\n|$)/g, "\n")
    .replace(/\s+-\s*$/g, "")
    .replace(/^\s*-\s*$/, "")
    .trim();
}

export function cleanResumeBulletText(value: unknown): string {
  return cleanResumeDisplayText(value)
    .replace(/^\s*(?:[-*•·]+|\d+[.)])\s*/, "")
    .trim();
}

export function cleanResumeList(values: unknown[] | undefined, bullet = false): string[] {
  if (!Array.isArray(values)) return [];
  const clean = bullet ? cleanResumeBulletText : cleanResumeDisplayText;
  return values.map(clean).filter(Boolean);
}

export function cleanResumeForOutput(data: ResumeJSON): ResumeJSON {
  return {
    ...data,
    header: {
      ...data.header,
      name: cleanResumeDisplayText(data.header?.name),
      title: cleanResumeDisplayText(data.header?.title),
      location: cleanResumeDisplayText(data.header?.location),
      email: cleanResumeDisplayText(data.header?.email),
      phone: cleanResumeDisplayText(data.header?.phone),
      linkedin: cleanResumeDisplayText(data.header?.linkedin),
    },
    summary: cleanResumeDisplayText(data.summary),
    experience: (data.experience || []).map((exp) => ({
      ...exp,
      role: cleanResumeDisplayText(exp.role),
      company_or_client: cleanResumeDisplayText(exp.company_or_client),
      start_date: cleanResumeDisplayText(exp.start_date),
      end_date: cleanResumeDisplayText(exp.end_date),
      location: cleanResumeDisplayText(exp.location),
      bullets: cleanResumeList(exp.bullets, true),
    })),
    education: (data.education || []).map((edu) => ({
      ...edu,
      degree: cleanResumeDisplayText(edu.degree),
      field: cleanResumeDisplayText(edu.field),
      institution: cleanResumeDisplayText(edu.institution),
      gpa: cleanResumeDisplayText(edu.gpa),
      graduation_date: cleanResumeDisplayText(edu.graduation_date),
      location: cleanResumeDisplayText(edu.location),
    })),
    certifications: (data.certifications || []).map((cert) => ({
      ...cert,
      name: cleanResumeDisplayText(cert.name),
      issuer: cleanResumeDisplayText(cert.issuer),
      date: cleanResumeDisplayText(cert.date),
      url: cleanResumeDisplayText(cert.url),
    })),
    projects: (data.projects || []).map((project) => ({
      ...project,
      title: cleanResumeDisplayText(project.title),
      organization: cleanResumeDisplayText(project.organization),
      date: cleanResumeDisplayText(project.date),
      url: cleanResumeDisplayText(project.url),
      bullets: cleanResumeList(project.bullets, true),
    })),
    languages: (data.languages || []).map((language) => ({
      ...language,
      language: cleanResumeDisplayText(language.language),
      proficiency: cleanResumeDisplayText(language.proficiency),
    })),
    volunteer: (data.volunteer || []).map((volunteer) => ({
      ...volunteer,
      role: cleanResumeDisplayText(volunteer.role),
      organization: cleanResumeDisplayText(volunteer.organization),
      date: cleanResumeDisplayText(volunteer.date),
      bullets: cleanResumeList(volunteer.bullets, true),
    })),
    awards: (data.awards || []).map((award) => ({
      ...award,
      title: cleanResumeDisplayText(award.title),
      issuer: cleanResumeDisplayText(award.issuer),
      date: cleanResumeDisplayText(award.date),
      url: cleanResumeDisplayText(award.url),
    })),
    customSections: (data.customSections || []).map((section) => ({
      ...section,
      name: cleanResumeDisplayText(section.name),
      entries: (section.entries || []).map((entry) => ({
        ...entry,
        title: cleanResumeDisplayText(entry.title),
        subtitle: cleanResumeDisplayText(entry.subtitle),
        date: cleanResumeDisplayText(entry.date),
        url: cleanResumeDisplayText(entry.url),
        bullets: cleanResumeList(entry.bullets, true),
      })),
    })),
  };
}
