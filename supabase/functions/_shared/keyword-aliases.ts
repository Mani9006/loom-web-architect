/**
 * keyword-aliases — deterministic JD-keyword → resume-evidence mapping for
 * HONEST tailoring.
 *
 * A JD keyword may be foregrounded in a tailored resume ONLY when the base
 * resume already demonstrates it, either literally or through a curated
 * alias (e.g. "Machine Learning" ↔ "ML", "Data visualization" ↔
 * "dashboards/Tableau", "SQL" ↔ "PostgreSQL" when the exact tech is shown).
 *
 * This module is the single source of truth for that admissibility decision,
 * so neither the LLM prompt nor the deterministic post-processing (skills
 * rebuild, summary coverage sentence) can ever insert an UNSUPPORTED keyword.
 * Everything here is pure and unit-tested.
 */

import { computeKeywordScore, normalizeForMatch, resumeToPlainText } from "./ats-deterministic.ts";

/**
 * Canonical evidence map. Key: normalized JD keyword. Value: evidence groups.
 * A group is a list of evidence phrases; the group passes when EVERY phrase
 * is present in the base resume (phrase = padded exact match OR full token
 * coverage). The keyword is evidenced when ANY group passes.
 *
 * Rules for contributors:
 *   - Aliases must be strict synonyms / expansions / exact-tech equivalents.
 *   - Never map a keyword to a merely "related" skill (no Kubernetes ↔ Docker
 *     style leaps unless the alias is the same technology).
 */
