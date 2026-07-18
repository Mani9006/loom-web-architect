/**
 * career-ops-tailor — Tailored CV + cover note + 5 draft answers.
 *
 * Model: standard routing tier (cost-controlled and provider-swappable).
 *
 * Body: { evaluation_id: uuid }
 * Returns: { draft }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { truncate } from "../_shared/ai.ts";
import { callLlmWithFallback } from "../_shared/llm.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUserOrService,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

const MAX_DESC = 10_000;

interface TailorPayload {
  tailored_resume: {
    summary: string;
    experience: Array<{
      id?: string;
      role: string;
      company_or_client: string;
      start_date: string;
      end_date: string;
      location: string;
      bullets: string[];
    }>;
    skills: Record<string, string[]>;
    projects?: Array<{
      id?: string;
      title: string;
      organization: string;
      date: string;
      bullets: string[];
      url?: string;
    }>;
  };
  cover_note: string;
  answers: Array<{ question: string; answer: string }>;
}

const SYSTEM_PROMPT = `You are a senior résumé editor and application coach. Given a candidate's base resume and a specific job posting, produce:

1. A tailored resume (JSON) — NEVER invent roles, skills, dates, locations, or numbers. Reorder bullets and rewrite phrasing to foreground what the job wants. Strong verbs. Quantify only when the source already did.
2. A one-paragraph cover note (3-4 sentences, "I'm choosing you" tone, specific proof points, no fluff).
3. Draft answers to five standard ATS questions:
   a. Why are you interested in this role?
   b. Why do you want to work at {company}?
   c. Tell us about a relevant project or achievement.
   d. What makes you a good fit for this position?
   e. Work authorization / when can you start?

Rules:
- Never fabricate experience the resume doesn't support.
- Preserve every source experience entry, employer, role, date, location, and ID in its original order. You may reorder bullets, but do not delete facts.
- Preserve the source skill category keys and project IDs. Reorder only skills that the source already demonstrates.
- Keep each answer <120 words; 2-4 sentences.
- Every answer references something specific from the JD.
- Return ONLY JSON, no markdown fences.

Schema:
{
  "tailored_resume": {
    "summary": string,
    "experience": [{"id","role","company_or_client","start_date","end_date","location","bullets": string[]}],
    "skills": {"category_key": string[]},
    "projects": [{"id","title","organization","date","bullets": string[],"url": string?}]
  },
  "cover_note": string,
  "answers": [{"question","answer"}, ...]
}`;

function buildResumePrompt(r: any): string {
  const p: string[] = [];
  if (r.personal_info?.fullName || r.personal_info?.name) p.push(`Name: ${r.personal_info.fullName || r.personal_info.name}`);
  if (r.summary || r.personal_info?.summary) p.push(`Summary: ${r.summary || r.personal_info.summary}`);
  if (Array.isArray(r.experience)) {
    p.push("## Experience");
    for (const x of r.experience) {
      p.push(`- ${x.role ?? x.title ?? ""} @ ${x.company_or_client ?? x.company ?? ""} (${x.start_date ?? ""}–${x.end_date ?? "present"}) [id=${x.id ?? ""}; location=${x.location ?? ""}]`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) p.push(`  • ${b}`);
      else if (x.description) p.push(`  • ${x.description}`);
    }
  }
  const skills = normalizeSkills(r.skills);
  if (Object.keys(skills).length > 0) p.push("## Skills\n" + JSON.stringify(skills));
  if (Array.isArray(r.projects)) {
    p.push("## Projects");
    for (const x of r.projects) {
      p.push(`- ${x.title ?? x.name ?? ""} [id=${x.id ?? ""}; organization=${x.organization ?? ""}; date=${x.date ?? ""}]`);
      if (Array.isArray(x.bullets)) for (const bullet of x.bullets) p.push(`  • ${bullet}`);
      else if (x.description) p.push(`  • ${x.description}`);
    }
  }
  return p.join("\n");
}

function renderMarkdown(t: TailorPayload["tailored_resume"], name: string): string {
  const L: string[] = [`# ${name}`];
  if (t.summary) L.push("", "## Summary", t.summary);
  if (t.experience?.length) {
    L.push("", "## Experience");
    for (const x of t.experience) {
      L.push(`\n**${x.role}** — ${x.company_or_client}  `);
      L.push(`_${x.start_date ?? ""} – ${x.end_date ?? "present"}_`);
      if (x.location) L.push(`${x.location}  `);
      for (const b of x.bullets) L.push(`- ${b}`);
    }
  }
  const skills = normalizeSkills(t.skills);
  if (Object.keys(skills).length > 0) {
    L.push("", "## Skills");
    for (const [category, values] of Object.entries(skills)) {
      L.push(`**${category.replace(/_/g, " ")}**: ${values.join(" · ")}`);
    }
  }
  if (t.projects?.length) {
    L.push("", "## Projects");
    for (const p of t.projects) {
      L.push(`- **${p.title}**${p.organization ? ` — ${p.organization}` : ""}`);
      for (const bullet of p.bullets ?? []) L.push(`  - ${bullet}`);
    }
  }
  return L.join("\n");
}

function normalizeSkills(value: unknown): Record<string, string[]> {
  if (Array.isArray(value)) {
    const tools = value.map((item: any) => typeof item === "string" ? item : item?.name).filter(Boolean);
    return tools.length > 0 ? { tools } : {};
  }
  if (!value || typeof value !== "object") return {};
  const result: Record<string, string[]> = {};
  for (const [key, items] of Object.entries(value as Record<string, unknown>)) {
    if (!Array.isArray(items)) continue;
    const clean = items.map(String).map((item) => item.trim()).filter(Boolean);
    if (clean.length > 0) result[key] = [...new Set(clean)];
  }
  return result;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cleanBullets(value: unknown, fallback: unknown): string[] {
  const clean = Array.isArray(value)
    ? value.map(String).map((item) => item.trim()).filter(Boolean)
    : [];
  if (clean.length > 0) return clean;
  if (Array.isArray(fallback)) return fallback.map(String).map((item) => item.trim()).filter(Boolean);
  return typeof fallback === "string" && fallback.trim() ? [fallback.trim()] : [];
}

function findTailoredEntry(output: unknown, source: Record<string, unknown>, index: number): Record<string, unknown> {
  if (!Array.isArray(output)) return {};
  const sourceId = typeof source.id === "string" ? source.id : "";
  if (sourceId) {
    const matching = output.find((entry) => asRecord(entry).id === sourceId);
    if (matching) return asRecord(matching);
  }
  return asRecord(output[index]);
}

function mergeExperience(output: unknown, source: unknown): Array<Record<string, unknown>> {
  const sourceEntries = Array.isArray(source) ? source.map(asRecord) : [];
  return sourceEntries.map((entry, index) => {
    const tailored = findTailoredEntry(output, entry, index);
    return {
      ...entry,
      id: entry.id,
      role: entry.role ?? entry.title ?? "",
      company_or_client: entry.company_or_client ?? entry.company ?? "",
      start_date: entry.start_date ?? "",
      end_date: entry.end_date ?? "",
      location: entry.location ?? "",
      bullets: cleanBullets(tailored.bullets, entry.bullets ?? entry.description),
    };
  });
}

function mergeProjects(output: unknown, source: unknown): Array<Record<string, unknown>> {
  const sourceEntries = Array.isArray(source) ? source.map(asRecord) : [];
  return sourceEntries.map((entry, index) => {
    const tailored = findTailoredEntry(output, entry, index);
    return {
      ...entry,
      id: entry.id,
      title: entry.title ?? entry.name ?? "",
      organization: entry.organization ?? "",
      date: entry.date ?? "",
      url: entry.url,
      bullets: cleanBullets(tailored.bullets, entry.bullets ?? entry.description),
    };
  });
}

function constrainSkills(output: unknown, source: unknown): Record<string, string[]> {
  const sourceSkills = normalizeSkills(source);
  const outputSkills = normalizeSkills(output);
  const result: Record<string, string[]> = {};

  for (const [category, sourceValues] of Object.entries(sourceSkills)) {
    const byKey = new Map(sourceValues.map((value) => [value.toLowerCase(), value]));
    const ordered = (outputSkills[category] ?? [])
      .map((value) => byKey.get(value.toLowerCase()))
      .filter((value): value is string => Boolean(value));
    const seen = new Set(ordered.map((value) => value.toLowerCase()));
    result[category] = [
      ...ordered,
      ...sourceValues.filter((value) => !seen.has(value.toLowerCase())),
    ];
  }

  return result;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const body = await req.json().catch(() => ({})) as {
      evaluation_id?: string;
      user_id?: string;
      allow_outside_preferences?: boolean;
    };
    const user = await getAuthedUserOrService(req, body.user_id);
    if (!body.evaluation_id) throw new HttpError(400, "evaluation_id required");

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);

    const { data: ev } = await svc.from("job_evaluations")
      .select("id,user_id,scanned_job_id,keyword_matches,gaps,resume_id,eligible,hard_filters,score_version")
      .eq("id", body.evaluation_id).maybeSingle();
    if (!ev) throw new HttpError(404, "evaluation not found");
    if (ev.user_id !== user.id) throw new HttpError(403, "forbidden");
    if (ev.score_version !== "career-fit-v1") {
      throw new HttpError(409, "job must be rescored with the current career-fit gate before tailoring");
    }
    // Autopilot respects the user's saved limits. A user-initiated Apply is
    // still allowed after the UI shows the preference mismatch; personal
    // preferences must never make a public job inaccessible.
    if (!ev.eligible && !body.allow_outside_preferences) {
      throw new HttpError(412, "job is outside the saved autopilot preferences");
    }

    await enforceDailyCap(svc, user.id, "tailor", isPro);

    const { data: job } = await svc.from("scanned_jobs")
      .select("id,title,location,compensation_text,description_md,apply_url,company:scan_companies(name)")
      .eq("id", ev.scanned_job_id).maybeSingle();
    if (!job) throw new HttpError(404, "job not found");

    let baseResume: any = null;
    if (ev.resume_id) {
      const { data } = await svc.from("resumes").select("*").eq("id", ev.resume_id).maybeSingle();
      baseResume = data;
    }
    if (!baseResume) {
      const { data } = await svc.from("resumes").select("*").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(1);
      baseResume = data?.[0];
    }
    if (!baseResume) throw new HttpError(412, "no resume found for user");

    const companyName = (job as any).company?.name ?? "the company";
    const result = await callLlmWithFallback<TailorPayload>({
      tier: "standard",
      system: SYSTEM_PROMPT,
      cachedContext: `Candidate base résumé:\n\n${buildResumePrompt(baseResume)}`,
      user:
        `Company: ${companyName}\n` +
        `Title: ${job.title}\n` +
        `Location: ${job.location ?? "n/a"}\n` +
        `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
        `JD:\n${truncate(job.description_md, MAX_DESC)}\n\n` +
        `Prior evaluation strengths: ${(ev.keyword_matches || []).join(", ")}. ` +
        `Gaps: ${(ev.gaps || []).join(", ")}.`,
      maxTokens: 3500,
      temperature: 0.3,
      parseJson: true,
    });
    const payload = result.text;

    const sourceExperience = Array.isArray(baseResume.experience) ? baseResume.experience : [];
    const sourceProjects = Array.isArray(baseResume.projects) ? baseResume.projects : [];
    const tailoredExperience = mergeExperience(payload.tailored_resume.experience, sourceExperience);
    const tailoredProjects = mergeProjects(payload.tailored_resume.projects, sourceProjects);
    const tailoredSkills = constrainSkills(payload.tailored_resume.skills, baseResume.skills);
    const childTitle = `${baseResume.title || "Resume"} — ${companyName} ${job.title}`.slice(0, 120);
    const { data: child, error: childErr } = await svc.from("resumes").insert({
      user_id: user.id,
      title: childTitle,
      personal_info: baseResume.personal_info,
      summary: payload.tailored_resume.summary,
      experience: tailoredExperience,
      education: baseResume.education || [],
      skills: tailoredSkills,
      projects: tailoredProjects,
      certifications: baseResume.certifications || [],
      languages: baseResume.languages || [],
      template: baseResume.template || "default",
      section_order: baseResume.section_order || null,
    }).select("id").single();
    if (childErr) throw new HttpError(500, `save tailored resume: ${childErr.message}`);

    const name = (baseResume as any).personal_info?.fullName || (baseResume as any).personal_info?.name || "Candidate";
    const tailored_cv_md = renderMarkdown({
      ...payload.tailored_resume,
      experience: tailoredExperience,
      projects: tailoredProjects,
      skills: tailoredSkills,
    }, name);

    const { data: draft, error: draftErr } = await svc.from("draft_applications").upsert({
      user_id: user.id,
      evaluation_id: body.evaluation_id,
      tailored_resume_id: (child as any).id,
      tailored_cv_md,
      answers: [...payload.answers, { question: "Cover note", answer: payload.cover_note }],
      status: "ready",
    }, { onConflict: "user_id,evaluation_id" }).select().single();
    if (draftErr) throw new HttpError(500, `save draft: ${draftErr.message}`);

    await logAiUsage(svc, user.id, "tailor", result.tokens_in, result.tokens_out);
    return jsonResponse({ draft });
  });
});
