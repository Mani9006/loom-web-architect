/* eslint-disable no-control-regex -- imported documents can contain control glyphs */
import type { SkillsObject } from "@/types/resume";

/**
 * One compact, ATS-readable taxonomy used by parsing, editing, previews and
 * every export. Imported resumes often repeat the same tool under several
 * headings (for example Tools, DevOps and Cloud); this module makes each
 * skill appear exactly once without inventing skills that were not present.
 */
export const CANONICAL_SKILL_CATEGORIES = [
  { key: "programming_languages", label: "Programming Languages" },
  { key: "ai_ml", label: "AI & Machine Learning" },
  { key: "data_engineering", label: "Data Engineering" },
  { key: "cloud_devops", label: "Cloud & DevOps" },
  { key: "databases", label: "Databases & Search" },
  { key: "frameworks_apis", label: "Frameworks & APIs" },
  { key: "analytics_bi", label: "Analytics & BI" },
  { key: "testing_observability", label: "Testing & Observability" },
  { key: "delivery_methods", label: "Delivery & Methods" },
  { key: "tools_platforms", label: "Tools & Platforms" },
] as const;

export type CanonicalSkillCategory = typeof CANONICAL_SKILL_CATEGORIES[number]["key"];

const LABELS = Object.fromEntries(CANONICAL_SKILL_CATEGORIES.map(({ key, label }) => [key, label]));

const CATEGORY_ALIASES: Record<string, CanonicalSkillCategory> = {
  programming: "programming_languages",
  programming_languages: "programming_languages",
  coding_languages: "programming_languages",
  scripting_languages: "programming_languages",
  languages: "programming_languages",
  ai: "ai_ml",
  ai_ml: "ai_ml",
  artificial_intelligence: "ai_ml",
  machine_learning: "ai_ml",
  ml_frameworks: "ai_ml",
  ml_tools: "ai_ml",
  deep_learning: "ai_ml",
  data_science: "ai_ml",
  generative_ai: "ai_ml",
  gen_ai: "ai_ml",
  genai: "ai_ml",
  nlp: "ai_ml",
  nlp_tools: "ai_ml",
  nlp_technologies: "ai_ml",
  statistical_modeling: "ai_ml",
  data_engineering: "data_engineering",
  data_engineering_etl: "data_engineering",
  big_data: "data_engineering",
  etl: "data_engineering",
  cloud: "cloud_devops",
  cloud_platforms: "cloud_devops",
  cloud_mlops: "cloud_devops",
  cloud_devops: "cloud_devops",
  devops: "cloud_devops",
  mlops: "cloud_devops",
  databases: "databases",
  database: "databases",
  data_storage: "databases",
  frameworks: "frameworks_apis",
  frameworks_apis: "frameworks_apis",
  web_development: "frameworks_apis",
  mobile_development: "frameworks_apis",
  visualization: "analytics_bi",
  data_visualization: "analytics_bi",
  analytics: "analytics_bi",
  analytics_bi: "analytics_bi",
  testing: "testing_observability",
  observability: "testing_observability",
  testing_observability: "testing_observability",
  project_management: "delivery_methods",
  soft_skills: "delivery_methods",
  methods: "delivery_methods",
  delivery_methods: "delivery_methods",
  collaboration_tools: "tools_platforms",
  tools: "tools_platforms",
  tools_platforms: "tools_platforms",
  operating_systems: "tools_platforms",
};