const KEYWORD_EVIDENCE: Record<string, string[][]> = {
  // ── data science / ML vocabulary ─────────────────────────────
  "machine learning": [["machine learning"], ["ml"], ["xgboost"], ["random forest"], ["logistic regression"], ["lightgbm"], ["scikit"], ["pytorch"], ["tensorflow"]],
  "ml": [["ml"], ["machine learning"]],
  "data science": [["data science"], ["data scientist"]],
  "deep learning": [["deep learning"], ["lstm"], ["neural network"], ["pytorch"], ["tensorflow"], ["keras"]],
  "natural language processing": [["natural language processing"], ["nlp"]],
  "nlp": [["nlp"], ["natural language processing"]],
  "large language models": [["large language models"], ["llm"], ["llms"], ["gpt"], ["langchain"]],
  "llm": [["llm"], ["large language model"], ["langchain"], ["openai"]],
  "llms": [["llms"], ["llm"], ["large language models"]],
  "generative ai": [["generative ai"], ["genai"], ["gen ai"], ["llm"], ["rag"], ["langchain"], ["openai"], ["gpt"]],
  "genai": [["genai"], ["generative ai"], ["gen ai"]],
  "rag": [["rag"], ["retrieval augmented generation"], ["rag pipelines"], ["rag pipeline"]],
  "prompt engineering": [["prompt engineering"], ["prompting"], ["prompt design"]],
  "a/b testing": [["a/b testing"], ["ab testing"], ["a/b"], ["multivariate testing"], ["experimentation"]],
  "experimentation": [["experimentation"], ["a/b testing"], ["ab testing"], ["multivariate testing"], ["experiments"]],
  "experimentation design": [["experimentation design"], ["experimental design"], ["designed experiments"], ["a/b testing"], ["ab testing"], ["multivariate testing"], ["hypothesis testing"]],
  "experimental design": [["experimental design"], ["experimentation design"], ["designed experiments"], ["a/b testing"], ["ab testing"], ["multivariate testing"], ["hypothesis testing"]],
  "causal inference": [["causal inference"], ["causal impact"], ["causal analysis"]],
  "statistical modeling": [["statistical modeling"], ["statistical modelling"], ["statistical analysis"], ["statistical methods"], ["classical statistics"], ["regression"]],
  "quantitative analysis": [["quantitative analysis"], ["quantitative analytics"], ["statistical analysis"], ["statistical modeling"], ["statistical modelling"], ["statistical models"], ["regression analysis"], ["regression analyses"], ["predictive analytics"], ["forecasting analysis"], ["forecasting"]],
  "predictive modeling": [["predictive modeling"], ["predictive models"], ["predictive analytics"], ["forecasting models"]],
  "forecasting": [["forecasting"], ["forecast"], ["time series"], ["arima"], ["prophet"]],
  "time series": [["time series"], ["arima"], ["prophet"], ["temporal"]],
  "anomaly detection": [["anomaly detection"], ["anomalies"], ["outlier detection"], ["fraud detection"]],
  "segmentation": [["segmentation"], ["clustering"], ["k means"], ["k-means"], ["cohorts"]],
  "recommendation systems": [["recommendation systems"], ["recommendation"], ["recommender"], ["personalization"]],
  "instrumentation": [["instrumentation"], ["telemetry"], ["event tracking"], ["analytics tracking"], ["metrics collection"], ["model monitoring"], ["observability"]],
  // ── analytics / BI vocabulary ────────────────────────────────
  "data visualization": [["data visualization"], ["visualization"], ["dashboard"], ["dashboards"], ["tableau"], ["power bi"], ["plotly"], ["matplotlib"], ["seaborn"], ["looker"]],
  "dashboards": [["dashboards"], ["dashboard"], ["tableau"], ["power bi"], ["looker"]],
  "tableau": [["tableau"]],
  "power bi": [["power bi"], ["powerbi"]],
  "data wrangling": [["data wrangling"], ["wrangling"], ["data cleansing"], ["cleansing"], ["data cleaning"], ["cleaning"], ["data preparation"]],
  "data cleaning": [["data cleaning"], ["data cleansing"], ["cleansing"], ["data wrangling"]],
  "data modeling": [["data modeling"], ["data modelling"], ["schema design"], ["dimensional modeling"]],
  "data quality": [["data quality"], ["data cleansing"], ["data validation"], ["data governance"]],
  "data governance": [["data governance"], ["governance"], ["data governance frameworks"]],
  "data warehousing": [["data warehousing"], ["warehousing"], ["data warehouse"], ["snowflake"], ["bigquery"], ["redshift"], ["synapse"]],
  "data warehouse": [["data warehouse"], ["data warehousing"], ["snowflake"], ["bigquery"], ["redshift"], ["synapse"]],
  "data warehouse cloud": [["cloud data warehouse"], ["data warehouse cloud"], ["snowflake"], ["bigquery"], ["redshift"]],
  "cloud data warehouse": [["cloud data warehouse"], ["snowflake"], ["bigquery"], ["redshift"]],
  "etl": [["etl"], ["elt"], ["data pipelines"], ["data pipeline"], ["pipelines"]],
  "etl pipelines": [["etl pipelines"], ["etl"], ["elt"], ["data pipelines"], ["pipeline"]],
  "data pipelines": [["data pipelines"], ["data pipeline"], ["pipeline"], ["pipelines"], ["etl"]],
  "data engineering": [["data engineering"], ["data pipelines"], ["etl"], ["elt"], ["airflow"], ["dbt"]],
  "distributed data systems": [["distributed data systems"], ["distributed systems"], ["distributed processing"], ["distributed computing"], ["pyspark"], ["spark"], ["hadoop"], ["hdfs"], ["hive"]],
  "distributed systems": [["distributed systems"], ["distributed processing"], ["distributed computing"], ["pyspark"], ["spark"], ["hadoop"]],
  "big data": [["big data"], ["large scale datasets"], ["large datasets"], ["hadoop"], ["spark"], ["pyspark"], ["hive"], ["hdfs"]],
  // ── databases / languages ────────────────────────────────────
  "sql": [["sql"], ["postgresql"], ["postgres"], ["mysql"], ["sql server"], ["sqlite"], ["hive"]],
  "advanced sql": [["advanced", "sql"], ["sql", "large"], ["sql", "complex"], ["sql", "postgresql"], ["sql", "sql server"], ["sql", "pyspark"], ["sql", "pandas"]],
  "complex queries": [["complex queries"], ["queries"], ["complex", "sql"], ["sql", "large"], ["sql", "pandas"], ["sql", "pyspark"]],
  "nosql": [["nosql"], ["mongodb"], ["dynamodb"], ["cassandra"], ["documentdb"]],
  "postgresql": [["postgresql"], ["postgres"]],
  "postgres": [["postgres"], ["postgresql"]],
  "mysql": [["mysql"]],
  "python": [["python"], ["pandas"], ["numpy"], ["pyspark"]],
  "pandas": [["pandas"]],
  "r": [["r"]],
  "pyspark": [["pyspark"], ["spark"]],
  "spark": [["spark"], ["pyspark"]],
  "scala": [["scala"]],
  // ── cloud / devops ───────────────────────────────────────────
  "aws": [["aws"], ["amazon web services"]],
  "amazon web services": [["amazon web services"], ["aws"]],
  "gcp": [["gcp"], ["google cloud"]],
  "google cloud": [["google cloud"], ["gcp"]],
  "azure": [["azure"]],
  "kubernetes": [["kubernetes"], ["k8s"], ["aks"], ["gke"], ["eks"]],
  "k8s": [["k8s"], ["kubernetes"]],
  "docker": [["docker"], ["containers"], ["containerized"]],
  "ci/cd": [["ci/cd"], ["ci cd"], ["cicd"], ["continuous integration"], ["github actions"], ["jenkins"], ["gitlab ci"]],
  "mlops": [["mlops"], ["ml ops"], ["mlflow"], ["model deployment"], ["model monitoring"]],
  "terraform": [["terraform"]],
  "airflow": [["airflow"]],
  "dbt": [["dbt"]],
  "snowflake": [["snowflake"]],
  "databricks": [["databricks"]],
  "kafka": [["kafka"]],
  "api": [["api"], ["apis"], ["rest"], ["restful"], ["fastapi"], ["graphql"]],
  "rest apis": [["rest apis"], ["rest api"], ["restful"], ["rest"], ["apis"], ["fastapi"]],
  "microservices": [["microservices"], ["micro services"]],
  // ── ways of working ──────────────────────────────────────────
  "cross-functional collaboration": [["cross functional collaboration"], ["cross-functional"], ["collaborated"], ["cross functional teams"], ["stakeholders"]],
  "stakeholder management": [["stakeholder management"], ["stakeholders"], ["non technical audiences"]],
  "agile": [["agile"], ["scrum"], ["kanban"]],
  "mentoring": [["mentoring"], ["mentored"], ["coached"], ["coaching"]],
};

