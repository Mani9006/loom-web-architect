/**
 * career-ops-tailor — Tailored CV + cover note + 5 draft answers.
 *
 * Model: Sonnet 4.6 (truth-preserving résumé rewrite + tone-controlled writing).
 *
 * Body: { evaluation_id: uuid }
 * Returns: { draft }
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callClaude, truncate } from "../_shared/ai.ts";
import {
  corsHeaders, jsonResponse, withErrorHandler, getAuthedUser,
  enforceAccountActive, enforceDailyCap, logAiUsage, serviceClient, HttpError,
} from "../_shared/guards.ts";

const MAX_DESC = 10_000;

interface TailorPayload {
  tailored_resume: {
    summary: string;
    experience: Array<{ title: string; company: string; start_date?: string; end_date?: string; bullets: string[] }>;
    skills: string[];
    projects?: Array<{ name: string; description: string }>;
  };
  cover_note: string;
  answers: Array<{ question: string; answer: string }>;
}

const SYSTEM_PROMPT = `You are a senior résumé editor and application coach. Given a candidate's base resume and a specific job posting, produce:

1. A tailored resume (JSON) — NEVER invent roles, skills, dates, or numbers. Reorder bullets and rewrite phrasing to foreground what the job wants. Strong verbs. Quantify only when the source already did.
2. A one-paragraph cover note (3-4 sentences, "I'm choosing you" tone, specific proof points, no fluff).
3. Draft answers to five standard ATS questions:
   a. Why are you interested in this role?
   b. Why do you want to work at {company}?
   c. Tell us about a relevant project or achievement.
   d. What makes you a good fit for this position?
   e. Work authorization / when can you start?

Rules:
- Never fabricate experience the resume doesn't support.
- Keep each answer <120 words; 2-4 sentences.
- Every answer references something specific from the JD.
- Return ONLY JSON, no markdown fences.

Schema:
{
  "tailored_resume": {"summary": string, "experience": [{"title","company","start_date","end_date","bullets": string[]}], "skills": string[], "projects": [{"name","description"}]},
  "cover_note": string,
  "answers": [{"question","answer"}, ...]
}`;

function buildResumePrompt(r: any): string {
  const p: string[] = [];
  if (r.personal_info?.name) p.push(`Name: ${r.personal_info.name}`);
  if (r.summary || r.personal_info?.summary) p.push(`Summary: ${r.summary || r.personal_info.summary}`);
  if (Array.isArray(r.experience)) {
    p.push("## Experience");
    for (const x of r.experience) {
      p.push(`- ${x.title ?? ""} @ ${x.company ?? ""} (${x.start_date ?? ""}–${x.end_date ?? "present"})`);
      if (Array.isArray(x.bullets)) for (const b of x.bullets) p.push(`  • ${b}`);
      else if (x.description) p.push(`  • ${x.description}`);
    }
  }
  if (Array.isArray(r.skills)) p.push("## Skills\n" + r.skills.map((s: any) => s?.name || s).join(", "));
  if (Array.isArray(r.projects)) {
    p.push("## Projects");
    for (const x of r.projects) p.push(`- ${x.name}: ${x.description}`);
  }
  return p.join("\n");
}

function renderMarkdown(t: TailorPayload["tailored_resume"], name: string): string {
  const L: string[] = [`# ${name}`];
  if (t.summary) L.push("", "## Summary", t.summary);
  if (t.experience?.length) {
    L.push("", "## Experience");
    for (const x of t.experience) {
      L.push(`\n**${x.title}** — ${x.company}  `);
      L.push(`_${x.start_date ?? ""} – ${x.end_date ?? "present"}_`);
      for (const b of x.bullets) L.push(`- ${b}`);
    }
  }
  if (t.skills?.length) L.push("", "## Skills", t.skills.join(" · "));
  if (t.projects?.length) {
    L.push("", "## Projects");
    for (const p of t.projects) L.push(`- **${p.name}** — ${p.description}`);
  }
  return L.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders() });

  return withErrorHandler(async () => {
    const user = await getAuthedUser(req);
    const body = await req.json().catch(() => ({})) as { evaluation_id?: string };
    if (!body.evaluation_id) throw new HttpError(400, "evaluation_id required");

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);

    const { data: ev } = await svc.from("job_evaluations")
      .select("id,user_id,scanned_job_id,keyword_matches,gaps,resume_id")
      .eq("id", body.evaluation_id).maybeSingle();
    if (!ev) throw new HttpError(404, "evaluation not found");
    if (ev.user_id !== user.id) throw new HttpError(403, "forbidden");

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
    const result = await callClaude<TailorPayload>({
      tier: "complex",
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

    const childTitle = `${baseResume.title || "Resume"} — ${companyName} ${job.title}`.slice(0, 120);
    const { data: child, error: childErr } = await svc.from("resumes").insert({
      user_id: user.id,
      title: childTitle,
      personal_info: baseResume.personal_info,
      summary: payload.tailored_resume.summary,
      experience: payload.tailored_resume.experience,
      education: baseResume.education || [],
      skills: payload.tailored_resume.skills?.map((s) => ({ name: s })) || baseResume.skills,
      projects: payload.tailored_resume.projects || baseResume.projects || [],
      certifications: baseResume.certifications || [],
      languages: baseResume.languages || [],
      template: baseResume.template || "default",
    }).select("id").single();
    if (childErr) throw new HttpError(500, `save tailored resume: ${childErr.message}`);

    const name = (baseResume as any).personal_info?.name || "Candidate";
    const tailored_cv_md = renderMarkdown(payload.tailored_resume, name);

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