const DISPLAY_ALIASES: Record<string, string> = {
  aws: "AWS",
  "amazon web services": "AWS",
  gcp: "GCP",
  "google cloud platform": "GCP",
  azure: "Microsoft Azure",
  "microsoft azure": "Microsoft Azure",
  genai: "Generative AI",
  "gen ai": "Generative AI",
  llm: "LLMs",
  llms: "LLMs",
  rag: "RAG",
  nlp: "NLP",
  mlops: "MLOps",
  "ml ops": "MLOps",
  cicd: "CI/CD",
  "ci cd": "CI/CD",
  "ci/cd": "CI/CD",
  sql: "SQL",
  nosql: "NoSQL",
  api: "APIs",
  apis: "APIs",
  rest: "REST APIs",
  "rest api": "REST APIs",
  "rest apis": "REST APIs",
  graphql: "GraphQL",
  grpc: "gRPC",
  javascript: "JavaScript",
  typescript: "TypeScript",
  nodejs: "Node.js",
  "node js": "Node.js",
  "node.js": "Node.js",
  reactjs: "React",
  "react.js": "React",
  postgres: "PostgreSQL",
  postgresql: "PostgreSQL",
  mongodb: "MongoDB",
  "scikit learn": "scikit-learn",
  sklearn: "scikit-learn",
  pytorch: "PyTorch",
  tensorflow: "TensorFlow",
  kubernetes: "Kubernetes",
  docker: "Docker",
  terraform: "Terraform",
  git: "Git",
  github: "GitHub",
  gitlab: "GitLab",
  fastapi: "FastAPI",
  langchain: "LangChain",
  langgraph: "LangGraph",
  mlflow: "MLflow",
  airflow: "Apache Airflow",
  "apache airflow": "Apache Airflow",
  spark: "Apache Spark",
  "apache spark": "Apache Spark",
  kafka: "Apache Kafka",
  "apache kafka": "Apache Kafka",
  dbt: "dbt",
  numpy: "NumPy",
  pandas: "pandas",
  pytest: "pytest",
  powerbi: "Power BI",
  "power bi": "Power BI",
};

const NON_SKILLS = new Set([
  "skills",
  "technical skills",
  "core skills",
  "technologies",
  "tools",
  "soft skills",
  "project management",
  "deployment readiness reviews",
  "code review participation",
  "cross functional collaboration",
  "cross-functional collaboration",
  "communication",
  "problem solving",
  "leadership",
  "teamwork",
]);

