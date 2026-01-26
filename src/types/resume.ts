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
}

// Skills - Object with predefined categories
export interface SkillsObject {
  generative_ai: string[];
  nlp: string[];
  machine_learning: string[];
  programming_languages: string[];
  data_engineering_etl: string[];
  visualization: string[];
  cloud_mlops: string[];
  collaboration_tools: string[];
  // Allow custom categories
  [key: string]: string[];
}

// Project entry
export interface ProjectEntry {
  id: string;
  title: string;
  organization: string;
  date: string;
  bullets: string[];
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
  skills: {
    generative_ai: [],
    nlp: [],
    machine_learning: [],
    programming_languages: [],
    data_engineering_etl: [],
    visualization: [],
    cloud_mlops: [],
    collaboration_tools: [],
  },
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
