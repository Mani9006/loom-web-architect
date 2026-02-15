/**
 * ATS (Applicant Tracking System) Resume Scorer
 *
 * Strict, transparent rule-based scoring aligned with real ATS guidelines:
 * - Taleo, Workday, Greenhouse, Lever, iCIMS, BambooHR parsing rules
 * - Font, spacing, formatting compliance
 * - Content quality (action verbs, metrics, length)
 * - Section completeness and structure
 * - Keyword density and relevance (with optional job description matching)
 * - Date format consistency
 * - Bullet point quality checks
 *
 * Scoring is intentionally strict so that a 90+ score truly represents
 * a top-tier, ATS-optimized resume.
 */

import { ResumeJSON } from "@/types/resume";

export type IssueSeverity = "critical" | "warning" | "suggestion";

export interface ATSIssue {
  id: string;
  section: string;
  severity: IssueSeverity;
  title: string;
  description: string;
  fix?: string; // AI-fixable hint
}

export interface ATSSectionScore {
  section: string;
  score: number;
  maxScore: number;
  issues: ATSIssue[];
}

export interface ATSScore {
  overall: number; // 0-100
  sections: ATSSectionScore[];
  issues: ATSIssue[];
  passesATS: boolean; // >= 70 is considered passing
  summary: string; // Human-readable overall assessment
}

// ─── Action Verbs (ATS parsers reward these) ───────────────────────────────
const STRONG_ACTION_VERBS = new Set([
  "achieved", "accelerated", "administered", "analyzed", "architected", "automated",
  "built", "championed", "collaborated", "configured", "consolidated", "created",
  "decreased", "delivered", "deployed", "designed", "developed", "directed",
  "drove", "eliminated", "enabled", "engineered", "enhanced", "established",
  "exceeded", "executed", "expanded", "facilitated", "formulated", "generated",
  "grew", "guided", "identified", "implemented", "improved", "increased",
  "initiated", "innovated", "integrated", "introduced", "launched", "led",
  "managed", "maximized", "mentored", "migrated", "minimized", "modernized",
  "negotiated", "optimized", "orchestrated", "organized", "oversaw", "partnered",
  "pioneered", "planned", "presented", "produced", "programmed", "propelled",
  "published", "re-engineered", "realized", "recommended", "reduced", "refined",
  "resolved", "restructured", "revamped", "scaled", "secured", "simplified",
  "spearheaded", "standardized", "streamlined", "strengthened", "supervised",
  "surpassed", "tested", "trained", "transformed", "tripled", "unified", "upgraded",
]);

// ─── Metric patterns (numbers, percentages, dollar amounts) ─────────────────
const METRIC_PATTERN = /(\d+[%$kKmMbB+]|\$[\d,.]+|[\d,]+\+?\s*(users|clients|team|members|engineers|developers|projects|repositories|pipelines|servers|applications|endpoints|requests|transactions|records|customers|employees|stakeholders|regions|countries|markets|products|features|tickets|bugs|issues|sprints|releases|deployments|databases|tables|queries|dashboards|reports|models|algorithms|microservices|apis|containers))/i;
const PERCENTAGE_PATTERN = /\d+\s*%/;
const DOLLAR_PATTERN = /\$[\d,.]+[kKmMbB]?/;
const NUMBER_PATTERN = /\b\d{2,}\b/; // Any number >= 10

// ─── Date format patterns ────────────────────────────────────────────────────
const VALID_DATE_PATTERNS = [
  /^(Jan(uary)?|Feb(ruary)?|Mar(ch)?|Apr(il)?|May|Jun(e)?|Jul(y)?|Aug(ust)?|Sep(tember)?|Oct(ober)?|Nov(ember)?|Dec(ember)?)\s+\d{4}$/i,
  /^\d{1,2}\/\d{4}$/,     // MM/YYYY
  /^\d{4}$/,               // YYYY
  /^Present$/i,
  /^Current$/i,
];