const PROGRAMMING = /^(?:python|r|java|javascript|typescript|c|c\+\+|c#|go|golang|rust|scala|kotlin|swift|ruby|php|matlab|bash|shell|powershell|vba|sql|html|css)$/i;
const AI_ML = /\b(?:ai|artificial intelligence|machine learning|deep learning|generative ai|llm|large language model|rag|retrieval augmented|nlp|natural language processing|computer vision|pytorch|tensorflow|keras|scikit|sklearn|xgboost|lightgbm|transformers?|bert|spacy|hugging face|langchain|langgraph|llamaindex|openai|anthropic|gemini|bedrock|sagemaker|vertex ai|embeddings?|vector search|prompt engineering|fine[- ]?tuning|reinforcement learning|(?:model )?guardrails?|feature engineering|mlflow)\b/i;
const DATA_ENGINEERING = /\b(?:etl|elt|data engineering|data pipeline|data lake|lakehouse|data warehouse|airflow|dagster|prefect|spark|hadoop|kafka|flink|beam|dbt|databricks|snowflake|redshift|bigquery|synapse|informatica|talend|workflow orchestration|stream processing)\b/i;
const CLOUD_DEVOPS = /\b(?:aws|amazon web services|azure|gcp|google cloud|cloud computing|docker|kubernetes|helm|terraform|ansible|jenkins|github actions|gitlab ci|circleci|ci\/cd|devops|mlops|serverless|lambda|cloudformation|ecs|eks|aks|gke|openshift|containerization)\b/i;
const DATABASES = /\b(?:postgres|postgresql|mysql|mariadb|oracle|sql server|sqlite|mongodb|dynamodb|cassandra|redis|neo4j|elasticsearch|opensearch|solr|pinecone|weaviate|milvus|chroma|qdrant|database|nosql|vector database)\b/i;
const FRAMEWORKS = /\b(?:react|angular|vue|svelte|next\.?js|node\.?js|express|nestjs|spring|spring boot|fastapi|flask|django|\.net|asp\.net|rails|laravel|graphql|grpc|rest(?:ful)? apis?|microservices|api design|state management|redux|kafka streams|streamlit|gradio|android|ios|flutter|react native)\b/i;
const ANALYTICS = /\b(?:power bi|tableau|looker|qlik|excel|pandas|numpy|scipy|matplotlib|seaborn|plotly|statistics|statistical analysis|a\/b testing|experimentation|analytics|business intelligence|data visualization|forecasting|time series)\b/i;
const TESTING = /\b(?:testing|test coverage|unit tests?|integration tests?|end[- ]to[- ]end|pytest|junit|jest|mocha|cypress|selenium|playwright|postman|observability|monitoring|logging|prometheus|grafana|datadog|splunk|new relic|open telemetry|opentelemetry)\b/i;
const DELIVERY = /\b(?:agile|scrum|kanban|sdlc|jira|confluence|acceptance criteria|requirements analysis|product management|project management|stakeholder management)\b/i;
const TOOLS = /\b(?:git|github|gitlab|bitbucket|linux|unix|windows|visual studio|vs code|intellij|eclipse|maven|gradle|npm|yarn|pnpm|jupyter|notebook|huggingface|sap|salesforce)\b/i;

function snake(value: string): string {
  return value.trim().toLowerCase().replace(/[&+]/g, " and ").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function splitSkills(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .split(/[,;|\n\r•·]+/)
    .map((part) => part.replace(/^[\s\-–—:]+|[\s\-–—:.]+$/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function normalizedDisplay(value: string): string {
  const lower = value.toLowerCase().replace(/[._-]+/g, " ").replace(/\s+/g, " ").trim();
  return DISPLAY_ALIASES[lower] ?? value;
}

function identity(value: string): string {
  return normalizedDisplay(value).toLowerCase().replace(/[^a-z0-9+#./]+/g, "");
}

function isConcreteSkill(value: string): boolean {
  const lower = value.toLowerCase();
  const words = lower.split(/\s+/).filter(Boolean);
  if (!/[a-z0-9+#]/i.test(value) || value.length > 64 || words.length > 7) return false;
  if (NON_SKILLS.has(lower)) return false;
  if (/^(?:responsible for|worked on|experience with|proficient in|knowledge of)\b/i.test(value)) return false;
  if (words.length > 3 && /\b(?:built|developed|designed|implemented|managed|led|delivered|collaborated|reviewed|ensured|improved|created)\b/i.test(value)) return false;
  return true;
}

function categoryFromSource(rawCategory: string): CanonicalSkillCategory {
  const key = snake(rawCategory);
  return CATEGORY_ALIASES[key] ?? "tools_platforms";
}

export function classifyResumeSkill(skill: string, sourceCategory = ""): CanonicalSkillCategory {
  if (PROGRAMMING.test(skill)) return "programming_languages";
  if (AI_ML.test(skill)) return "ai_ml";
  if (DATA_ENGINEERING.test(skill)) return "data_engineering";
  if (CLOUD_DEVOPS.test(skill)) return "cloud_devops";
  if (DATABASES.test(skill)) return "databases";
  if (FRAMEWORKS.test(skill)) return "frameworks_apis";
  if (ANALYTICS.test(skill)) return "analytics_bi";
  if (TESTING.test(skill)) return "testing_observability";
  if (DELIVERY.test(skill)) return "delivery_methods";
  if (TOOLS.test(skill)) return "tools_platforms";
  return categoryFromSource(sourceCategory);
}

export function normalizeResumeSkills(raw: unknown): SkillsObject {
  const buckets = Object.fromEntries(CANONICAL_SKILL_CATEGORIES.map(({ key }) => [key, [] as string[]])) as Record<CanonicalSkillCategory, string[]>;
  const seen = new Set<string>();
  const entries: Array<[string, unknown[]]> = Array.isArray(raw)
    ? [["tools_platforms", raw]]
    : raw && typeof raw === "object"
      ? Object.entries(raw as Record<string, unknown>).map(([category, values]) => [category, Array.isArray(values) ? values : [values]])
      : [];

  for (const [sourceCategory, values] of entries) {
    for (const rawValue of values) {
      for (const part of splitSkills(rawValue)) {
        const display = normalizedDisplay(part);
        const key = identity(display);
        if (!isConcreteSkill(display) || !key || seen.has(key)) continue;
        buckets[classifyResumeSkill(display, sourceCategory)].push(display);
        seen.add(key);
      }
    }
  }

  return Object.fromEntries(
    CANONICAL_SKILL_CATEGORIES.flatMap(({ key }) => buckets[key].length ? [[key, buckets[key]] as const] : []),
  );
}

export function mergeResumeSkills(existing: unknown, incoming: unknown): SkillsObject {
  const combined: Record<string, unknown[]> = {};
  for (const source of [existing, incoming]) {
    if (!source || typeof source !== "object" || Array.isArray(source)) continue;
    for (const [category, values] of Object.entries(source as Record<string, unknown>)) {
      if (!combined[category]) combined[category] = [];
      combined[category].push(...(Array.isArray(values) ? values : [values]));
    }
  }
  return normalizeResumeSkills(combined);
}

export function getCanonicalSkillCategoryLabel(key: string): string | null {
  return LABELS[key] ?? null;
}

export function normalizeResumeForOutput<T extends { skills?: unknown }>(resume: T): T {
  return { ...resume, skills: normalizeResumeSkills(resume.skills) };
}
