import { describe, expect, it } from "vitest";
import { calculateATSScore, matchJobDescriptionKeywords } from "@/lib/ats-scorer";
import type { ResumeJSON } from "@/types/resume";

const ENTERPRISE_DOMAINS = [
  "AI Platform Modernization",
  "Zero Trust Identity",
  "Multi-Region Observability",
  "Revenue Intelligence",
  "Healthcare Interoperability",
  "Financial Risk Analytics",
  "Retail Personalization",
  "Supply Chain Control Tower",
  "Developer Experience Portal",
  "Security Data Lake",
  "Enterprise Search",
  "Customer 360 Graph",
  "Cloud Cost Governance",
  "Incident Automation",
  "Data Quality Fabric",
  "Workflow Orchestration",
  "Compliance Evidence Vault",
  "Realtime Experimentation",
  "Edge Delivery Optimization",
  "Partner API Marketplace",
  "Knowledge Assistant",
  "Talent Matching Engine",
  "Policy Decision Engine",
  "Feature Flag Platform",
  "Fraud Detection Mesh",
  "Learning Recommendation System",
  "Executive Metrics Hub",
  "Document Intelligence Pipeline",
  "Autonomous QA Lab",
  "Global Release Command Center",
];

const ENTERPRISE_KEYWORDS = [
  "React",
  "TypeScript",
  "Supabase",
  "PostgreSQL",
  "RLS",
  "Deno Edge Functions",
  "Vite",
  "Playwright",
  "Vitest",
  "TanStack Query",
  "OpenTelemetry",
  "Kubernetes",
  "Terraform",
  "SOC 2",
  "SAML",
  "OIDC",
  "RBAC",
  "multi-tenant",
  "data governance",
  "event streaming",
  "AI evaluation",
  "feature flags",
  "real-time analytics",
  "zero trust",
  "cost optimization",
];

function buildProject(title: string, index: number) {
  const primary = ENTERPRISE_KEYWORDS[index % ENTERPRISE_KEYWORDS.length];
  const secondary = ENTERPRISE_KEYWORDS[(index + 7) % ENTERPRISE_KEYWORDS.length];
  const tertiary = ENTERPRISE_KEYWORDS[(index + 13) % ENTERPRISE_KEYWORDS.length];

  return {
    id: `project-${index + 1}`,
    title,
    organization: "ResumePreps Enterprise Lab",
    date: `202${index % 6}`,
    url: `https://example.com/projects/${index + 1}`,
    bullets: [
      `Architected ${primary} capability serving ${100_000 + index * 25_000}+ candidate workflows across ${3 + (index % 5)} regions`,
      `Implemented ${secondary} controls reducing operational review time by ${22 + index}% for enterprise administrators`,
      `Scaled ${tertiary} telemetry to ${2_000_000 + index * 100_000}+ events per month with deterministic quality gates`,
    ],
  };
}

function buildEnterpriseResume(): ResumeJSON {
  return {
    header: {
      name: "Avery Morgan",
      title: "Principal Enterprise AI Platform Engineer",
      email: "avery.morgan@example.com",
      phone: "+1 (555) 010-9000",
      location: "Remote, United States",
      linkedin: "linkedin.com/in/avery-morgan",
    },
    summary:
      "Principal enterprise AI platform engineer with 12+ years building secure multi-tenant SaaS systems, AI evaluation pipelines, and release governance programs for regulated customers. Led 30+ platform initiatives across identity, analytics, automation, and compliance while improving reliability by 45% and reducing operating cost by $4.2M annually.",
    experience: [
      {
        id: "exp-1",
        role: "Principal Enterprise AI Platform Engineer",
        company_or_client: "ResumePreps Cloud",
        start_date: "Jan 2022",
        end_date: "Present",
        location: "Remote",
        bullets: [
          "Architected multi-tenant AI platform handling 12M+ resume, job, and interview events with PostgreSQL RLS and audited Edge Functions",
          "Implemented SOC 2 evidence automation reducing monthly compliance preparation from 80 hours to 12 hours",
          "Optimized React and Vite delivery pipeline improving p95 route load time by 38% across enterprise dashboards",
          "Led 14 engineers through zero-trust identity rollout with SAML, OIDC, RBAC, and tenant-scoped access policies",
          "Established AI evaluation gates processing 1M+ synthetic and production-like scenarios before each release train",
        ],
      },
      {
        id: "exp-2",
        role: "Senior Full Stack Reliability Engineer",
        company_or_client: "Atlas Workflow Systems",
        start_date: "Mar 2018",
        end_date: "Dec 2021",
        location: "Austin, TX",
        bullets: [
          "Developed real-time observability fabric across 240+ services, reducing mean time to detect incidents by 52%",
          "Automated release verification with Playwright and Vitest suites covering 180+ enterprise user journeys",
          "Scaled event-streaming data model to 900K+ records per hour while preserving deterministic replay guarantees",
          "Partnered with security teams to remediate 96% of high-risk findings before production rollout",
        ],
      },
    ],
    education: [
      {
        id: "edu-1",
        degree: "Master of Science",
        field: "Computer Science",
        institution: "Georgia Institute of Technology",
        gpa: "3.9",
        graduation_date: "2017",
        location: "Atlanta, GA",
      },
    ],
    certifications: [
      {
        id: "cert-1",
        name: "AWS Certified Solutions Architect Professional",
        issuer: "Amazon Web Services",
        date: "2024",
      },
      {
        id: "cert-2",
        name: "Certified Kubernetes Administrator",
        issuer: "Cloud Native Computing Foundation",
        date: "2023",
      },
    ],
    skills: {
      frontend: ["React", "TypeScript", "Vite", "TanStack Query", "Accessibility", "Performance Engineering"],
      backend: ["Supabase", "PostgreSQL", "RLS", "Deno Edge Functions", "Event Streaming", "API Governance"],
      enterprise: ["SAML", "OIDC", "RBAC", "SOC 2", "Audit Logging", "Tenant Isolation"],
      qa: ["Playwright", "Vitest", "Synthetic Data", "AI Evaluation", "Load Modeling", "Release Gates"],
    },
    projects: ENTERPRISE_DOMAINS.map(buildProject),
    languages: [{ id: "lang-1", language: "English", proficiency: "Native" }],
    awards: [
      {
        id: "award-1",
        title: "Enterprise Reliability Transformation Award",
        issuer: "Atlas Workflow Systems",
        date: "2021",
      },
    ],
    volunteer: [],
  };
}

