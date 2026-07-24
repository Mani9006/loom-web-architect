/**
 * Canonical resume artifact serializer.
 *
 * The database stores a resume across JSON columns. This module is the single
 * server-side projection of those columns into the text document consumed by
 * the application PDF renderer. It intentionally has no Deno, browser, or
 * database dependencies so parity can be verified with unit tests.
 */

export type ResumeRecord = Record<string, unknown>;

const BUILT_IN_SECTIONS = [
  "summary",
  "experience",
  "education",
  "skills",
  "certifications",
  "projects",
  "languages",
  "volunteer",
  "awards",
] as const;

const ARTIFACT_SCHEMA_VERSION = "resume-artifact-v2";

/**
 * Bump this whenever the PDF renderer or pagination rules change in a way
 * that must invalidate an existing immutable object in Storage. Keeping this
 * separate from the serialized resume schema prevents layout-only releases
 * from accidentally reusing an older PDF for identical resume text.
 */
export const RESUME_PDF_RENDERER_VERSION = "resume-pdf-v3";

function record(value: unknown): ResumeRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as ResumeRecord
    : {};
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function valueText(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const candidate = valueText(value);
    if (candidate) return candidate;
  }
  return "";
}

function uniqueTexts(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const candidate = valueText(value);
    const key = candidate.toLocaleLowerCase();
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    result.push(candidate);
  }
  return result;
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return uniqueTexts(value);
  if (typeof value === "string") {
    return uniqueTexts(value.split(/\r?\n|[,;](?=\s|$)/));
  }
  return [];
}

function label(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (character) => character.toLocaleUpperCase());
}

function pushSection(lines: string[], title: string, body: string[]): void {
  const meaningful = body.filter((line) => line.trim().length > 0);
  if (!meaningful.length) return;
  lines.push("", `## ${title.toUpperCase()}`, ...meaningful);
}

function pushEntry(
  target: string[],
  headingParts: unknown[],
  bullets: unknown,
  details: unknown[] = [],
): void {
  const heading = uniqueTexts(headingParts).join(" | ");
  if (!heading) return;
  target.push(heading);
  for (const detail of uniqueTexts(details)) target.push(`- ${detail}`);
  for (const bullet of stringList(bullets)) target.push(`- ${bullet}`);
}

function dateRange(item: ResumeRecord): string {
  const start = firstText(item.start_date, item.startDate);
  const end = firstText(item.end_date, item.endDate);
  const graduation = firstText(item.graduation_date, item.graduationDate, item.date);
  if (start || end) return [start, end || "Present"].filter(Boolean).join(" - ");
  return graduation;
}

function supplementalValue(row: ResumeRecord, snakeKey: string, camelKey: string): unknown {
  if (row[snakeKey] !== null && row[snakeKey] !== undefined) return row[snakeKey];
  if (row[camelKey] !== null && row[camelKey] !== undefined) return row[camelKey];
  const extras = record(record(row.personal_info)._v2_extras);
  return extras[snakeKey] ?? extras[camelKey];
}

function customSections(row: ResumeRecord): ResumeRecord[] {
  return array(supplementalValue(row, "custom_sections", "customSections")).map(record);
}

function sectionOrder(row: ResumeRecord, custom: ResumeRecord[]): string[] {
  const requested = array(row.section_order).map(valueText).filter(Boolean);
  const customIds = custom.map((section) => firstText(section.id, section.name)).filter(Boolean);
  const ordered: string[] = [];
  const seen = new Set<string>();
  for (const sectionId of [...requested, ...BUILT_IN_SECTIONS, ...customIds]) {
    if (!sectionId || seen.has(sectionId)) continue;
    seen.add(sectionId);
    ordered.push(sectionId);
  }
  return ordered;
}

