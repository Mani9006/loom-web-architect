import { z } from "zod";

// ── Optional field schemas (empty string allowed) ──────────────────────────
export const emailSchema = z.string().email("Invalid email format").or(z.literal(""));
export const phoneSchema = z.string().regex(/^[\+\-\(\)\s\d]*$/, "Invalid phone format").or(z.literal(""));
export const urlSchema = z.string().url("Invalid URL").or(z.string().regex(/^[\w\.\-\/]+\.\w+/, "Invalid URL")).or(z.literal(""));
export const linkedinSchema = z.string().regex(/linkedin\.com\/in\//, "Should be a LinkedIn profile URL").or(z.literal(""));

// ── Required field schemas (empty string NOT allowed) ──────────────────────
export const nameSchema = z.string().min(2, "Name must be at least 2 characters");
export const requiredEmailSchema = z.string().min(1, "Email is required").email("Invalid email format");

// ── Validation helpers ─────────────────────────────────────────────────────

/** Validates an optional field - returns null for empty strings */
export function validateField(schema: z.ZodSchema, value: string): string | null {
  if (!value.trim()) return null;
  const result = schema.safeParse(value);
  return result.success ? null : result.error.errors[0]?.message || "Invalid";
}

/** Validates a required field - does NOT skip empty strings */
export function validateRequiredField(schema: z.ZodSchema, value: string): string | null {
  const result = schema.safeParse(value.trim());
  return result.success ? null : result.error.errors[0]?.message || "Required";
}

// ── Experience entry validation ────────────────────────────────────────────

interface ExperienceValidationInput {
  company_or_client: string;
  role: string;
  start_date: string;
  end_date: string;
  bullets: string[];
}

/** Validates an experience entry. Company and role are required when any field is filled. */
export function validateExperienceEntry(exp: ExperienceValidationInput): Record<string, string | null> {
  const hasAnyContent = exp.company_or_client.trim() || exp.role.trim() ||
    exp.start_date.trim() || exp.end_date.trim() || exp.bullets.some((b) => b.trim());

  if (!hasAnyContent) return { company_or_client: null, role: null };

  return {
    company_or_client: exp.company_or_client.trim() ? null : "Company name is required",
    role: exp.role.trim() ? null : "Job title is required",
  };
}

// ── Education entry validation ─────────────────────────────────────────────

interface EducationValidationInput {
  institution: string;
  degree: string;
  field: string;
  graduation_date: string;
}

/** Validates an education entry. Institution and degree are required when any field is filled. */
export function validateEducationEntry(edu: EducationValidationInput): Record<string, string | null> {
  const hasAnyContent = edu.institution.trim() || edu.degree.trim() ||
    edu.field.trim() || edu.graduation_date.trim();

  if (!hasAnyContent) return { institution: null, degree: null };

  return {
    institution: edu.institution.trim() ? null : "Institution is required",
    degree: edu.degree.trim() ? null : "Degree is required",
  };
}

// ── Date format suggestion ─────────────────────────────────────────────────

const VALID_DATE_PATTERNS = [
  /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}$/i,
  /^(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}$/i,
  /^\d{1,2}\/\d{4}$/,
  /^\d{4}$/,
  /^Present$/i,
  /^Current$/i,
];

/** Returns a suggestion if the date format isn't ATS-friendly. Null if OK or empty. */
export function getDateFormatSuggestion(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  if (VALID_DATE_PATTERNS.some((p) => p.test(dateStr.trim()))) return null;
  return "Use 'Jan 2023' or 'Present' for best ATS compatibility";
}

// ── Summary validation ─────────────────────────────────────────────────────

export function getSummaryWarning(summary: string): string | null {
  if (!summary.trim()) return null;
  if (summary.length < 50) return "Summary is very short. Aim for 2-3 sentences.";
  if (summary.length > 500) return "Summary is quite long. ATS prefers 2-3 concise sentences.";
  return null;
}

// ── Date range validation ──────────────────────────────────────────────────

export function validateDateRange(startDate: string, endDate: string): string | null {
  if (!startDate || !endDate || endDate === "Present") return null;
  return null;
}
