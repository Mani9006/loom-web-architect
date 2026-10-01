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
import { chatFree } from "../_shared/llm.ts";
import { resumeToPlainText, scoreResumeDeterministic } from "../_shared/ats-deterministic.ts";
import { criticFeedbackToPrompt, runTailorCritic } from "../_shared/tailor-critic.ts";
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
   b. Why do you want to work at the company? (Write the actual company name from the job details into the question text; never output a literal "{company}" placeholder.)
   c. Tell us about a relevant project or achievement.
   d. What makes you a good fit for this position?
   e. Work authorization / when can you start?

Rules:
- Never fabricate experience the resume doesn't support.
- Never infer work authorization, visa status, citizenship, or availability from a location, school, or employer. A deterministic profile-data guard will finalize that answer.
- Preserve every source experience entry, employer, role, date, location, and ID in its original order. You may reorder bullets, but do not delete facts.
- Preserve project IDs. For skills, return only a job-relevant subset of skills the source already demonstrates; never add a skill. The source résumé remains unchanged.
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
  const order = ["programming_languages", "ai_ml", "data_engineering", "cloud_devops", "databases", "frameworks_apis", "analytics_bi", "testing_observability", "delivery_methods", "tools_platforms"];
  const result = Object.fromEntries(order.map((key) => [key, [] as string[]])) as Record<string, string[]>;
  const seen = new Set<string>();
  const entries = Array.isArray(value)
    ? [["tools", value] as const]
    : value && typeof value === "object"
      ? Object.entries(value as Record<string, unknown>).map(([key, items]) => [key, Array.isArray(items) ? items : [items]] as const)
      : [];
  for (const [sourceCategory, items] of entries) {
    for (const rawItem of items) {
      for (const part of String(rawItem ?? "").split(/[,;|\n\r•·]+/)) {
        const item = canonicalSkillDisplay(part.replace(/^[\s\-–—:]+|[\s\-–—:.]+$/g, "").replace(/\s+/g, " ").trim());
        const identity = item.toLowerCase().replace(/[^a-z0-9+#./]+/g, "");
        if (!isConcreteSkill(item) || !identity || seen.has(identity)) continue;
        result[classifySkill(item, sourceCategory)].push(item);
        seen.add(identity);
      }
    }
  }
  return Object.fromEntries(order.flatMap((key) => result[key].length ? [[key, result[key]]] : []));
}

function isConcreteSkill(value: string): boolean {
  const words = value.split(/\s+/).filter(Boolean);
  if (!value || value.length > 64 || words.length > 7) return false;
  if (/^(?:skills|technical skills|core skills|tools|technologies|communication|leadership|teamwork|problem solving|deployment readiness reviews|cloud and infrastructure|data and streaming)$/i.test(value)) return false;
  if (words.length > 3 && /\b(?:built|developed|designed|implemented|managed|led|delivered|collaborated|reviewed|ensured|improved|created)\b/i.test(value)) return false;
  return true;
}

function canonicalSkillDisplay(value: string): string {
  const aliases: Record<string, string> = {
    "rag and retrieval": "RAG",
    "agentic ai and tooling": "Agentic AI",
    "mlops and observability": "MLOps",
    "amazon web services": "AWS",
    "google cloud platform": "GCP",
    "ci cd": "CI/CD",
    "cicd": "CI/CD",
    "postgres": "PostgreSQL",
  };
  return aliases[value.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim()] ?? value;
}

function classifySkill(skill: string, sourceCategory: string): string {
  if (/^(?:python|r|java|javascript|typescript|c|c\+\+|c#|go|golang|rust|scala|kotlin|swift|ruby|php|matlab|bash|shell|powershell|vba|sql|html|css)$/i.test(skill)) return "programming_languages";
  if (/\b(?:ai|machine learning|deep learning|generative ai|agentic ai|llm|rag|nlp|computer vision|pytorch|tensorflow|keras|scikit|xgboost|transformers?|bert|spacy|hugging face|langchain|langgraph|llamaindex|openai|anthropic|gemini|embeddings?|vector search|prompt engineering|fine[- ]?tuning|guardrails?|feature engineering|mlflow|structured outputs?|function calling|tool calling|hybrid retrieval|reranking|chunking|metadata filtering|retrieval evaluation|hallucination checks?|safety validation|classification|anomaly detection)\b/i.test(skill)) return "ai_ml";
  if (/\b(?:etl|elt|data engineering|data pipeline|data lake|lakehouse|data warehouse|airflow|dagster|prefect|spark|hadoop|kafka|flink|dbt|databricks|snowflake|redshift|bigquery|workflow orchestration)\b/i.test(skill)) return "data_engineering";
  if (/\b(?:aws|azure|gcp|google cloud|docker|kubernetes|helm|terraform|ansible|jenkins|github actions|gitlab ci|ci\/cd|devops|mlops|serverless|s3|containerization)\b/i.test(skill)) return "cloud_devops";
  if (/\b(?:postgres|mysql|oracle|sql server|sqlite|mongodb|dynamodb|cassandra|redis|neo4j|elasticsearch|opensearch|pinecone|weaviate|milvus|chroma|qdrant|database|nosql)\b/i.test(skill)) return "databases";
  if (/\b(?:react|angular|vue|next\.?js|node\.?js|express|spring|fastapi|flask|django|\.net|graphql|grpc|rest(?:ful)? apis?|microservices|state management|redux|streamlit|android|ios|flutter)\b/i.test(skill)) return "frameworks_apis";
  if (/\b(?:power bi|tableau|looker|qlik|excel|pandas|numpy|scipy|matplotlib|seaborn|plotly|statistics|a\/b testing|analytics|business intelligence|data visualization|forecasting)\b/i.test(skill)) return "analytics_bi";
  if (/\b(?:testing|test coverage|unit tests?|integration tests?|pytest|junit|jest|cypress|selenium|playwright|postman|observability|monitoring|logging|prometheus|grafana|datadog|splunk|golden datasets?|rubric-based review|latency tracking|cost monitoring)\b/i.test(skill)) return "testing_observability";
  if (/\b(?:agile|scrum|kanban|sdlc|jira|confluence|acceptance criteria|requirements analysis|project management|stakeholder management)\b/i.test(skill)) return "delivery_methods";
  const source = sourceCategory.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (/ai|machine|deep_learning|data_science|gen|nlp|statistical/.test(source)) return "ai_ml";
  if (/data_engineering|etl|big_data/.test(source)) return "data_engineering";
  if (/cloud|devops|mlops/.test(source)) return "cloud_devops";
  if (/database|storage/.test(source)) return "databases";
  if (/framework|web|mobile|api/.test(source)) return "frameworks_apis";
  if (/visual|analytics|bi/.test(source)) return "analytics_bi";
  if (/test|observ/.test(source)) return "testing_observability";
  if (/project|method|soft/.test(source)) return "delivery_methods";
  return "tools_platforms";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function fillCompanyPlaceholders(text: string, companyName: string): string {
  // The LLM occasionally echoes template placeholders like "{company}" from
  // the question list verbatim. Interpolate the real company name so the
  // placeholder never leaks into stored, user-visible question labels.
  if (!text || !companyName) return text;
  return text
    .replace(/\{+\s*company(?:[_\s]?name)?\s*\}+/gi, companyName)
    .replace(/\[\s*company(?:[_\s]?name)?\s*\]/gi, companyName);
}

function safeApplicationAnswers(value: unknown, workAuthorization: string, companyName: string): Array<{ question: string; answer: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const answer = asRecord(item);
    const question = fillCompanyPlaceholders(asString(answer.question), companyName);
    if (!question) return [];
    if (/work authorization|when can you start|start date/i.test(question)) {
      return [{
        question,
        answer: workAuthorization
          ? `My saved work-authorization status is ${workAuthorization}. I can confirm documentation and an accurate start date directly with the recruiter.`
          : "I can confirm my work-authorization status, documentation, and accurate start date directly with the recruiter. I do not want to infer or overstate those details in an automated answer.",
      }];
    }
    return [{ question, answer: fillCompanyPlaceholders(asString(answer.answer), companyName) }];
  }).filter(({ answer }) => answer.length > 0);
}

async function loadWorkAuthorization(svc: ReturnType<typeof serviceClient>, userId: string): Promise<string> {
  const { data: profile } = await svc.from("profiles")
    .select("work_authorization,job_preferences")
    .eq("user_id", userId)
    .maybeSingle();
  const stored = asRecord(asRecord(asRecord(profile?.job_preferences).applypass).profile);
  return asString(profile?.work_authorization) || asString(stored.workAuthorization);
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

function constrainSkills(output: unknown, source: unknown, jobDescription: string): Record<string, string[]> {
  const sourceSkills = normalizeSkills(source);
  const outputSkills = normalizeSkills(output);
  const result: Record<string, string[]> = {};
  const description = jobDescription.toLowerCase();
  const categoryCaps: Record<string, number> = {
    programming_languages: 8,
    ai_ml: 12,
    data_engineering: 6,
    cloud_devops: 6,
    databases: 5,
    frameworks_apis: 6,
    analytics_bi: 5,
    testing_observability: 5,
    delivery_methods: 3,
    tools_platforms: 3,
  };
  let remaining = 40;

  for (const [category, sourceValues] of Object.entries(sourceSkills)) {
    const byKey = new Map(sourceValues.map((value) => [value.toLowerCase(), value]));
    const ordered = (outputSkills[category] ?? [])
      .map((value) => byKey.get(value.toLowerCase()))
      .filter((value): value is string => Boolean(value));
    const seen = new Set(ordered.map((value) => value.toLowerCase()));
    const candidates = [
      ...ordered,
      ...sourceValues.filter((value) => !seen.has(value.toLowerCase())),
    ].map((value, index) => ({
      value,
      index,
      mentioned: description.includes(value.toLowerCase()),
    })).sort((a, b) => Number(b.mentioned) - Number(a.mentioned) || a.index - b.index);
    const limit = Math.min(categoryCaps[category] ?? 4, remaining);
    const selected = candidates.slice(0, limit).map(({ value }) => value);
    if (selected.length > 0) result[category] = selected;
    remaining -= selected.length;
    if (remaining <= 0) break;
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
      force?: boolean;
    };
    const user = await getAuthedUserOrService(req, body.user_id);
    if (!body.evaluation_id) throw new HttpError(400, "evaluation_id required");

    const svc = serviceClient();
    const { isPro } = await enforceAccountActive(svc, user.id);
    const workAuthorization = await loadWorkAuthorization(svc, user.id);

    const { data: ev } = await svc.from("job_evaluations")
      .select("id,user_id,scanned_job_id,keyword_matches,gaps,resume_id,eligible,hard_filters,score_version")
      .eq("id", body.evaluation_id).maybeSingle();
    if (!ev) throw new HttpError(404, "evaluation not found");
    if (ev.user_id !== user.id) throw new HttpError(403, "forbidden");
    if (ev.score_version !== "career-fit-v2") {
      throw new HttpError(409, "job must be rescored with the current career-fit gate before tailoring");
    }
    // Autopilot respects the user's saved limits. A user-initiated Apply is
    // still allowed after the UI shows the preference mismatch; personal
    // preferences must never make a public job inaccessible.
    if (!ev.eligible && !body.allow_outside_preferences) {
      throw new HttpError(412, "job is outside the saved autopilot preferences");
    }

    const { data: job } = await svc.from("scanned_jobs")
      .select("id,title,location,compensation_text,description_md,apply_url,company:scan_companies(name)")
      .eq("id", ev.scanned_job_id).maybeSingle();
    if (!job) throw new HttpError(404, "job not found");
    const companyName = (job as any).company?.name ?? "the company";

    const { data: existingDraft } = await svc.from("draft_applications")
      .select("*")
      .eq("user_id", user.id)
      .eq("evaluation_id", body.evaluation_id)
      .maybeSingle();
    // Preparing is idempotent. Returning the existing application packet keeps
    // repeat clicks from creating a new resume for every attempt.
    if (existingDraft?.tailored_resume_id && ["queued", "submitted"].includes(existingDraft.status)) {
      const answers = safeApplicationAnswers(existingDraft.answers, workAuthorization, companyName);
      if (JSON.stringify(answers) !== JSON.stringify(existingDraft.answers)) {
        await svc.from("draft_applications").update({ answers }).eq("id", existingDraft.id);
      }
      return jsonResponse({ draft: { ...existingDraft, answers }, reused: true });
    }
    if (existingDraft?.tailored_resume_id && existingDraft.status === "ready" && !body.force) {
      const answers = safeApplicationAnswers(existingDraft.answers, workAuthorization, companyName);
      if (JSON.stringify(answers) !== JSON.stringify(existingDraft.answers)) {
        await svc.from("draft_applications").update({ answers }).eq("id", existingDraft.id);
      }
      return jsonResponse({ draft: { ...existingDraft, answers }, reused: true });
    }

    // The entire critic loop below counts as ONE tailor for quota purposes:
    // a single enforceDailyCap here, one logAiUsage with summed tokens at end.
    await enforceDailyCap(svc, user.id, "tailor", isPro);

    let baseResume: any = null;
    if (ev.resume_id) {
      // evaluation.resume_id is user-writable; never load another user's resume
      // with the service role. A foreign id falls back to the caller's latest.
      const { data } = await svc.from("resumes").select("*")
        .eq("id", ev.resume_id).eq("user_id", user.id).maybeSingle();
      baseResume = data;
    }
    if (!baseResume) {
      const { data } = await svc.from("resumes").select("*").eq("user_id", user.id)
        .order("updated_at", { ascending: false }).limit(1);
      baseResume = data?.[0];
    }
    if (!baseResume) throw new HttpError(412, "no resume found for user");

    const { data: preferenceRow } = await svc.from("user_job_prefs")
      .select("tailoring_mode")
      .eq("user_id", user.id)
      .maybeSingle();
    const tailoringMode = preferenceRow?.tailoring_mode === "coverage_boost"
      ? "coverage_boost"
      : "evidence_only";

    const jdText = truncate(job.description_md, MAX_DESC);
    const baseResumeText = buildResumePrompt(baseResume);
    const tailorUserPrompt =
      `Company: ${companyName}\n` +
      `Title: ${job.title}\n` +
      `Location: ${job.location ?? "n/a"}\n` +
      `Compensation: ${job.compensation_text ?? "not disclosed"}\n\n` +
      `JD:\n${jdText}\n\n` +
      `Prior evaluation strengths: ${(ev.keyword_matches || []).join(", ")}. ` +
      `Gaps: ${(ev.gaps || []).join(", ")}.\n\n` +
      `Tailoring policy: ${tailoringMode === "coverage_boost"
        ? "coverage_boost — foreground and reorder job terms only when the source résumé already supports them; never add unsupported skills, employers, dates, or metrics."
        : "evidence_only — preserve the candidate story and use only directly supported language; do not add job terms that are not evidenced in the source résumé."}`;

    // Deterministic keyword set for the early-exit no-improvement check.
    const jdKeywords = [...(ev.keyword_matches || []), ...(ev.gaps || [])].map(String).filter(Boolean);
    // Number of critic-driven rewrites allowed AFTER the first tailor pass.
    const maxCriticIters = Math.max(0, Number(Deno.env.get("TAILOR_CRITIC_MAX_ITERS") ?? "2") || 0);

    const sourceExperience = Array.isArray(baseResume.experience) ? baseResume.experience : [];
    const sourceProjects = Array.isArray(baseResume.projects) ? baseResume.projects : [];

    let payload: TailorPayload | null = null;
    let tailoredExperience: Array<Record<string, unknown>> = [];
    let tailoredProjects: Array<Record<string, unknown>> = [];
    let tailoredSkills: Record<string, string[]> = {};
    let tokensIn = 0;
    let tokensOut = 0;
    const criticIterations: Array<Record<string, unknown>> = [];
    let userPrompt = tailorUserPrompt;
    let prevMissingCount = -1;

    // ── Tailor → sanitize → critic loop ────────────────────────────────
    // Iteration 0 is the original tailor pass. Each later iteration re-runs
    // the SAME prompt plus a critic feedback section, then the full
    // deterministic sanitizer pipeline again (identity re-pin, skill
    // intersection, answer guards) so hard honesty rules always hold.
    for (let iteration = 0; ; iteration++) {
      const result = await chatFree<TailorPayload>(
        "standard",
        [
          {
            role: "system",
            content: `${SYSTEM_PROMPT}\n\n---\n\nCandidate base résumé:\n\n${baseResumeText}`,
          },
          { role: "user", content: userPrompt },
        ],
        { maxTokens: 3500, temperature: 0.3, parseJson: true },
      );
      tokensIn += result.tokens_in;
      tokensOut += result.tokens_out;
      payload = result.text;

      // Full sanitizer pipeline on every iteration's output.
      tailoredExperience = mergeExperience(payload.tailored_resume.experience, sourceExperience);
      tailoredProjects = mergeProjects(payload.tailored_resume.projects, sourceProjects);
      tailoredSkills = constrainSkills(payload.tailored_resume.skills, baseResume.skills, job.description_md ?? "");

      if (iteration >= maxCriticIters) break;

      const tailoredSnapshot = {
        personal_info: baseResume.personal_info,
        summary: payload.tailored_resume.summary,
        experience: tailoredExperience,
        education: baseResume.education || [],
        skills: tailoredSkills,
        projects: tailoredProjects,
      };

      let critic;
      try {
        const c = await runTailorCritic({
          baseResumeText,
          tailoredResumeText: resumeToPlainText(tailoredSnapshot),
          jobDescription: jdText,
          company: companyName,
          title: job.title,
          missingKeywords: Array.isArray(ev.gaps) ? ev.gaps.map(String) : [],
        });
        critic = c.result;
        tokensIn += c.tokens_in;
        tokensOut += c.tokens_out;
      } catch {
        // Critic failure must never block a tailor that already succeeded —
        // proceed to storage with the current sanitized draft.
        break;
      }

      criticIterations.push({
        iteration,
        pass: critic.pass,
        top_rejection_reasons: critic.top_rejection_reasons,
        fixes: critic.fixes,
      });
      if (critic.pass) break;

      // Early exit: if deterministic ATS missing-keyword coverage did not
      // improve versus the previous iteration, more rewrites are unlikely to
      // help — stop spending tokens.
      if (jdKeywords.length > 0) {
        const missingCount = scoreResumeDeterministic(tailoredSnapshot, jdKeywords).missing_keywords.length;
        if (prevMissingCount >= 0 && missingCount >= prevMissingCount) break;
        prevMissingCount = missingCount;
      }

      userPrompt = `${tailorUserPrompt}\n\n${criticFeedbackToPrompt(critic.fixes, critic.ats_review.weak_keywords)}`;
    }

    if (!payload) throw new HttpError(500, "tailor produced no output");

    const childTitle = `${companyName} — ${job.title} · application resume`.slice(0, 120);
    const sourcePersonalInfo = asRecord(baseResume.personal_info);
    const sourceExtras = asRecord(sourcePersonalInfo._v2_extras);
    const childPayload = {
      user_id: user.id,
      title: childTitle,
      personal_info: {
        ...sourcePersonalInfo,
        title: job.title,
        _v2_extras: {
          ...sourceExtras,
          document_role: "application_snapshot",
          source_resume_id: baseResume.id,
          evaluation_id: body.evaluation_id,
          scanned_job_id: job.id,
          job_title: job.title,
          company: companyName,
        },
      },
      summary: payload.tailored_resume.summary,
      experience: tailoredExperience,
      education: baseResume.education || [],
      skills: tailoredSkills,
      projects: tailoredProjects,
      certifications: baseResume.certifications || [],
      languages: baseResume.languages || [],
      template: baseResume.template || "default",
      section_order: baseResume.section_order || null,
    };
    const childResult = existingDraft?.tailored_resume_id
      ? await svc.from("resumes").update(childPayload).eq("id", existingDraft.tailored_resume_id).eq("user_id", user.id).select("id").single()
      : await svc.from("resumes").insert(childPayload).select("id").single();
    const { data: child, error: childErr } = childResult;
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
      answers: [
        ...safeApplicationAnswers(payload.answers, workAuthorization, companyName),
        { question: "Cover note", answer: payload.cover_note },
      ],
      critic_iterations: criticIterations,
      status: "ready",
    }, { onConflict: "user_id,evaluation_id" }).select().single();
    if (draftErr) throw new HttpError(500, `save draft: ${draftErr.message}`);

    await logAiUsage(svc, user.id, "tailor", tokensIn, tokensOut);
    return jsonResponse({ draft });
  });
});