function hasStructuredContent(row: ResumeRecord): boolean {
  if (firstText(row.summary)) return true;
  if (Object.keys(record(row.personal_info)).some((key) => key !== "_v2_extras")) return true;
  return [
    row.experience,
    row.education,
    row.skills,
    row.projects,
    row.certifications,
    row.languages,
    supplementalValue(row, "volunteer", "volunteer"),
    supplementalValue(row, "awards", "awards"),
    supplementalValue(row, "custom_sections", "customSections"),
  ].some((value) => Array.isArray(value) ? value.length > 0 : Object.keys(record(value)).length > 0);
}

/**
 * Returns the source/master resume id carried by application snapshots.
 */
export function sourceResumeId(row: ResumeRecord): string {
  return firstText(record(record(row.personal_info)._v2_extras).source_resume_id);
}

/**
 * Application snapshots created before the supplemental columns were copied
 * can have NULL volunteer/award/custom fields. Fill only those absent values
 * from the immutable source resume; explicit empty arrays remain intentional.
 */
export function mergeResumeArtifactSource(
  snapshot: ResumeRecord,
  source: ResumeRecord | null | undefined,
): ResumeRecord {
  if (!source) return snapshot;
  const merged: ResumeRecord = {
    ...snapshot,
    personal_info: {
      ...record(source.personal_info),
      ...record(snapshot.personal_info),
    },
  };
  for (const [snakeKey, camelKey] of [
    ["volunteer", "volunteer"],
    ["awards", "awards"],
    ["custom_sections", "customSections"],
  ] as const) {
    if (merged[snakeKey] === null || merged[snakeKey] === undefined) {
      merged[snakeKey] = supplementalValue(source, snakeKey, camelKey);
    }
  }
  return merged;
}

/**
 * Builds the complete, ordered text document used for the canonical PDF.
 * Every persisted resume field is represented as selectable text.
 */
