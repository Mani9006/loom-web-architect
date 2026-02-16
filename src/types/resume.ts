/**
 * Resume JSON Schema - Single Source of Truth
 *
 * This schema matches the exact structure required for the Professional template.
 * All UI fields read from and write to this JSON.
 * The template is rendered only from this JSON - no direct text editing.
 */

// ============ BACKWARD COMPATIBILITY TYPES ============
// These are kept for gradual migration of Chat.tsx

export interface PersonalInfo {
  fullName: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
}

export interface ProjectOption {
  id: string;
  title: string;
  bullets: string[];
  isSelected: boolean;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  location: string;
  role: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
  responsibilities: string;
  projects: ProjectOption[];
  selectedProjectIndex?: number;
}

export interface SummaryOption {
  id: string;
  content: string;
  isSelected: boolean;
}

// Legacy ResumeData type for backward compatibility
export interface ResumeData {
  templateId: string;
  personalInfo: PersonalInfo;
  summary: string;
  summaryOptions: SummaryOption[];
  totalYearsExperience: number;
  clients: Client[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  skillCategories: { category: string; skills: string[] }[];
  projects: ProjectEntry[];
  targetRole?: string;
}

// ============ NEW JSON SCHEMA ============

// Header section
export interface ResumeHeader {
  name: string;
  title: string;
  location: string;
  email: string;
  phone: string;
  linkedin: string;
}

// Experience entry
export interface ExperienceEntry {
  id: string; // For React key and unique identification
  role: string;
  company_or_client: string;
  start_date: string;
  end_date: string;
  location: string;
  bullets: string[];
}

// Education entry
export interface EducationEntry {
  id: string;
  degree: string;
  field: string;
  institution: string;
  gpa: string;
  graduation_date: string;
  location: string;
}

// Certification entry
export interface CertificationEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
  url?: string; // Optional hyperlink for the certification (e.g., verification URL)
}

// Skills - Object with dynamic categories (can be empty or have any category keys)
export interface SkillsObject {
  [key: string]: string[];
}

// Project entry
export interface ProjectEntry {
  id: string;
  title: string;
  organization: string;
  date: string;
  bullets: string[];
  url?: string; // Optional hyperlink for the project (e.g., GitHub repo, live demo)
}

// Language entry
export interface LanguageEntry {
  id: string;
  language: string;
  proficiency: string; // Native, Fluent, Professional, Conversational, Basic
}

// Volunteer entry
export interface VolunteerEntry {
  id: string;
  role: string;
  organization: string;
  date: string;
  bullets: string[];
}

// Award/Publication entry
export interface AwardEntry {
  id: string;
  title: string;
  issuer: string;
  date: string;
  url?: string; // Optional hyperlink for the award/publication
}

// Custom section entry (user-defined sections)
export interface CustomSectionEntry {
  id: string;
  title: string;
  subtitle: string;
  date: string;
  bullets: string[];
  url?: string; // Optional hyperlink for the entry title
}

// Custom section definition
export interface CustomSection {
  id: string;
  name: string; // Display name (editable by user)
  entries: CustomSectionEntry[];
}

// Main Resume JSON Schema
export interface ResumeJSON {
  header: ResumeHeader;
  summary: string;
  experience: ExperienceEntry[];
  education: EducationEntry[];
  certifications: CertificationEntry[];
  skills: SkillsObject;
  projects: ProjectEntry[];
  languages?: LanguageEntry[];
  volunteer?: VolunteerEntry[];
  awards?: AwardEntry[];
  customSections?: CustomSection[];
}

// Template configuration
export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  sections: string[];
}

// Helper to create empty resume data
export const createEmptyResumeJSON = (): ResumeJSON => ({
  header: {
    name: "",
    title: "",
    location: "",
    email: "",
    phone: "",
    linkedin: "",
  },
  summary: "",
  experience: [
    {
      id: crypto.randomUUID(),
      role: "",
      company_or_client: "",
      start_date: "",
      end_date: "",
      location: "",
      bullets: [],
    },
  ],
  education: [
    {
      id: crypto.randomUUID(),
      degree: "",
      field: "",
      institution: "",
      gpa: "",
      graduation_date: "",
      location: "",
    },
  ],
  certifications: [],
  skills: {},
  projects: [],
});

// Skill category display names for UI
export const SKILL_CATEGORY_LABELS: Record<string, string> = {
  generative_ai: "Generative AI",
  nlp: "NLP",
  machine_learning: "Machine Learning",
  programming_languages: "Programming Languages",
  data_engineering_etl: "Data Engineering & ETL",
  visualization: "Visualization",
  cloud_mlops: "Cloud & MLOps",
  collaboration_tools: "Collaboration Tools",
  databases: "Databases",
  frameworks: "Frameworks",
  devops: "DevOps",
  soft_skills: "Soft Skills",
  tools: "Tools",
  testing: "Testing",
  web_development: "Web Development",
  mobile_development: "Mobile Development",
  data_science: "Data Science",
  big_data: "Big Data",
  deep_learning: "Deep Learning",
  statistical_modeling: "Statistical Modeling",
  data_visualization: "Data Visualization",
  project_management: "Project Management",
  operating_systems: "Operating Systems",
  networking: "Networking",
  cybersecurity: "Cybersecurity",
};