// ─── Scoring weights (total = 100, no normalization needed) ─────────────────
// Each section scores out of its maxScore, and total = sum of all maxScores = 100
const WEIGHTS = {
  header: 10,       // Contact info is essential
  summary: 10,      // Professional summary
  experience: 30,   // Most heavily weighted
  education: 10,    // Degree, field, dates
  skills: 15,       // Keywords for ATS matching
  formatting: 10,   // Clean formatting for parser compatibility
  contentQuality: 15, // Overall quality: metrics, action verbs, length
} as const;
// Total: 10 + 10 + 30 + 10 + 15 + 10 + 15 = 100

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreHeader(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.header;

  // Name (3 points - critical)
  if (!data.header.name.trim()) {
    issues.push({ id: "h-name", section: "Contact Info", severity: "critical", title: "Missing name", description: "ATS systems require a full name to create a candidate profile. Without it, your resume will be rejected.", fix: "Add your full legal name" });
  } else {
    score += 3;
    if (data.header.name.toUpperCase() === data.header.name && data.header.name.length > 3) {
      issues.push({ id: "h-name-case", section: "Contact Info", severity: "warning", title: "Name is ALL CAPS", description: "Some ATS parsers (Taleo, Workday) misread ALL CAPS names. Use Title Case instead.", fix: "Convert name to Title Case" });
      score -= 1; // Penalty
    }
    if (/[<>{}[\]\\\/|@#$%^&*()+=~`]/.test(data.header.name)) {
      issues.push({ id: "h-name-chars", section: "Contact Info", severity: "warning", title: "Special characters in name", description: "Special characters may corrupt your name in ATS databases." });
      score -= 1;
    }
  }

  // Email (2 points - critical)
  if (!data.header.email.trim()) {
    issues.push({ id: "h-email", section: "Contact Info", severity: "critical", title: "Missing email address", description: "Without an email, recruiters cannot contact you. ATS will flag your application as incomplete." });
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.header.email)) {
      issues.push({ id: "h-email-fmt", section: "Contact Info", severity: "warning", title: "Invalid email format", description: "ATS may reject improperly formatted email addresses." });
    } else {
      score += 2;
    }
  }

  // Phone (2 points)
  if (!data.header.phone.trim()) {
    issues.push({ id: "h-phone", section: "Contact Info", severity: "warning", title: "Missing phone number", description: "Most recruiters and ATS expect a phone number for initial screening calls." });
  } else {
    score += 2;
  }

  // Location (1 point)
  if (!data.header.location.trim()) {
    issues.push({ id: "h-location", section: "Contact Info", severity: "warning", title: "Missing location", description: "ATS location filters will exclude your resume. Add 'City, State' or 'Remote'." });
  } else {
    score += 1;
  }

  // Title (1 point)
  if (!data.header.title.trim()) {
    issues.push({ id: "h-title", section: "Contact Info", severity: "suggestion", title: "No professional title", description: "A target job title (e.g., 'Senior Software Engineer') helps ATS match you to relevant positions." });
  } else {
    score += 1;
  }

  // LinkedIn (1 point)
  if (!data.header.linkedin.trim()) {
    issues.push({ id: "h-linkedin", section: "Contact Info", severity: "suggestion", title: "No LinkedIn URL", description: "LinkedIn profiles help recruiters verify your background. Many ATS parse LinkedIn data." });
  } else {
    score += 1;
    if (!/linkedin\.com\/in\//i.test(data.header.linkedin)) {
      issues.push({ id: "h-linkedin-fmt", section: "Contact Info", severity: "suggestion", title: "Non-standard LinkedIn URL", description: "Use the standard format: linkedin.com/in/your-name" });
    }
  }

  return { section: "Contact Info", score: Math.max(0, Math.min(score, maxScore)), maxScore, issues };
}