/** Keywords we must never treat as evidenced by generic tech overlap. */
const NEVER_ALIAS = new Set<string>();

/**
 * Phrase-y keywords that read badly as a standalone skill ("Complex Queries").
 * They stay eligible for summary/bullet coverage but are never admitted into
 * the skills section as a displayed skill.
 */
const SKILL_ADMIT_BLOCK = new Set<string>(["complex queries"]);

/**
 * Display phrasing used when an evidenced-but-missing keyword is woven into
 * the summary. Defaults to the keyword itself; entries here read naturally.
 */
const SUMMARY_PHRASES: Record<string, string> = {
  "advanced sql": "advanced SQL",
  "complex queries": "complex SQL queries",
  "data wrangling": "data wrangling",
  "data visualization": "data visualization",
  "data warehousing": "data warehousing",
  "data warehouse cloud": "cloud data warehouse platforms",
  "cloud data warehouse": "cloud data warehouse platforms",
  "machine learning": "machine learning",
  "data science": "data science",
  "distributed data systems": "distributed data systems",
  "experimentation": "experimentation",
  "experimentation design": "experimentation design",
  "experimental design": "experimental design",
  "a/b testing": "A/B testing",
  "quantitative analysis": "quantitative analysis",
  "instrumentation": "instrumentation",
};

// ── low-level matching ─────────────────────────────────────────

interface TextIndex {
  padded: string;
  tokens: Set<string>;
}

function indexText(text: string): TextIndex {
  const normalized = normalizeForMatch(text);
  return {
    padded: ` ${normalized} `,
    tokens: new Set(normalized.split(" ").filter(Boolean)),
  };
}

const STOP = new Set(["and", "the", "for", "with", "from", "into", "using", "such", "including", "a", "an", "of", "to", "in", "on"]);