export function resumeArtifactLines(row: ResumeRecord): string[] {
  const markdown = firstText(row.cv_md);
  if (markdown && !hasStructuredContent(row)) {
    return markdown.split(/\r?\n/).map((line) => line.trimEnd());
  }

  const personal = record(row.personal_info);
  const name = firstText(
    personal.name,
    personal.fullName,
    personal.full_name,
    row.name,
    "Resume",
  );
  const lines: string[] = [name];

  const contact = uniqueTexts([
    personal.title,
    personal.headline,
    personal.location,
    personal.email,
    personal.phone,
    personal.linkedin,
    personal.linkedin_url,
    personal.portfolio,
    personal.website,
    personal.github,
    personal.url,
  ]);
  if (contact.length) lines.push(contact.join(" | "));

  const experienceBody: string[] = [];
  for (const rawItem of array(row.experience)) {
    const item = record(rawItem);
    pushEntry(
      experienceBody,
      [
        firstText(item.role, item.title, item.position),
        firstText(item.company_or_client, item.company, item.client, item.employer),
        dateRange(item),
        item.location,
      ],
      item.bullets ?? item.responsibilities,
      firstText(item.environment) ? [`Environment: ${firstText(item.environment)}`] : [],
    );
  }

  const educationBody: string[] = [];
  for (const rawItem of array(row.education)) {
    const item = record(rawItem);
    const degree = firstText(item.degree);
    const field = firstText(item.field, item.major);
    const degreeAndField = degree && field ? `${degree} in ${field}` : degree || field;
    pushEntry(
      educationBody,
      [
        degreeAndField,
        firstText(item.institution, item.school, item.university),
        dateRange(item),
        item.location,
        firstText(item.gpa) ? `GPA: ${firstText(item.gpa)}` : "",
        firstText(item.url, item.website),
      ],
      [],
    );
  }

  const skillsBody: string[] = [];
  for (const [category, rawSkills] of Object.entries(record(row.skills))) {
    const skills = stringList(rawSkills);
    if (skills.length) skillsBody.push(`${label(category)}: ${skills.join(", ")}`);
  }

  const certificationBody: string[] = [];
  for (const rawItem of array(row.certifications)) {
    const item = record(rawItem);
    pushEntry(
      certificationBody,
      [
        firstText(item.name, item.title),
        firstText(item.issuer, item.organization),
        dateRange(item),
        firstText(item.url, item.credential_url, item.credentialUrl),
      ],
      [],
    );
  }

  const projectBody: string[] = [];
  for (const rawItem of array(row.projects)) {
    const item = record(rawItem);
    pushEntry(
      projectBody,
      [
        firstText(item.title, item.name),
        firstText(item.organization, item.client, item.company),
        dateRange(item),
        firstText(item.url, item.website, item.repository),
      ],
      item.bullets ?? item.description,
    );
  }

  const languageBody = array(row.languages).flatMap((rawItem) => {
    const item = record(rawItem);
    const language = firstText(item.language, item.name);
    if (!language) return [];
    const proficiency = firstText(item.proficiency, item.level);
    return [proficiency ? `${language} (${proficiency})` : language];
  });

  const volunteerBody: string[] = [];
  for (const rawItem of array(supplementalValue(row, "volunteer", "volunteer"))) {
    const item = record(rawItem);
    pushEntry(
      volunteerBody,
      [
        firstText(item.role, item.title),
        firstText(item.organization, item.company),
        dateRange(item),
        item.location,
        firstText(item.url, item.website),
      ],
      item.bullets ?? item.description,
    );
  }

  const awardBody: string[] = [];
  for (const rawItem of array(supplementalValue(row, "awards", "awards"))) {
    const item = record(rawItem);
    pushEntry(
      awardBody,
      [
        firstText(item.title, item.name),
        firstText(item.issuer, item.publisher, item.organization),
        dateRange(item),
        firstText(item.url, item.publication_url, item.publicationUrl),
      ],
      item.bullets ?? item.description,
    );
  }

  const custom = customSections(row);
  const customBodies = new Map<string, { title: string; body: string[] }>();
  for (const section of custom) {
    const id = firstText(section.id, section.name);
    if (!id) continue;
    const body: string[] = [];
    for (const rawEntry of array(section.entries)) {
      const entry = record(rawEntry);
      pushEntry(
        body,
        [
          firstText(entry.title, entry.name),
          firstText(entry.subtitle, entry.organization),
          dateRange(entry),
          firstText(entry.url, entry.website),
        ],
        entry.bullets ?? entry.description,
      );
    }
    customBodies.set(id, { title: firstText(section.name, id), body });
  }

  const renderers: Record<string, () => void> = {
    summary: () => {
      const summary = firstText(row.summary, personal.summary);
      if (summary) pushSection(lines, "Professional Summary", [summary]);
    },
    experience: () => pushSection(lines, "Professional Experience", experienceBody),
    education: () => pushSection(lines, "Education", educationBody),
    skills: () => pushSection(lines, "Technical Skills", skillsBody),
    certifications: () => pushSection(lines, "Certifications", certificationBody),
    projects: () => pushSection(lines, "Projects", projectBody),
    languages: () => pushSection(lines, "Languages", languageBody),
    volunteer: () => pushSection(lines, "Volunteer Experience", volunteerBody),
    awards: () => pushSection(lines, "Awards & Publications", awardBody),
  };

  for (const sectionId of sectionOrder(row, custom)) {
    const builtIn = renderers[sectionId];
    if (builtIn) {
      builtIn();
      continue;
    }
    const customSection = customBodies.get(sectionId);
    if (customSection) pushSection(lines, customSection.title, customSection.body);
  }

  return lines;
}

/**
 * Stable identity input for content-addressed artifacts. The renderer version
 * is part of the identity so a future layout change creates a new object.
 */
export function resumeArtifactIdentity(lines: string[]): string {
  return JSON.stringify({
    schemaVersion: ARTIFACT_SCHEMA_VERSION,
    rendererVersion: RESUME_PDF_RENDERER_VERSION,
    lines,
  });
}