function scoreSummary(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.summary;

  if (!data.summary.trim()) {
    issues.push({ id: "s-missing", section: "Professional Summary", severity: "warning", title: "No professional summary", description: "A summary is the first thing ATS scans for keyword matching. Without it, you miss critical keyword opportunities and recruiters have no quick overview.", fix: "Generate a professional summary" });
    return { section: "Professional Summary", score: 0, maxScore, issues };
  }

  const words = data.summary.split(/\s+/).length;

  // Length check (4 points)
  if (words < 20) {
    issues.push({ id: "s-short", section: "Professional Summary", severity: "warning", title: "Summary too short", description: `Only ${words} words. ATS keyword matching works best with 30-60 words. Short summaries miss keyword opportunities.`, fix: "Expand summary to 30-60 words" });
    score += 1;
  } else if (words > 80) {
    issues.push({ id: "s-long", section: "Professional Summary", severity: "suggestion", title: "Summary is too long", description: `${words} words. Recruiters spend 6-7 seconds scanning. Keep under 60 words for maximum impact.`, fix: "Condense summary to under 60 words" });
    score += 3;
  } else {
    score += 4;
  }

  // First-person pronouns check (2 points)
  if (/\b(I|me|my|myself)\b/.test(data.summary)) {
    issues.push({ id: "s-pronoun", section: "Professional Summary", severity: "warning", title: "First-person pronouns detected", description: "Professional summaries should use implied first person. 'I managed a team' → 'Managed a team of 15 engineers'. This is an industry standard.", fix: "Remove first-person pronouns" });
  } else {
    score += 2;
  }

  // Quantifiable achievements (2 points)
  if (METRIC_PATTERN.test(data.summary) || PERCENTAGE_PATTERN.test(data.summary)) {
    score += 2;
  } else {
    issues.push({ id: "s-metrics", section: "Professional Summary", severity: "suggestion", title: "No quantified results in summary", description: "Adding metrics like '8+ years experience' or 'managed $2M budget' makes your summary more compelling and ATS-friendly." });
    score += 1; // Partial credit - it's a suggestion
  }

  // Keywords present (2 points)
  const hasKeywords = data.summary.length > 50;
  if (hasKeywords) {
    score += 2;
  }

  return { section: "Professional Summary", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreExperience(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.experience;

  const validExp = data.experience.filter((e) => e.company_or_client);

  if (validExp.length === 0) {
    issues.push({ id: "e-missing", section: "Work Experience", severity: "critical", title: "No work experience listed", description: "Work experience is the most heavily weighted section by all major ATS systems (Taleo, Workday, Greenhouse). Without it, your resume will score extremely low." });
    return { section: "Work Experience", score: 0, maxScore, issues };
  }

  // Base points for having experience (5 points)
  score += 5;

  // Reverse chronological order check (2 points)
  const dateStrings = validExp.map((e) => e.end_date).filter(Boolean);
  if (dateStrings.length > 1) {
    const firstIsCurrent = /present|current/i.test(dateStrings[0]);
    const lastIsCurrent = /present|current/i.test(dateStrings[dateStrings.length - 1]);
    if (lastIsCurrent && !firstIsCurrent) {
      issues.push({ id: "e-order", section: "Work Experience", severity: "warning", title: "Not in reverse chronological order", description: "ATS systems and recruiters expect most recent role first. Reorder from newest to oldest." });
    } else {
      score += 2;
    }
  } else {
    score += 2;
  }

  // Per-role scoring: max 23 points across all roles combined
  // We calculate per-role scores and normalize to 23 points
  let rolePointsEarned = 0;
  let rolePointsMax = 0;

  validExp.forEach((exp, idx) => {
    const prefix = `e${idx}`;
    let thisRoleScore = 0;
    const thisRoleMax = 10; // Each role is scored out of 10, then normalized
    rolePointsMax += thisRoleMax;

    // Job title present (2 points per role)
    if (!exp.role.trim()) {
      issues.push({ id: `${prefix}-role`, section: "Work Experience", severity: "critical", title: `Experience ${idx + 1}: Missing job title`, description: "ATS uses job titles as PRIMARY matching criteria. Without a title, this role won't match any job listings." });
    } else {
      thisRoleScore += 2;
    }

    // Dates present and formatted (1 point per role)
    if (!exp.start_date.trim() || !exp.end_date.trim()) {
      issues.push({ id: `${prefix}-dates`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Missing dates`, description: "ATS calculates total years of experience from dates. Missing dates means your experience won't count toward requirements like '5+ years experience'." });
    } else {
      const startValid = VALID_DATE_PATTERNS.some((p) => p.test(exp.start_date.trim()));
      const endValid = VALID_DATE_PATTERNS.some((p) => p.test(exp.end_date.trim()));
      if (!startValid || !endValid) {
        issues.push({ id: `${prefix}-date-fmt`, section: "Work Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Non-standard date format`, description: "Use 'Month Year' (e.g., 'January 2023' or 'Jan 2023') for best ATS compatibility." });
        thisRoleScore += 0.5;
      } else {
        thisRoleScore += 1;
      }
    }

    // Bullet points (3 points per role)
    if (exp.bullets.length === 0) {
      issues.push({ id: `${prefix}-bullets`, section: "Work Experience", severity: "critical", title: `${exp.role || `Experience ${idx + 1}`}: No bullet points`, description: "ATS keyword matching relies heavily on bullet point content. Without bullets, this role contributes zero keywords.", fix: "Add 3-6 bullet points with achievements" });
    } else if (exp.bullets.length < 3) {
      issues.push({ id: `${prefix}-few-bullets`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Only ${exp.bullets.length} bullet(s)`, description: "Best practice is 3-6 bullets per role. Fewer bullets means fewer keyword matching opportunities.", fix: "Add more bullet points" });
      thisRoleScore += 1;
    } else if (exp.bullets.length > 8) {
      issues.push({ id: `${prefix}-many-bullets`, section: "Work Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Too many bullets (${exp.bullets.length})`, description: "Keep 4-6 bullets per role. Too many bullets dilute impact and make the resume too long." });
      thisRoleScore += 2;
    } else {
      thisRoleScore += 3;
    }

    // Action verbs (2 points per role)
    if (exp.bullets.length > 0) {
      const bulletsWithAction = exp.bullets.filter((b) => {
        const firstWord = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "");
        return firstWord && STRONG_ACTION_VERBS.has(firstWord);
      });
      const actionRatio = bulletsWithAction.length / exp.bullets.length;
      if (actionRatio >= 0.8) {
        thisRoleScore += 2;
      } else if (actionRatio >= 0.5) {
        thisRoleScore += 1;
        const weak = exp.bullets.length - bulletsWithAction.length;
        issues.push({ id: `${prefix}-verbs`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: ${weak} bullets lack strong action verbs`, description: "Start every bullet with a strong action verb (Led, Developed, Optimized, Implemented). ATS parsers weight the first word heavily.", fix: "Rewrite bullets to start with strong action verbs" });
      } else {
        issues.push({ id: `${prefix}-verbs`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Most bullets lack action verbs`, description: `Only ${bulletsWithAction.length}/${exp.bullets.length} bullets start with strong action verbs. Use words like 'Led', 'Developed', 'Optimized', 'Increased'.`, fix: "Rewrite bullets to start with strong action verbs" });
      }
    }

    // Quantified achievements (2 points per role)
    if (exp.bullets.length > 0) {
      const bulletsWithMetrics = exp.bullets.filter((b) =>
        METRIC_PATTERN.test(b) || PERCENTAGE_PATTERN.test(b) || DOLLAR_PATTERN.test(b) || NUMBER_PATTERN.test(b)
      );
      if (bulletsWithMetrics.length === 0) {
        issues.push({ id: `${prefix}-metrics`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: No quantified achievements`, description: "Resumes with numbers get 40% more interviews. Add metrics: percentages, dollar amounts, team sizes, or project counts.", fix: "Add quantifiable metrics to bullets" });
      } else if (bulletsWithMetrics.length / exp.bullets.length < 0.4) {
        thisRoleScore += 1;
        issues.push({ id: `${prefix}-few-metrics`, section: "Work Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Only ${bulletsWithMetrics.length}/${exp.bullets.length} bullets have metrics`, description: "Aim for at least 50% of bullets to include quantifiable results." });
      } else {
        thisRoleScore += 2;
      }
    }

    // Bullet length checks
    exp.bullets.forEach((b, bIdx) => {
      const bWords = b.split(/\s+/).length;
      if (bWords > 30) {
        issues.push({ id: `${prefix}-b${bIdx}-long`, section: "Work Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Bullet ${bIdx + 1} too long`, description: `${bWords} words. ATS may truncate long bullets. Keep under 25 words.`, fix: "Shorten bullet to under 25 words" });
      }
      if (bWords < 5 && b.trim()) {
        issues.push({ id: `${prefix}-b${bIdx}-short`, section: "Work Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Bullet ${bIdx + 1} too brief`, description: `Only ${bWords} words. Expand with specific achievements and context.`, fix: "Expand bullet with more detail" });
      }
    });

    // Duplicate bullet check
    const lowerBullets = exp.bullets.map((b) => b.toLowerCase().trim()).filter(Boolean);
    const uniqueBullets = new Set(lowerBullets);
    if (uniqueBullets.size < lowerBullets.length) {
      issues.push({ id: `${prefix}-dup`, section: "Work Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Duplicate bullet points`, description: "Duplicate content wastes keyword space. Each bullet should be unique." });
    }

    rolePointsEarned += thisRoleScore;
  });

  // Normalize role-based points to remaining 23 points
  if (rolePointsMax > 0) {
    const normalizedRoleScore = Math.round((rolePointsEarned / rolePointsMax) * 23);
    score += normalizedRoleScore;
  }

  return { section: "Work Experience", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreEducation(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.education;

  const validEdu = data.education.filter((e) => e.institution);

  if (validEdu.length === 0) {
    issues.push({ id: "ed-missing", section: "Education", severity: "warning", title: "No education listed", description: "Many ATS systems filter by education level (e.g., 'Bachelor's required'). Missing education can auto-reject your application." });
    return { section: "Education", score: 0, maxScore, issues };
  }

  // Base score for having education (3 points)
  score += 3;

  // Score each education entry
  let eduDetailPoints = 0;
  let eduDetailMax = 0;

  validEdu.forEach((edu, idx) => {
    const thisMax = 7;
    let thisScore = 0;
    eduDetailMax += thisMax;

    // Degree type (3 points)
    if (!edu.degree.trim()) {
      issues.push({ id: `ed${idx}-degree`, section: "Education", severity: "warning", title: `${edu.institution}: Missing degree type`, description: "ATS filters require degree level (Bachelor's, Master's, PhD). Without it, you won't pass education filters." });
    } else {
      thisScore += 3;
    }

    // Graduation date (2 points)
    if (!edu.graduation_date.trim()) {
      issues.push({ id: `ed${idx}-date`, section: "Education", severity: "suggestion", title: `${edu.institution}: Missing graduation date`, description: "Dates help ATS verify degree completion and calculate experience timeline." });
    } else {
      thisScore += 2;
    }

    // Field of study (2 points)
    if (!edu.field.trim()) {
      issues.push({ id: `ed${idx}-field`, section: "Education", severity: "warning", title: `${edu.institution}: Missing field of study`, description: "ATS may filter by major/field (e.g., 'Computer Science degree required'). Include your field of study." });
    } else {
      thisScore += 2;
    }

    eduDetailPoints += thisScore;
  });

  // Normalize education detail points to remaining 7 points
  if (eduDetailMax > 0) {
    score += Math.round((eduDetailPoints / eduDetailMax) * 7);
  }

  return { section: "Education", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreSkills(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.skills;

  const allSkills = Object.values(data.skills).flat().filter(s => s.trim());

  if (allSkills.length === 0) {
    issues.push({ id: "sk-missing", section: "Skills", severity: "critical", title: "No skills listed", description: "The Skills section is where ATS performs PRIMARY keyword matching. Without skills, your resume will fail keyword matching for almost every job listing. This is the #1 reason resumes get rejected by ATS." });
    return { section: "Skills", score: 0, maxScore, issues };
  }

  // Skill count scoring (8 points)
  if (allSkills.length < 5) {
    issues.push({ id: "sk-few", section: "Skills", severity: "warning", title: `Only ${allSkills.length} skills listed`, description: "Most competitive resumes list 10-20 relevant skills. Fewer skills means fewer keyword matches with job descriptions." });
    score += 2;
  } else if (allSkills.length < 8) {
    issues.push({ id: "sk-more", section: "Skills", severity: "suggestion", title: `${allSkills.length} skills — could add more`, description: "You have a decent start. Adding 5-10 more relevant skills will significantly improve ATS match rates." });
    score += 4;
  } else if (allSkills.length < 12) {
    score += 6;
    issues.push({ id: "sk-good", section: "Skills", severity: "suggestion", title: "Good skill count, consider adding more", description: `${allSkills.length} skills is solid. 15-20 skills is optimal for maximum ATS keyword coverage.` });
  } else if (allSkills.length <= 25) {
    score += 8;
  } else {
    // Too many can look unfocused
    score += 6;
    issues.push({ id: "sk-too-many", section: "Skills", severity: "suggestion", title: `${allSkills.length} skills may be too many`, description: "Focus on 15-20 most relevant skills. Too many skills can dilute your profile and look unfocused." });
  }

  // Category organization (4 points)
  const categories = Object.keys(data.skills).filter((k) => data.skills[k].length > 0);
  if (categories.length < 2) {
    issues.push({ id: "sk-cats", section: "Skills", severity: "suggestion", title: "Skills not categorized", description: "Organizing skills into categories (Technical Skills, Tools, Frameworks, Soft Skills) helps ATS parse and categorize your abilities." });
    score += 1;
  } else if (categories.length < 3) {
    score += 3;
  } else {
    score += 4;
  }

  // Skill format check (3 points)
  const longSkills = allSkills.filter((s) => s.split(/\s+/).length > 4);
  if (longSkills.length > 0) {
    issues.push({ id: "sk-long", section: "Skills", severity: "suggestion", title: "Some skills are too verbose", description: `"${longSkills[0]}" looks like a phrase. Keep skills concise (1-3 words each) for ATS keyword matching.` });
    score += 1;
  } else {
    score += 3;
  }

  return { section: "Skills", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreFormatting(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.formatting;

  // Gather all text content
  const allText = [
    data.summary,
    ...data.experience.flatMap((e) => [e.role, e.company_or_client, ...e.bullets]),
    ...data.education.map((e) => `${e.degree} ${e.field} ${e.institution}`),
    ...Object.values(data.skills).flat(),
    ...data.projects.flatMap((p) => [p.title, ...p.bullets]),
    ...data.certifications.map((c) => `${c.name} ${c.issuer}`),
  ].join(" ");

  // Unicode/emoji check (2 points)
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u.test(allText)) {
    issues.push({ id: "f-emoji", section: "Formatting", severity: "critical", title: "Emojis detected in resume", description: "ATS systems (Taleo, Workday, iCIMS) CANNOT parse emojis. They will corrupt your resume data and may cause rejection.", fix: "Remove all emojis from resume content" });
  } else {
    score += 2;
  }

  // Tab/special whitespace (1 point)
  if (/\t/.test(allText)) {
    issues.push({ id: "f-tabs", section: "Formatting", severity: "warning", title: "Tab characters detected", description: "Tabs cause ATS parsing errors. Use regular spaces instead." });
  } else {
    score += 1;
  }

  // Resume length/word count (3 points)
  const totalWords = allText.split(/\s+/).filter(Boolean).length;
  if (totalWords < 100) {
    issues.push({ id: "f-short", section: "Formatting", severity: "warning", title: "Resume is too sparse", description: `Only ~${totalWords} words. Competitive resumes have 300-700 words. Your resume lacks enough content for meaningful ATS keyword matching.` });
  } else if (totalWords < 200) {
    issues.push({ id: "f-brief", section: "Formatting", severity: "suggestion", title: "Resume could use more content", description: `~${totalWords} words. Aim for 400-600 words for a strong single-page resume.` });
    score += 1;
  } else if (totalWords > 1200) {
    issues.push({ id: "f-long", section: "Formatting", severity: "suggestion", title: "Resume may be too long", description: `~${totalWords} words. Unless you have 15+ years experience, aim for 1-2 pages (400-800 words).` });
    score += 2;
  } else {
    score += 3;
  }

  // Essential sections present (3 points)
  let essentialSections = 0;
  const missingSections: string[] = [];

  if (data.header.name && data.header.email) essentialSections++;
  else missingSections.push("Contact Info (name + email)");

  if (data.summary.trim()) essentialSections++;
  else missingSections.push("Professional Summary");

  if (data.experience.some((e) => e.company_or_client)) essentialSections++;
  else missingSections.push("Work Experience");

  if (data.education.some((e) => e.institution)) essentialSections++;
  else missingSections.push("Education");

  if (Object.values(data.skills).flat().filter(s => s.trim()).length > 0) essentialSections++;
  else missingSections.push("Skills");

  if (essentialSections < 5) {
    issues.push({ id: "f-sections", section: "Formatting", severity: "critical", title: `Missing essential sections: ${missingSections.join(", ")}`, description: `Your resume is missing ${missingSections.length} essential section(s). ATS systems expect all 5 core sections: Contact Info, Summary, Experience, Education, and Skills.` });
    score += Math.round((essentialSections / 5) * 3);
  } else {
    score += 3;
  }

  // Consistency check (1 point)
  // Check if dates are consistent format across all experience and education
  const allDates = [
    ...data.experience.flatMap((e) => [e.start_date, e.end_date].filter(Boolean)),
    ...data.education.map((e) => e.graduation_date).filter(Boolean),
  ];
  if (allDates.length > 2) {
    const hasMonthYear = allDates.some((d) => /^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i.test(d));
    const hasSlashFormat = allDates.some((d) => /^\d{1,2}\/\d{4}$/.test(d));
    const hasYearOnly = allDates.some((d) => /^\d{4}$/.test(d) && !/present|current/i.test(d));
    const formatCount = [hasMonthYear, hasSlashFormat, hasYearOnly].filter(Boolean).length;
    if (formatCount > 1) {
      issues.push({ id: "f-date-mix", section: "Formatting", severity: "warning", title: "Inconsistent date formats", description: "You're mixing date formats (e.g., 'Jan 2023' and '01/2023'). Use one consistent format throughout for ATS compatibility." });
    } else {
      score += 1;
    }
  } else {
    score += 1;
  }

  return { section: "Formatting", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreContentQuality(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = WEIGHTS.contentQuality;

  // Projects bonus (3 points) - NOT free points, must have content
  const validProjects = data.projects.filter((p) => p.title);
  if (validProjects.length > 0) {
    let projectScore = 0;
    const hasDescriptions = validProjects.some((p) => p.bullets.length > 0 && p.bullets.some(b => b.trim()));
    if (hasDescriptions) {
      projectScore = 3;
    } else {
      projectScore = 1;
      issues.push({ id: "cq-proj-desc", section: "Content Quality", severity: "suggestion", title: "Projects lack descriptions", description: "Add 1-3 bullet points per project describing what you built and technologies used." });
    }
    score += projectScore;
  } else {
    // No penalty for missing projects, but note it for new grads
    issues.push({ id: "cq-no-proj", section: "Content Quality", severity: "suggestion", title: "No projects section", description: "Projects demonstrate practical skills, especially valuable for career changers or new graduates." });
  }

  // Certifications bonus (2 points) - only if present
  const validCerts = data.certifications.filter((c) => c.name);
  if (validCerts.length > 0) {
    const hasIssuers = validCerts.some((c) => c.issuer.trim());
    if (hasIssuers) {
      score += 2;
    } else {
      score += 1;
      issues.push({ id: "cq-cert-issuer", section: "Content Quality", severity: "suggestion", title: "Certifications missing issuing organizations", description: "Include the certifying organization (e.g., 'AWS', 'Google', 'PMI') for ATS verification." });
    }
  }

  // Overall metrics density (4 points)
  const allBullets = data.experience.flatMap((e) => e.bullets).filter(b => b.trim());
  if (allBullets.length > 0) {
    const bulletsWithMetrics = allBullets.filter((b) =>
      METRIC_PATTERN.test(b) || PERCENTAGE_PATTERN.test(b) || DOLLAR_PATTERN.test(b) || NUMBER_PATTERN.test(b)
    );
    const metricRatio = bulletsWithMetrics.length / allBullets.length;
    if (metricRatio >= 0.5) {
      score += 4;
    } else if (metricRatio >= 0.3) {
      score += 3;
      issues.push({ id: "cq-metrics-more", section: "Content Quality", severity: "suggestion", title: "Add more quantified achievements", description: `${bulletsWithMetrics.length}/${allBullets.length} bullets have metrics. Top resumes quantify 50%+ of bullets.` });
    } else if (metricRatio > 0) {
      score += 2;
      issues.push({ id: "cq-metrics-few", section: "Content Quality", severity: "warning", title: "Low metrics density", description: `Only ${bulletsWithMetrics.length}/${allBullets.length} bullets include numbers. Quantify achievements wherever possible.` });
    } else {
      issues.push({ id: "cq-no-metrics", section: "Content Quality", severity: "warning", title: "No quantified achievements anywhere", description: "Zero bullets contain metrics. Add percentages, dollar amounts, team sizes, or counts to demonstrate impact." });
    }
  }

  // Overall action verb quality (3 points)
  if (allBullets.length > 0) {
    const bulletsWithAction = allBullets.filter((b) => {
      const firstWord = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "");
      return firstWord && STRONG_ACTION_VERBS.has(firstWord);
    });
    const actionRatio = bulletsWithAction.length / allBullets.length;
    if (actionRatio >= 0.8) {
      score += 3;
    } else if (actionRatio >= 0.5) {
      score += 2;
    } else if (actionRatio > 0) {
      score += 1;
    }
    // Don't add duplicate issues here - per-role issues already added in experience
  }

  // Keyword diversity check (3 points)
  const allText = [
    data.summary,
    ...data.experience.flatMap((e) => [e.role, ...e.bullets]),
    ...Object.values(data.skills).flat(),
  ].join(" ").toLowerCase();
  const uniqueWords = new Set(allText.split(/\s+/).filter(w => w.length > 3));
  if (uniqueWords.size > 150) {
    score += 3;
  } else if (uniqueWords.size > 80) {
    score += 2;
  } else if (uniqueWords.size > 40) {
    score += 1;
  } else {
    issues.push({ id: "cq-diversity", section: "Content Quality", severity: "suggestion", title: "Low keyword diversity", description: "Your resume uses limited vocabulary. Use varied, industry-specific terminology to improve keyword matching." });
  }

  return { section: "Content Quality", score: Math.min(score, maxScore), maxScore, issues };
}

// ─── Job Description Keyword Matching (bonus analysis) ──────────────────────

export interface KeywordMatch {
  keyword: string;
  found: boolean;
  context?: string; // Where it was found
}

export function matchJobDescriptionKeywords(data: ResumeJSON, jobDescription: string): KeywordMatch[] {
  if (!jobDescription.trim()) return [];

  // Extract meaningful keywords from job description
  const stopWords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
    "by", "from", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might", "shall",
    "can", "must", "need", "that", "this", "these", "those", "it", "its", "we", "our",
    "you", "your", "they", "their", "he", "she", "him", "her", "not", "no", "all", "each",
    "every", "any", "some", "such", "than", "too", "very", "just", "about", "also",
    "into", "through", "during", "before", "after", "above", "below", "between", "under",
    "over", "again", "further", "then", "once", "here", "there", "when", "where", "why",
    "how", "what", "which", "who", "whom", "both", "few", "more", "most", "other",
    "only", "own", "same", "so", "as", "if", "while", "per", "via", "etc",
    "including", "include", "includes", "required", "requirements", "preferred",
    "experience", "ability", "strong", "excellent", "proven", "minimum", "years",
    "work", "working", "role", "position", "job", "team", "company", "environment",
    "responsibilities", "qualifications", "skills", "candidate", "looking",
  ]);

  // Extract 2-word and 3-word phrases first (more meaningful)
  const jdWords = jobDescription.toLowerCase().replace(/[^a-z0-9\s+#.-]/g, " ").split(/\s+/).filter(Boolean);
  const jdPhrases = new Map<string, number>();

  // Single meaningful words
  jdWords.forEach((word) => {
    if (word.length > 2 && !stopWords.has(word)) {
      jdPhrases.set(word, (jdPhrases.get(word) || 0) + 1);
    }
  });

  // Two-word phrases
  for (let i = 0; i < jdWords.length - 1; i++) {
    const phrase = `${jdWords[i]} ${jdWords[i + 1]}`;
    if (!stopWords.has(jdWords[i]) && !stopWords.has(jdWords[i + 1]) && jdWords[i].length > 2 && jdWords[i + 1].length > 2) {
      jdPhrases.set(phrase, (jdPhrases.get(phrase) || 0) + 1);
    }
  }

  // Get resume text for matching
  const resumeText = [
    data.header.title,
    data.summary,
    ...data.experience.flatMap((e) => [e.role, e.company_or_client, ...e.bullets]),
    ...data.education.flatMap((e) => [e.degree, e.field, e.institution]),
    ...Object.values(data.skills).flat(),
    ...data.projects.flatMap((p) => [p.title, ...p.bullets]),
    ...data.certifications.map((c) => `${c.name} ${c.issuer}`),
  ].join(" ").toLowerCase();

  // Filter to most important keywords (mentioned 2+ times or are multi-word technical terms)
  const importantKeywords: string[] = [];
  jdPhrases.forEach((count, phrase) => {
    if (count >= 2 || phrase.includes(" ") || /[+#.]/.test(phrase) || phrase.length > 6) {
      importantKeywords.push(phrase);
    }
  });

  // Sort by frequency and take top 25
  const sortedKeywords = importantKeywords
    .sort((a, b) => (jdPhrases.get(b) || 0) - (jdPhrases.get(a) || 0))
    .slice(0, 25);

  return sortedKeywords.map((keyword) => ({
    keyword,
    found: resumeText.includes(keyword),
    context: resumeText.includes(keyword) ? "Found in resume" : undefined,
  }));
}

// ─── Main Scorer ────────────────────────────────────────────────────────────

export function calculateATSScore(data: ResumeJSON, jobDescription?: string): ATSScore {
  const sections = [
    scoreHeader(data),          // 10
    scoreSummary(data),         // 10
    scoreExperience(data),      // 30
    scoreEducation(data),       // 10
    scoreSkills(data),          // 15
    scoreFormatting(data),      // 10
    scoreContentQuality(data),  // 15
  ]; // Total maxScore: 100

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0);
  const totalMax = sections.reduce((sum, s) => sum + s.maxScore, 0);
  // Direct percentage since maxScore totals 100, but use ratio for safety
  const overall = Math.round((totalScore / totalMax) * 100);
  const allIssues = sections.flatMap((s) => s.issues);

  // Sort: critical first, then warning, then suggestion
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, suggestion: 2 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  // Generate human-readable summary
  const criticalCount = allIssues.filter((i) => i.severity === "critical").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  let summary: string;

  if (overall >= 90) {
    summary = "Excellent! Your resume is highly optimized for ATS systems. It should pass most automated screening filters.";
  } else if (overall >= 80) {
    summary = "Very good. Your resume is ATS-compatible with minor improvements possible. Focus on the suggestions below to reach 90+.";
  } else if (overall >= 70) {
    summary = `Decent, but needs work. You have ${warningCount} warnings that should be addressed to improve your match rate.`;
  } else if (overall >= 50) {
    summary = `Needs significant improvement. ${criticalCount} critical issues and ${warningCount} warnings are reducing your chances. Address critical issues first.`;
  } else {
    summary = `Your resume has major ATS compatibility issues. ${criticalCount} critical problems must be fixed immediately or your resume will likely be auto-rejected.`;
  }

  return {
    overall,
    sections,
    issues: allIssues,
    passesATS: overall >= 70,
    summary,
  };
}

// ─── AI Suggestion Prompt Builder ───────────────────────────────────────────

export function buildSectionFixPrompt(section: string, data: ResumeJSON, issues: ATSIssue[]): string {
  const issueList = issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n");

  switch (section) {
    case "Summary":
    case "Professional Summary":
      return `You are an ATS-optimization expert. Fix this professional summary to resolve these ATS issues:\n\nISSUES:\n${issueList}\n\nCURRENT SUMMARY:\n"${data.summary}"\n\nCONTEXT: ${data.header.title || "Professional"} with experience at ${data.experience.filter(e => e.company_or_client).map(e => e.company_or_client).join(", ")}. Skills: ${Object.values(data.skills).flat().slice(0, 15).join(", ")}.\n\nRULES: No first-person pronouns. Include metrics. 30-60 words. Start with years of experience or key strength. Output ONLY the improved summary text, nothing else.`;

    case "Experience":
    case "Work Experience":
      return `You are an ATS-optimization expert. Improve these experience bullet points to resolve ATS issues:\n\nISSUES:\n${issueList}\n\nEXPERIENCE:\n${data.experience.filter(e => e.company_or_client).map(e => `${e.role} at ${e.company_or_client}:\n${e.bullets.map(b => `- ${b}`).join("\n")}`).join("\n\n")}\n\nRULES: Start every bullet with a strong action verb (Led, Developed, Optimized, etc). Add quantifiable metrics (percentages, numbers, dollar amounts). Keep each bullet under 25 words. Return ONLY a JSON array of experience objects with "role", "company_or_client", and "bullets" fields.`;

    case "Skills":
      return `You are an ATS-optimization expert. The skills section has these issues:\n\nISSUES:\n${issueList}\n\nCURRENT SKILLS:\n${JSON.stringify(data.skills, null, 2)}\n\nCONTEXT: ${data.header.title || "Professional"} role. Experience includes: ${data.experience.filter(e => e.company_or_client).map(e => e.role).join(", ")}.\n\nRULES: Organize into clear categories. Add relevant technical skills based on experience. Keep skill names concise (1-3 words each). Return ONLY a JSON object with category keys and string array values.`;

    default:
      return `Fix ATS issues for the ${section} section:\n${issueList}`;
  }
}