/** A phrase is present when it matches padded-exactly or all of its tokens are present. */
function phrasePresent(index: TextIndex, phrase: string): boolean {
  const needle = normalizeForMatch(phrase);
  if (!needle) return false;
  if (index.padded.includes(` ${needle} `)) return true;
  const parts = needle.split(" ").filter((t) => t.length > 1 && !STOP.has(t));
  if (parts.length === 0) return false;
  return parts.every((t) => index.tokens.has(t));
}

function evidenceGroupPresent(index: TextIndex, group: string[]): boolean {
  return group.every((phrase) => phrasePresent(index, phrase));
}

// ── public API ─────────────────────────────────────────────────

/**
 * True when the JD keyword is honestly evidenced by the base resume — either
 * literally present, or through a curated alias group. Unknown keywords fall
 * back to literal matching only (conservative: no alias, no admittance).
 */
export function isKeywordEvidenced(jdKeyword: string, baseResumeText: string): boolean {
  const index = indexText(baseResumeText);
  return isKeywordEvidencedInIndex(jdKeyword, index);
}

function isKeywordEvidencedInIndex(jdKeyword: string, index: TextIndex): boolean {
  const key = normalizeForMatch(jdKeyword);
  if (!key || NEVER_ALIAS.has(key)) return false;
  if (phrasePresent(index, key)) return true;
  const groups = KEYWORD_EVIDENCE[key];
  if (!groups) return false;
  return groups.some((group) => evidenceGroupPresent(index, group));
}

export interface KeywordEvidenceSplit {
  /** JD keywords the base resume can honestly support (literal or alias). */
  evidenced: string[];
  /** JD keywords with no honest evidence — must NOT be inserted anywhere. */
  unevidenced: string[];
}

/** Split JD keywords into evidenced / unevidenced against the BASE resume. */
export function splitKeywordsByEvidence(jdKeywords: string[], baseResumeText: string): KeywordEvidenceSplit {
  const index = indexText(baseResumeText);
  const evidenced: string[] = [];
  const unevidenced: string[] = [];
  for (const k of jdKeywords) {
    if (!String(k ?? "").trim()) continue;
    (isKeywordEvidencedInIndex(k, index) ? evidenced : unevidenced).push(k);
  }
  return { evidenced, unevidenced };
}

/**
 * A skill is JD-relevant when it literally matches a JD keyword, appears in
 * the raw JD text, or serves as evidence for an evidenced keyword (so the
 * skills section can foreground what the job actually asks about).
 */
export function isSkillJdRelevant(skill: string, jdKeywords: string[], jdText: string): boolean {
  const skillKey = normalizeForMatch(skill);
  if (!skillKey) return false;
  const jdIndex = indexText(jdText);
  if (phrasePresent(jdIndex, skillKey)) return true;
  for (const keyword of jdKeywords) {
    if (normalizeForMatch(keyword) === skillKey) return true;
    const groups = KEYWORD_EVIDENCE[normalizeForMatch(keyword)] ?? [];
    for (const group of groups) {
      if (group.some((phrase) => normalizeForMatch(phrase) === skillKey)) return true;
    }
  }
  return false;
}

/** Classify an admitted keyword into a skills category (mirrors the tailor's taxonomy). */
export function classifyAdmittedKeyword(keyword: string): string {
  const k = normalizeForMatch(keyword);
  if (/\b(?:sql|python|r|pyspark|scala|java|javascript|typescript|go|bash)\b/.test(k)) return "programming_languages";
  if (/\b(?:machine learning|ml|ai|llm|rag|nlp|deep learning|generative ai|genai|causal inference|anomaly detection|forecasting|time series|segmentation|recommendation|predictive|statistical|experiment|a b testing|prompt engineering|data science)\b/.test(k)) return "ai_ml";
  if (/\b(?:etl|pipeline|data engineering|airflow|dbt|kafka|spark|pyspark|hadoop|hive|distributed|big data|warehouse|warehousing|databricks)\b/.test(k)) return "data_engineering";
  if (/\b(?:aws|azure|gcp|google cloud|kubernetes|k8s|docker|terraform|ci cd|mlops|cloud)\b/.test(k)) return "cloud_devops";
  if (/\b(?:postgres|mysql|mongodb|nosql|sql server|database|redis|snowflake|bigquery|redshift)\b/.test(k)) return "databases";
  if (/\b(?:visualization|dashboard|tableau|power bi|looker|wrangling|cleaning|analytics|data quality|data modeling|data governance)\b/.test(k)) return "analytics_bi";
  if (/\b(?:agile|scrum|stakeholder|cross functional|mentor)\b/.test(k)) return "delivery_methods";
  return "tools_platforms";
}