// Default skill categories (keys from SkillsObject)
export const DEFAULT_SKILL_CATEGORIES = [
  "generative_ai",
  "nlp",
  "machine_learning",
  "programming_languages",
  "data_engineering_etl",
  "visualization",
  "cloud_mlops",
  "collaboration_tools",
];

// ── Skill Category Normalization ──────────────────────────────────────────────
// Maps common variations/aliases from AI-parsed resumes to canonical category keys.
// When AI extracts skills from a PDF, it may produce category names like
// "NLP Tools", "NLP Technologies", "Cloud Platforms", etc. This map normalizes
// them to a single canonical key to prevent duplicate categories.
export const SKILL_CATEGORY_ALIASES: Record<string, string> = {
  // NLP variations
  nlp: "nlp",
  nlp_tools: "nlp",
  nlp_technologies: "nlp",
  natural_language_processing: "nlp",
  nlp_frameworks: "nlp",
  nlp_libraries: "nlp",
  text_processing: "nlp",
  text_analytics: "nlp",

  // Machine Learning variations
  machine_learning: "machine_learning",
  ml: "machine_learning",
  ml_frameworks: "machine_learning",
  ml_modeling: "machine_learning",
  ml_tools: "machine_learning",
  mi_statistical_modeling: "machine_learning",
  statistical_modeling: "statistical_modeling",
  ml_libraries: "machine_learning",
  predictive_modeling: "machine_learning",
  supervised_learning: "machine_learning",
  unsupervised_learning: "machine_learning",

  // Deep Learning variations
  deep_learning: "deep_learning",
  dl: "deep_learning",
  dl_frameworks: "deep_learning",
  neural_networks: "deep_learning",

  // Generative AI variations
  generative_ai: "generative_ai",
  gen_ai: "generative_ai",
  genai: "generative_ai",
  llm: "generative_ai",
  llms: "generative_ai",
  large_language_models: "generative_ai",
  ai_tools: "generative_ai",

  // Programming Languages variations
  programming_languages: "programming_languages",
  programming: "programming_languages",
  languages: "programming_languages",
  coding_languages: "programming_languages",
  scripting_languages: "programming_languages",

  // Data Engineering & ETL variations
  data_engineering_etl: "data_engineering_etl",
  data_engineering: "data_engineering_etl",
  etl: "data_engineering_etl",
  etl_tools: "data_engineering_etl",
  data_pipeline: "data_engineering_etl",
  data_pipelines: "data_engineering_etl",
  data_processing: "data_engineering_etl",
  data_tools: "data_engineering_etl",

  // Visualization variations
  visualization: "visualization",
  data_visualization: "data_visualization",
  visualization_bi: "visualization",
  ization_bi: "visualization",  // truncated extraction artifact
  bi_tools: "visualization",
  reporting: "visualization",
  dashboards: "visualization",
  visualization_tools: "visualization",

  // Cloud & MLOps variations
  cloud_mlops: "cloud_mlops",
  cloud: "cloud_mlops",
  cloud_platforms: "cloud_mlops",
  cloud_and_devops: "cloud_mlops",
  cloud_devops: "cloud_mlops",
  cloud_services: "cloud_mlops",
  mlops: "cloud_mlops",
  ml_ops: "cloud_mlops",
  cloud_computing: "cloud_mlops",

  // DevOps variations
  devops: "devops",
  devops_tools: "devops",
  ci_cd: "devops",
  cicd: "devops",
  containerization: "devops",
  infrastructure: "devops",

  // Databases variations
  databases: "databases",
  database: "databases",
  database_management: "databases",
  sql: "databases",
  nosql: "databases",
  data_storage: "databases",

  // Frameworks variations
  frameworks: "frameworks",
  web_frameworks: "frameworks",
  backend_frameworks: "frameworks",
  frontend_frameworks: "frameworks",

  // Collaboration Tools variations
  collaboration_tools: "collaboration_tools",
  collaboration: "collaboration_tools",
  project_management: "project_management",
  project_management_tools: "project_management",
  agile: "project_management",
  agile_tools: "project_management",
  tools: "tools",

  // Web Development variations
  web_development: "web_development",
  web_technologies: "web_development",
  frontend: "web_development",
  backend: "web_development",

  // Big Data variations
  big_data: "big_data",
  big_data_tools: "big_data",
  distributed_computing: "big_data",
  hadoop: "big_data",
  spark: "big_data",
};

/**
 * Normalizes a skill category key to its canonical form.
 * Handles AI-extracted category names that may vary from the standard keys.
 *
 * @param rawKey - The raw category key (e.g., "nlp_tools", "Cloud Platforms")
 * @returns The canonical category key (e.g., "nlp", "cloud_mlops")
 */
export function normalizeSkillCategory(rawKey: string): string {
  // Convert to lowercase_snake_case
  const normalized = rawKey
    .trim()
    .toLowerCase()
    .replace(/[&+]/g, "_and_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");

  // Check if it maps to a known alias
  return SKILL_CATEGORY_ALIASES[normalized] || normalized;
}

/**
 * Gets the display name for a skill category key.
 * First normalizes the key, then looks up the label.
 *
 * @param key - The skill category key
 * @returns Human-readable display name
 */
export function getSkillCategoryLabel(key: string): string {
  const canonical = normalizeSkillCategory(key);
  return (
    SKILL_CATEGORY_LABELS[canonical] ||
    SKILL_CATEGORY_LABELS[key] ||
    key
      .replace(/_/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase())
  );
}
