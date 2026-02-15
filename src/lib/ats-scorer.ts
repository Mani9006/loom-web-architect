/**
 * ATS (Applicant Tracking System) Resume Scorer
 *
 * Comprehensive rule-based scoring engine based on industry ATS guidelines:
 * - Taleo, Workday, Greenhouse, Lever, iCIMS, BambooHR parsing rules
 * - Font, spacing, formatting compliance
 * - Content quality (action verbs, metrics, length)
 * - Section completeness and structure
 * - Keyword density and relevance
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
  score: number; // 0-100
  maxScore: number;
  issues: ATSIssue[];
}

export interface ATSScore {
  overall: number; // 0-100
  sections: ATSSectionScore[];
  issues: ATSIssue[];
  passesATS: boolean; // >= 70 is considered passing
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

// ─── Scoring Functions ──────────────────────────────────────────────────────

function scoreHeader(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 15;

  // Name (critical)
  if (!data.header.name.trim()) {
    issues.push({ id: "h-name", section: "Personal Info", severity: "critical", title: "Missing name", description: "ATS systems require a full name to create a candidate profile.", fix: "Add your full legal name" });
  } else {
    score += 3;
    if (data.header.name.toUpperCase() === data.header.name && data.header.name.length > 3) {
      issues.push({ id: "h-name-case", section: "Personal Info", severity: "warning", title: "Name is ALL CAPS", description: "Some ATS parsers misread ALL CAPS names. Use Title Case.", fix: "Convert name to Title Case" });
    }
  }

  // Email (critical)
  if (!data.header.email.trim()) {
    issues.push({ id: "h-email", section: "Personal Info", severity: "critical", title: "Missing email", description: "Without an email, recruiters and ATS cannot contact you." });
  } else {
    score += 3;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.header.email)) {
      issues.push({ id: "h-email-fmt", section: "Personal Info", severity: "warning", title: "Invalid email format", description: "ATS may reject improperly formatted emails." });
    }
  }

  // Phone
  if (!data.header.phone.trim()) {
    issues.push({ id: "h-phone", section: "Personal Info", severity: "warning", title: "Missing phone number", description: "Most recruiters expect a phone number for initial screening." });
  } else {
    score += 2;
  }

  // Location
  if (!data.header.location.trim()) {
    issues.push({ id: "h-location", section: "Personal Info", severity: "warning", title: "Missing location", description: "ATS filters often use location. Add city/state or 'Remote'." });
  } else {
    score += 2;
  }

  // Title
  if (!data.header.title.trim()) {
    issues.push({ id: "h-title", section: "Personal Info", severity: "suggestion", title: "No job title in header", description: "A target title helps ATS match you to relevant roles." });
  } else {
    score += 3;
  }

  // LinkedIn
  if (!data.header.linkedin.trim()) {
    issues.push({ id: "h-linkedin", section: "Personal Info", severity: "suggestion", title: "No LinkedIn URL", description: "LinkedIn profiles help verify your professional background." });
  } else {
    score += 2;
  }

  return { section: "Personal Info", score, maxScore, issues };
}

function scoreSummary(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 15;

  if (!data.summary.trim()) {
    issues.push({ id: "s-missing", section: "Summary", severity: "warning", title: "No professional summary", description: "A summary helps ATS keyword matching and gives recruiters a quick overview.", fix: "Generate a professional summary" });
    return { section: "Summary", score: 0, maxScore, issues };
  }

  const words = data.summary.split(/\s+/).length;

  // Length check
  if (words < 20) {
    issues.push({ id: "s-short", section: "Summary", severity: "warning", title: "Summary too short", description: `Only ${words} words. Aim for 30-60 words for optimal ATS parsing.`, fix: "Expand summary to 30-60 words" });
    score += 3;
  } else if (words > 80) {
    issues.push({ id: "s-long", section: "Summary", severity: "suggestion", title: "Summary may be too long", description: `${words} words. Keep under 60-80 words to maintain recruiter attention.`, fix: "Condense summary to under 80 words" });
    score += 8;
  } else {
    score += 10;
  }

  // Check for first person pronouns (bad for resumes)
  if (/\b(I|me|my|myself)\b/i.test(data.summary)) {
    issues.push({ id: "s-pronoun", section: "Summary", severity: "warning", title: "First-person pronouns detected", description: "Professional summaries should avoid 'I', 'me', 'my'. Use implied first person.", fix: "Remove first-person pronouns" });
  } else {
    score += 3;
  }

  // Check for quantifiable achievements
  if (METRIC_PATTERN.test(data.summary) || PERCENTAGE_PATTERN.test(data.summary)) {
    score += 2;
  } else {
    issues.push({ id: "s-metrics", section: "Summary", severity: "suggestion", title: "No metrics in summary", description: "Adding numbers (e.g., '8+ years', '50% improvement') makes your summary more impactful." });
  }

  return { section: "Summary", score, maxScore, issues };
}

function scoreExperience(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 30;

  const validExp = data.experience.filter((e) => e.company_or_client);

  if (validExp.length === 0) {
    issues.push({ id: "e-missing", section: "Experience", severity: "critical", title: "No work experience", description: "Work experience is the most heavily weighted section by ATS systems." });
    return { section: "Experience", score: 0, maxScore, issues };
  }

  // Base score for having experience
  score += 5;

  validExp.forEach((exp, idx) => {
    const prefix = `e${idx}`;

    // Role check
    if (!exp.role.trim()) {
      issues.push({ id: `${prefix}-role`, section: "Experience", severity: "critical", title: `Experience ${idx + 1}: Missing job title`, description: "ATS uses job titles as primary matching criteria." });
    } else {
      score += 1;
    }

    // Date check
    if (!exp.start_date.trim() || !exp.end_date.trim()) {
      issues.push({ id: `${prefix}-dates`, section: "Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Missing dates`, description: "ATS systems calculate experience duration from dates. Missing dates hurt ranking." });
    } else {
      score += 1;
    }

    // Bullets check
    if (exp.bullets.length === 0) {
      issues.push({ id: `${prefix}-bullets`, section: "Experience", severity: "critical", title: `${exp.role || `Experience ${idx + 1}`}: No bullet points`, description: "ATS keyword matching relies heavily on bullet point content.", fix: "Add 3-6 bullet points with achievements" });
    } else if (exp.bullets.length < 3) {
      issues.push({ id: `${prefix}-few-bullets`, section: "Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Only ${exp.bullets.length} bullet(s)`, description: "Aim for 3-6 bullets per role for optimal keyword coverage.", fix: "Add more bullet points" });
      score += 1;
    } else {
      score += 2;
    }

    // Action verb check per bullet
    const bulletsWithoutAction = exp.bullets.filter((b) => {
      const firstWord = b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "");
      return firstWord && !STRONG_ACTION_VERBS.has(firstWord);
    });
    if (bulletsWithoutAction.length > 0 && exp.bullets.length > 0) {
      const ratio = bulletsWithoutAction.length / exp.bullets.length;
      if (ratio > 0.5) {
        issues.push({ id: `${prefix}-verbs`, section: "Experience", severity: "warning", title: `${exp.role || `Experience ${idx + 1}`}: Weak action verbs`, description: `${bulletsWithoutAction.length}/${exp.bullets.length} bullets don't start with strong action verbs. Use words like 'Developed', 'Led', 'Optimized'.`, fix: "Rewrite bullets to start with strong action verbs" });
      } else {
        score += 1;
      }
    }

    // Metrics check per role
    const bulletsWithMetrics = exp.bullets.filter((b) => METRIC_PATTERN.test(b) || PERCENTAGE_PATTERN.test(b) || DOLLAR_PATTERN.test(b) || NUMBER_PATTERN.test(b));
    if (bulletsWithMetrics.length === 0 && exp.bullets.length > 0) {
      issues.push({ id: `${prefix}-metrics`, section: "Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: No quantified achievements`, description: "Resumes with numbers get 40% more interviews. Add metrics like percentages, dollar amounts, or team sizes.", fix: "Add quantifiable metrics to bullets" });
    } else {
      score += 2;
    }

    // Bullet length check
    exp.bullets.forEach((b, bIdx) => {
      const bWords = b.split(/\s+/).length;
      if (bWords > 30) {
        issues.push({ id: `${prefix}-b${bIdx}-long`, section: "Experience", severity: "suggestion", title: `${exp.role || `Experience ${idx + 1}`}: Bullet ${bIdx + 1} too long`, description: `${bWords} words. Keep bullets under 25 words for readability.`, fix: "Shorten bullet to under 25 words" });
      }
    });
  });

  // Cap score
  return { section: "Experience", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreEducation(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 10;

  const validEdu = data.education.filter((e) => e.institution);

  if (validEdu.length === 0) {
    issues.push({ id: "ed-missing", section: "Education", severity: "warning", title: "No education listed", description: "Many ATS systems filter by education level. Add your highest degree." });
    return { section: "Education", score: 0, maxScore, issues };
  }

  score += 4;

  validEdu.forEach((edu, idx) => {
    if (!edu.degree.trim()) {
      issues.push({ id: `ed${idx}-degree`, section: "Education", severity: "warning", title: `${edu.institution}: Missing degree type`, description: "ATS filters by degree level (Bachelor's, Master's, etc.)." });
    } else {
      score += 2;
    }
    if (!edu.graduation_date.trim()) {
      issues.push({ id: `ed${idx}-date`, section: "Education", severity: "suggestion", title: `${edu.institution}: Missing graduation date`, description: "Dates help ATS calculate recency of education." });
    } else {
      score += 1;
    }
    if (!edu.field.trim()) {
      issues.push({ id: `ed${idx}-field`, section: "Education", severity: "suggestion", title: `${edu.institution}: Missing field of study`, description: "ATS may filter by field/major for technical roles." });
    } else {
      score += 1;
    }
  });

  return { section: "Education", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreSkills(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 15;

  const allSkills = Object.values(data.skills).flat();

  if (allSkills.length === 0) {
    issues.push({ id: "sk-missing", section: "Skills", severity: "critical", title: "No skills listed", description: "Skills section is the #1 ATS keyword matching area. This drastically reduces your match score." });
    return { section: "Skills", score: 0, maxScore, issues };
  }

  // Quantity scoring
  if (allSkills.length < 5) {
    issues.push({ id: "sk-few", section: "Skills", severity: "warning", title: `Only ${allSkills.length} skills listed`, description: "Aim for 10-20 relevant skills for optimal ATS matching." });
    score += 3;
  } else if (allSkills.length < 10) {
    score += 7;
    issues.push({ id: "sk-more", section: "Skills", severity: "suggestion", title: "Could add more skills", description: `${allSkills.length} skills is good, but 15-20 improves ATS match rates.` });
  } else {
    score += 10;
  }

  // Category check
  const categories = Object.keys(data.skills).filter((k) => data.skills[k].length > 0);
  if (categories.length < 2) {
    issues.push({ id: "sk-cats", section: "Skills", severity: "suggestion", title: "Only one skill category", description: "Organizing skills into categories (Technical, Tools, Soft Skills) improves ATS parsing." });
  } else {
    score += 3;
  }

  // Very long skill names (possible sentences, not keywords)
  const longSkills = allSkills.filter((s) => s.split(/\s+/).length > 4);
  if (longSkills.length > 0) {
    issues.push({ id: "sk-long", section: "Skills", severity: "suggestion", title: "Some skills are too verbose", description: `"${longSkills[0]}" looks like a phrase, not a skill keyword. Keep skills concise.` });
  } else {
    score += 2;
  }

  return { section: "Skills", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreProjects(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 8;

  const validProjects = data.projects.filter((p) => p.title);

  if (validProjects.length === 0) {
    // Projects are optional, mild suggestion
    issues.push({ id: "p-missing", section: "Projects", severity: "suggestion", title: "No projects listed", description: "Projects showcase practical skills, especially valuable for career changers or new grads." });
    return { section: "Projects", score: 2, maxScore, issues }; // Partial credit (not critical)
  }

  score += 4;

  validProjects.forEach((proj, idx) => {
    if (proj.bullets.length === 0 || proj.bullets.every((b) => !b.trim())) {
      issues.push({ id: `p${idx}-bullets`, section: "Projects", severity: "suggestion", title: `${proj.title}: No description`, description: "Add 1-3 bullet points describing what you built and the technologies used." });
    } else {
      score += 2;
    }
  });

  return { section: "Projects", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreCertifications(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 5;

  const validCerts = data.certifications.filter((c) => c.name);

  if (validCerts.length === 0) {
    return { section: "Certifications", score: 2, maxScore, issues }; // Optional section
  }

  score += 3;
  validCerts.forEach((cert, idx) => {
    if (!cert.issuer.trim()) {
      issues.push({ id: `c${idx}-issuer`, section: "Certifications", severity: "suggestion", title: `${cert.name}: Missing issuer`, description: "Include the certifying organization for ATS verification." });
    } else {
      score += 1;
    }
  });

  return { section: "Certifications", score: Math.min(score, maxScore), maxScore, issues };
}

function scoreFormatting(data: ResumeJSON): ATSSectionScore {
  const issues: ATSIssue[] = [];
  let score = 0;
  const maxScore = 7;

  // Check for special characters that break ATS parsing
  const allText = [
    data.summary,
    ...data.experience.flatMap((e) => [e.role, e.company_or_client, ...e.bullets]),
    ...data.education.map((e) => `${e.degree} ${e.field} ${e.institution}`),
    ...Object.values(data.skills).flat(),
  ].join(" ");

  // Unicode/emoji check
  if (/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}]/u.test(allText)) {
    issues.push({ id: "f-emoji", section: "Formatting", severity: "critical", title: "Emojis detected in content", description: "Most ATS systems cannot parse emojis and may corrupt your resume data.", fix: "Remove all emojis from resume content" });
  } else {
    score += 2;
  }

  // Tab/special whitespace
  if (/\t/.test(allText)) {
    issues.push({ id: "f-tabs", section: "Formatting", severity: "warning", title: "Tab characters detected", description: "Tabs can cause parsing errors. Use spaces instead." });
  } else {
    score += 1;
  }

  // Check resume isn't too short overall
  const totalWords = allText.split(/\s+/).filter(Boolean).length;
  if (totalWords < 100) {
    issues.push({ id: "f-short", section: "Formatting", severity: "warning", title: "Resume content too sparse", description: `Only ~${totalWords} words total. Most competitive resumes have 300-700 words.` });
  } else if (totalWords > 1000) {
    issues.push({ id: "f-long", section: "Formatting", severity: "suggestion", title: "Resume may be too long", description: `~${totalWords} words. For most roles, keep to 1-2 pages (400-700 words).` });
    score += 2;
  } else {
    score += 3;
  }

  // Section count check (more sections = better structured)
  let sectionCount = 0;
  if (data.header.name) sectionCount++;
  if (data.summary) sectionCount++;
  if (data.experience.some((e) => e.company_or_client)) sectionCount++;
  if (data.education.some((e) => e.institution)) sectionCount++;
  if (Object.values(data.skills).flat().length > 0) sectionCount++;
  if (data.projects.some((p) => p.title)) sectionCount++;
  if (data.certifications.some((c) => c.name)) sectionCount++;

  if (sectionCount < 4) {
    issues.push({ id: "f-sections", section: "Formatting", severity: "warning", title: "Too few resume sections", description: `Only ${sectionCount} sections. ATS expects at least: Contact, Summary, Experience, Education, Skills.` });
  } else {
    score += 1;
  }

  return { section: "Formatting", score: Math.min(score, maxScore), maxScore, issues };
}

// ─── Main Scorer ────────────────────────────────────────────────────────────

export function calculateATSScore(data: ResumeJSON): ATSScore {
  const sections = [
    scoreHeader(data),      // 15
    scoreSummary(data),     // 15
    scoreExperience(data),  // 30
    scoreEducation(data),   // 10
    scoreSkills(data),      // 15
    scoreProjects(data),    // 8
    scoreCertifications(data), // 5
    scoreFormatting(data),  // 7
  ]; // Total: 105 → normalized to 100

  const totalScore = sections.reduce((sum, s) => sum + s.score, 0);
  const totalMax = sections.reduce((sum, s) => sum + s.maxScore, 0);
  const overall = Math.round((totalScore / totalMax) * 100);
  const allIssues = sections.flatMap((s) => s.issues);

  // Sort: critical first, then warning, then suggestion
  const severityOrder: Record<IssueSeverity, number> = { critical: 0, warning: 1, suggestion: 2 };
  allIssues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    overall,
    sections,
    issues: allIssues,
    passesATS: overall >= 70,
  };
}

// ─── AI Suggestion Prompt Builder ───────────────────────────────────────────

export function buildSectionFixPrompt(section: string, data: ResumeJSON, issues: ATSIssue[]): string {
  const issueList = issues.map((i) => `- [${i.severity.toUpperCase()}] ${i.title}: ${i.description}`).join("\n");

  switch (section) {
    case "Summary":
      return `You are an ATS-optimization expert. Fix this professional summary to resolve these ATS issues:\n\nISSUES:\n${issueList}\n\nCURRENT SUMMARY:\n"${data.summary}"\n\nCONTEXT: ${data.header.title || "Professional"} with experience at ${data.experience.filter(e => e.company_or_client).map(e => e.company_or_client).join(", ")}. Skills: ${Object.values(data.skills).flat().slice(0, 15).join(", ")}.\n\nRULES: No first-person pronouns. Include metrics. 30-60 words. Start with years of experience or key strength. Output ONLY the improved summary text, nothing else.`;

    case "Experience":
      return `You are an ATS-optimization expert. Improve these experience bullet points to resolve ATS issues:\n\nISSUES:\n${issueList}\n\nEXPERIENCE:\n${data.experience.filter(e => e.company_or_client).map(e => `${e.role} at ${e.company_or_client}:\n${e.bullets.map(b => `- ${b}`).join("\n")}`).join("\n\n")}\n\nRULES: Start every bullet with a strong action verb (Led, Developed, Optimized, etc). Add quantifiable metrics (percentages, numbers, dollar amounts). Keep each bullet under 25 words. Return ONLY a JSON array of experience objects with "role", "company_or_client", and "bullets" fields.`;

    case "Skills":
      return `You are an ATS-optimization expert. The skills section has these issues:\n\nISSUES:\n${issueList}\n\nCURRENT SKILLS:\n${JSON.stringify(data.skills, null, 2)}\n\nCONTEXT: ${data.header.title || "Professional"} role. Experience includes: ${data.experience.filter(e => e.company_or_client).map(e => e.role).join(", ")}.\n\nRULES: Organize into clear categories. Add relevant technical skills based on experience. Keep skill names concise (1-3 words each). Return ONLY a JSON object with category keys and string array values.`;

    default:
      return `Fix ATS issues for the ${section} section:\n${issueList}`;
  }
}