export interface SkillsRebuildOptions {
  /** Normalized base-resume skills (category -> values). Source of truth. */
  sourceSkills: Record<string, string[]>;
  /** Optional model-proposed skills ordering; values must be source skills. */
  llmSkills?: Record<string, string[]>;
  /** The 15 ATS JD keywords (same set the scorer uses). */
  jdKeywords: string[];
  /** Plain text of the BASE resume (master) — evidence source for admittance. */
  baseResumeText: string;
  /** Raw job-description text; skills literally named in the JD rank first. */
  jdText?: string;
  /**
   * Current tailored text EXCLUDING the skills section. Admitted keywords
   * already literally present here are skipped (no duplicate insertion).
   */
  currentTailoredText?: string;
  /** Per-category cap for NON-relevant skills; relevant ones are never cut. */
  categoryCaps?: Record<string, number>;
  /** Max keywords admitted into skills that are not literal source skills. */
  maxAdmitted?: number;
}

export interface SkillsRebuildResult {
  skills: Record<string, string[]>;
  /** JD keywords admitted into the skills section via the evidence map. */
  admitted: string[];
}

const DEFAULT_CATEGORY_CAPS: Record<string, number> = {
  programming_languages: 8,
  ai_ml: 12,
  data_engineering: 8,
  cloud_devops: 8,
  databases: 6,
  frameworks_apis: 6,
  analytics_bi: 8,
  testing_observability: 5,
  delivery_methods: 4,
  tools_platforms: 4,
};

/**
 * Rebuild the skills section per job, honestly:
 *   1. Every kept skill is a real source skill (model may only reorder).
 *   2. JD-relevant skills rank first and are never dropped by category caps.
 *   3. An evidenced JD keyword that is not literally a source skill may be
 *      ADMITTED as a displayed skill — only via isKeywordEvidenced, so an
 *      unsupported keyword can never enter (tested).
 */
export function rebuildSkillsForJob(opts: SkillsRebuildOptions): SkillsRebuildResult {
  const {
    sourceSkills,
    llmSkills = {},
    jdKeywords,
    baseResumeText,
    jdText = "",
    currentTailoredText = "",
    categoryCaps = DEFAULT_CATEGORY_CAPS,
    maxAdmitted = 8,
  } = opts;

  const baseIndex = indexText(baseResumeText);
  const tailoredIndex = indexText(currentTailoredText);
  const skillsIndex = indexText(Object.values(sourceSkills).flat().join(" "));

  const result: Record<string, string[]> = {};
  const categories = [...Object.keys(sourceSkills), ...Object.keys(llmSkills).filter((c) => !(c in sourceSkills))];

  for (const category of categories) {
    const sourceValues = sourceSkills[category] ?? [];
    const byKey = new Map(sourceValues.map((v) => [v.toLowerCase(), v]));
    const ordered = (llmSkills[category] ?? [])
      .map((v) => byKey.get(String(v).toLowerCase()))
      .filter((v): v is string => Boolean(v));
    const seen = new Set(ordered.map((v) => v.toLowerCase()));
    const merged = [...ordered, ...sourceValues.filter((v) => !seen.has(v.toLowerCase()))];

    const relevant = merged.filter((v) => isSkillJdRelevant(v, jdKeywords, jdText));
    const cap = categoryCaps[category] ?? 4;
    const relevantSet = new Set(relevant.map((v) => v.toLowerCase()));
    const nonRelevant = merged.filter((v) => !relevantSet.has(v.toLowerCase()));
    const kept = [...relevant, ...nonRelevant.slice(0, Math.max(0, cap - relevant.length))];
    if (kept.length > 0) result[category] = [...new Set(kept)];
  }

  // Admit evidenced JD keywords not already covered literally anywhere.
  const admitted: string[] = [];
  for (const keyword of jdKeywords) {
    if (admitted.length >= maxAdmitted) break;
    const key = normalizeForMatch(keyword);
    if (!key) continue;
    if (phrasePresent(skillsIndex, key)) continue; // already a source skill
    if (phrasePresent(tailoredIndex, key)) continue; // already in summary/bullets
    if (SKILL_ADMIT_BLOCK.has(key)) continue; // phrase-y: summary coverage only
    if (!isKeywordEvidencedInIndex(keyword, baseIndex)) continue; // HONESTY GATE
    const category = classifyAdmittedKeyword(keyword);
    const display = displayKeyword(keyword);
    const list = result[category] ?? [];
    if (list.some((v) => v.toLowerCase() === display.toLowerCase())) continue;
    result[category] = [display, ...list];
    admitted.push(keyword);
  }

  return { skills: result, admitted };
}

