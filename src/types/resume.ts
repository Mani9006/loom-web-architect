export interface PersonalInfo {
  fullName: string;
  title?: string; // e.g., "Senior Data Scientist"
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
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

export interface ProjectOption {
  id: string;
  title: string;
  bullets: string[];
  isSelected: boolean;
}

export interface Education {
  id: string;
  school: string;
  degree: string;
  field: string;
  graduationDate: string;
  gpa?: string;
  location?: string;
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  link?: string;
}

export interface SkillCategory {
  category: string;
  skills: string[];
}

export interface Project {
  id: string;
  name: string;
  organization?: string;
  date: string;
  bullets: string[];
}

export interface SummaryOption {
  id: string;
  content: string;
  isSelected: boolean;
}

export interface ResumeData {
  templateId: string;
  personalInfo: PersonalInfo;
  summary: string;
  summaryOptions: SummaryOption[];
  totalYearsExperience: number;
  clients: Client[];
  education: Education[];
  certifications: Certification[];
  skillCategories: SkillCategory[];
  projects: Project[];
  targetRole?: string;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
  sections: string[];
}