function buildMillionSignalJobDescription(): string {
  const signalCounts = new Map<string, number>();

  for (let i = 0; i < 1_000_000; i += 1) {
    const keyword = ENTERPRISE_KEYWORDS[i % ENTERPRISE_KEYWORDS.length];
    signalCounts.set(keyword, (signalCounts.get(keyword) ?? 0) + 1);
  }

  const topSignals = [...signalCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([keyword, count]) => `${keyword} mentioned ${count} times in enterprise demand telemetry`);

  return [
    "Principal Enterprise AI Platform Engineer role requiring secure SaaS architecture, real-time analytics, release governance, and customer-facing reliability leadership.",
    "Must demonstrate React, TypeScript, Supabase, PostgreSQL, RLS, Deno Edge Functions, Playwright, Vitest, RBAC, SAML, OIDC, SOC 2, AI evaluation, multi-tenant architecture, and cost optimization.",
    "Priority telemetry repeatedly emphasizes React, TypeScript, Supabase, PostgreSQL, Playwright, Vitest, React, TypeScript, Supabase, PostgreSQL, Playwright, and Vitest.",
    ...topSignals,
  ].join(" ");
}

describe("enterprise ATS scale validation", () => {
  it("validates a 30-project executive portfolio resume against enterprise ATS expectations", () => {
    const resume = buildEnterpriseResume();
    const result = calculateATSScore(resume, buildMillionSignalJobDescription());

    expect(resume.projects).toHaveLength(30);
    expect(result.overall).toBeGreaterThanOrEqual(90);
    expect(result.passesATS).toBe(true);
    expect(result.sections).toHaveLength(7);
    expect(result.sections.reduce((total, section) => total + section.maxScore, 0)).toBe(100);
    expect(result.issues.filter((issue) => issue.severity === "critical")).toHaveLength(0);
  });

  it("extracts stable top keywords from one million synthetic market signals without returning unbounded matches", () => {
    const resume = buildEnterpriseResume();
    const jobDescription = buildMillionSignalJobDescription();
    const matches = matchJobDescriptionKeywords(resume, jobDescription);
    const matchedKeywords = matches.filter((match) => match.found).map((match) => match.keyword);

    expect(matches.length).toBeGreaterThan(10);
    expect(matches.length).toBeLessThanOrEqual(25);
    expect(matchedKeywords).toEqual(
      expect.arrayContaining(["react", "typescript", "supabase", "postgresql", "playwright", "vitest"]),
    );
    expect(matches.every((match) => match.keyword.length > 2)).toBe(true);
  });

  it("keeps scoring bounded and surfaces parser risks for malformed enterprise-scale content", () => {
    const resume = buildEnterpriseResume();
    resume.header.name = "AVERY MORGAN <SCRIPT> 🚀";
    resume.experience[0].bullets.push(
      "Implemented\tfragile spreadsheet process with no quantified ownership and repeated repeated repeated symbols 🚀",
    );
    resume.projects[0].bullets.push("🚀 Launched résumé parser with emoji-heavy copy that should be flagged by ATS formatting checks");

    const result = calculateATSScore(resume, buildMillionSignalJobDescription());
    const issueIds = result.issues.map((issue) => issue.id);

    expect(result.overall).toBeGreaterThanOrEqual(0);
    expect(result.overall).toBeLessThanOrEqual(100);
    expect(issueIds).toEqual(expect.arrayContaining(["h-name-case", "h-name-chars", "f-emoji", "f-tabs"]));
    expect(result.issues.some((issue) => issue.severity === "critical")).toBe(true);
  });
});