/** Present an admitted keyword in resume-appropriate casing. */
function displayKeyword(keyword: string): string {
  const ACRONYMS = new Set(["sql", "ml", "ai", "nlp", "llm", "rag", "etl", "aws", "gcp", "k8s", "dbt", "api", "ci/cd", "r"]);
  return keyword
    .split(/\s+/)
    .map((word) => ACRONYMS.has(word.toLowerCase()) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/\bA\/B\b/, "A/B");
}

export interface SummaryCoverageOptions {
  jdKeywords: string[];
  baseResumeText: string;
  /** Tailored text INCLUDING the current summary (used to find true gaps). */
  tailoredText: string;
  maxKeywords?: number;
}

export interface SummaryCoverageResult {
  summary: string;
  added: string[];
}

/**
 * Append one honest "Core strengths" sentence to the summary covering the top
 * evidenced-but-missing JD keywords. Only keywords passing isKeywordEvidenced
 * against the BASE resume are eligible; anything the tailored resume already
 * covers is skipped. Never inserts numbers, entities, or unevidenced terms.
 */
export function augmentSummaryCoverage(
  summary: string,
  opts: SummaryCoverageOptions,
): SummaryCoverageResult {
  const { jdKeywords, baseResumeText, tailoredText, maxKeywords = 5 } = opts;
  const baseIndex = indexText(baseResumeText);
  const missing = computeKeywordScore(tailoredText, jdKeywords).missing;
  const toAdd = missing
    .filter((k) => isKeywordEvidencedInIndex(k, baseIndex))
    .slice(0, Math.max(0, maxKeywords));
  if (toAdd.length === 0) return { summary, added: [] };

  const phrases = toAdd.map((k) => SUMMARY_PHRASES[normalizeForMatch(k)] ?? k);
  const list = phrases.length === 1
    ? phrases[0]
    : `${phrases.slice(0, -1).join(", ")}, and ${phrases[phrases.length - 1]}`;
  const sentence = `Core strengths include ${list}.`;
  const trimmed = summary.trim();
  return { summary: trimmed ? `${trimmed} ${sentence}` : sentence, added: toAdd };
}

// ── application-snapshot lineage ───────────────────────────────

// deno-lint-ignore no-explicit-any
export function isApplicationSnapshot(resume: any): boolean {
  const extras = resume?.personal_info?._v2_extras;
  if (!extras || typeof extras !== "object") return false;
  return extras.document_role === "application_snapshot" || typeof extras.source_resume_id === "string" && extras.source_resume_id.length > 0;
}

// deno-lint-ignore no-explicit-any
export function snapshotSourceId(resume: any): string | null {
  const source = resume?.personal_info?._v2_extras?.source_resume_id;
  return typeof source === "string" && source ? source : null;
}

/** Plain-text helper matching the scorer's own extraction. */
// deno-lint-ignore no-explicit-any
export function resumePlainText(resume: any): string {
  return resumeToPlainText(resume);
}
