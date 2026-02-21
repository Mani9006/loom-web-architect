import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { calculateATSScore, matchJobDescriptionKeywords } from "@/lib/ats-scorer";
import type { ResumeJSON } from "@/types/resume";

/**
 * KAN-21: ATS Quality Validation Test Suite
 *
 * Tests the ATS scoring engine for:
 * 1. Score stability (baseline vs post-hardening, target <5% variance)
 * 2. Keyword extraction consistency across industries
 * 3. LaTeX compilation accuracy (if applicable)
 * 4. Cross-industry resume parsing
 *
 * Sample resumes cover:
 * - Tech/Software Engineering
 * - Finance/Accounting
 * - Healthcare/Medical
 * - Consulting/Management
 */

// ─── Sample Resumes by Industry ─────────────────────────────────────────────

const TECH_ENGINEER_RESUME: ResumeJSON = {
  header: {
    name: "Sarah Chen",
    title: "Senior Software Engineer",
    email: "sarah.chen@tech.com",
    phone: "+1 (555) 123-4567",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/sarah-chen",
  },
  summary:
    "Senior software engineer with 8+ years building scalable systems at Fortune 500 tech companies. Expertise in cloud architecture, microservices, and team leadership. Passionate about mentoring engineers and driving technical excellence.",
  experience: [
    {
      role: "Senior Software Engineer",
      company_or_client: "TechCorp Inc",
      start_date: "Jan 2022",
      end_date: "Present",
      location: "San Francisco, CA",
      bullets: [
        "Led architecture redesign for microservices platform, reducing latency by 40% and supporting 10M+ daily requests",
        "Mentored team of 6 junior engineers, conducting weekly code reviews and technical workshops",
        "Implemented automated testing pipeline improving deployment frequency from weekly to daily releases",
        "Designed and deployed Kubernetes infrastructure managing 50+ containerized services across 3 regions",
        "Collaborated with product team to deliver 12 major features, each impacting 2M+ active users",
      ],
    },
    {
      role: "Software Engineer II",
      company_or_client: "CloudStart Systems",
      start_date: "Jun 2019",
      end_date: "Dec 2021",
      location: "Mountain View, CA",
      bullets: [
        "Developed real-time analytics engine processing 500K events/second using Apache Kafka and Apache Spark",
        "Optimized database queries reducing average response time from 2s to 200ms across 15 mission-critical endpoints",
        "Built CI/CD pipeline using Jenkins and Docker, increasing developer productivity by 35%",
        "Implemented comprehensive monitoring using Prometheus and Grafana across entire infrastructure",
      ],
    },
  ],
  education: [
    {
      degree: "Bachelor's",
      field: "Computer Science",
      institution: "UC Berkeley",
      gpa: "3.8",
      graduation_date: "May 2018",
      location: "Berkeley, CA",
    },
  ],
  certifications: [
    {
      name: "AWS Certified Solutions Architect Professional",
      issuer: "Amazon Web Services",
      date: "2021",
    },
    {
      name: "Kubernetes Application Developer",
      issuer: "Linux Foundation",
      date: "2022",
    },
  ],
  skills: {
    programming_languages: ["Python", "Java", "Go", "TypeScript", "SQL"],
    frameworks: ["Spring Boot", "FastAPI", "React", "Node.js"],
    cloud_mlops: ["AWS", "Google Cloud", "Kubernetes", "Docker"],
    databases: ["PostgreSQL", "MongoDB", "Redis", "Elasticsearch"],
    devops: ["Jenkins", "GitLab CI", "Terraform", "Ansible"],
    big_data: ["Apache Kafka", "Apache Spark", "Hadoop"],
  },
  projects: [
    {
      title: "Distributed Cache Layer",
      organization: "TechCorp",
      date: "2023",
      bullets: [
        "Architected distributed cache reducing database load by 70%",
        "Improved application throughput from 1K to 50K requests/second",
      ],
    },
  ],
};

const FINANCE_ACCOUNTANT_RESUME: ResumeJSON = {
  header: {
    name: "Michael Rodriguez",
    title: "Senior Financial Analyst",
    email: "m.rodriguez@finance.com",
    phone: "+1 (555) 234-5678",
    location: "New York, NY",
    linkedin: "linkedin.com/in/michael-rodriguez",
  },
  summary:
    "Senior Financial Analyst with 9+ years of experience in corporate finance, investment analysis, and financial planning. Proven track record managing $500M+ in assets and delivering strategic insights to C-level executives.",
  experience: [
    {
      role: "Senior Financial Analyst",
      company_or_client: "Goldman Sachs",
      start_date: "Feb 2021",
      end_date: "Present",
      location: "New York, NY",
      bullets: [
        "Analyzed 50+ acquisition targets, preparing investment recommendations resulting in $2.3B in funded deals",
        "Developed financial models for enterprise valuation, improving forecast accuracy to 98%",
        "Managed portfolio of $500M+ assets, achieving 22% annual return vs 18% benchmark",
        "Led cross-functional team of 8 analysts coordinating quarterly business reviews with 15 senior executives",
        "Implemented automated reporting system reducing month-end close process from 10 days to 3 days",
      ],
    },
    {
      role: "Financial Analyst",
      company_or_client: "Morgan Stanley",
      start_date: "Jul 2018",
      end_date: "Jan 2021",
      location: "New York, NY",
      bullets: [
        "Conducted due diligence on 30+ equity investments for private equity firm managing $10B+ assets under management",
        "Created financial forecasts and variance analysis reducing budget variances by 40%",
        "Established key performance indicators and dashboards for 25+ business units",
        "Collaborated with external auditors ensuring SOX 404 compliance across financial systems",
      ],
    },
  ],
  education: [
    {
      degree: "MBA",
      field: "Finance",
      institution: "Harvard Business School",
      gpa: "3.7",
      graduation_date: "May 2018",
      location: "Boston, MA",
    },
    {
      degree: "Bachelor's",
      field: "Economics",
      institution: "Cornell University",
      gpa: "3.9",
      graduation_date: "May 2015",
      location: "Ithaca, NY",
    },
  ],
  certifications: [
    {
      name: "Chartered Financial Analyst (CFA) Level III",
      issuer: "CFA Institute",
      date: "2020",
    },
  ],
  skills: {
    programming_languages: ["Python", "SQL", "VBA"],
    frameworks: ["Financial modeling", "FP&A", "Corporate Finance"],
    databases: ["Bloomberg", "FactSet", "S&P Capital IQ"],
    devops: ["Excel", "Tableau", "Power BI"],
    collaboration_tools: ["SAP", "Hyperion", "Anaplan"],
  },
  projects: [
    {
      title: "Enterprise Budget Automation",
      organization: "Goldman Sachs",
      date: "2022",
      bullets: [
        "Automated annual budget consolidation process across 200+ cost centers",
        "Reduced manual effort by 800+ hours annually",
      ],
    },
  ],
};

const HEALTHCARE_PROVIDER_RESUME: ResumeJSON = {
  header: {
    name: "Dr. Jennifer Martinez",
    title: "Registered Nurse, Critical Care",
    email: "j.martinez@healthcare.com",
    phone: "+1 (555) 345-6789",
    location: "Los Angeles, CA",
    linkedin: "linkedin.com/in/jen-martinez",
  },
  summary:
    "Dedicated Registered Nurse with 10+ years of critical care experience in ICU/CCU settings. Specialized in trauma and cardiac nursing with proven ability to manage complex patient cases and mentor clinical staff. Strong advocate for patient safety and evidence-based practice.",
  experience: [
    {
      role: "Clinical Nurse Leader, Trauma ICU",
      company_or_client: "Cedar-Sinai Medical Center",
      start_date: "Mar 2021",
      end_date: "Present",
      location: "Los Angeles, CA",
      bullets: [
        "Supervised 25+ nurses and nursing assistants across 40-bed trauma ICU with 95% occupancy rate",
        "Implemented evidence-based pressure injury prevention protocol reducing hospital-acquired infections by 35%",
        "Managed staff scheduling and resource allocation for 24/7 operations maintaining 98% staffing compliance",
        "Mentored 12 new graduate nurses through structured orientation program with 100% retention rate",
        "Developed clinical competency assessments improving care quality metrics to top 10% nationally",
      ],
    },
    {
      role: "Critical Care Registered Nurse",
      company_or_client: "UCLA Medical Center",
      start_date: "Aug 2017",
      end_date: "Feb 2021",
      location: "Los Angeles, CA",
      bullets: [
        "Provided direct patient care for 4-6 critically ill patients in 12-hour shifts",
        "Maintained 100% compliance with infection control protocols across all ICU admissions",
        "Collaborated with interdisciplinary team to develop individualized care plans for 500+ patients annually",
        "Recognized as Nurse of the Year 2019 for exceptional patient advocacy and clinical expertise",
      ],
    },
  ],
  education: [
    {
      degree: "Bachelor of Science",
      field: "Nursing",
      institution: "University of California, Los Angeles",
      gpa: "3.8",
      graduation_date: "May 2014",
      location: "Los Angeles, CA",
    },
    {
      degree: "Associate's",
      field: "Nursing",
      institution: "Santa Monica College",
      gpa: "4.0",
      graduation_date: "May 2012",
      location: "Santa Monica, CA",
    },
  ],
  certifications: [
    {
      name: "CCRN-K (Critical Care Registered Nurse - Certification)",
      issuer: "AACN Certification",
      date: "2019",
    },
    {
      name: "Advanced Cardiac Life Support (ACLS)",
      issuer: "American Heart Association",
      date: "2024",
    },
    {
      name: "Pediatric Advanced Life Support (PALS)",
      issuer: "American Heart Association",
      date: "2024",
    },
  ],
  skills: {
    programming_languages: ["EHR systems", "Electronic Medical Records"],
    frameworks: ["Patient care management", "Clinical protocols"],
    databases: ["Epic EHR", "Cerner", "MediConnect"],
    devops: ["Wound care", "Cardiac monitoring", "Mechanical ventilation"],
    collaboration_tools: ["Medical devices", "IV therapy", "Medication administration"],
  },
  projects: [
    {
      title: "ICU Safety Initiative",
      organization: "Cedar-Sinai Medical Center",
      date: "2023",
      bullets: [
        "Led multidisciplinary task force improving patient safety metrics",
        "Achieved 12-month streak with zero preventable adverse events",
      ],
    },
  ],
};

const CONSULTING_MANAGER_RESUME: ResumeJSON = {
  header: {
    name: "James Wilson",
    title: "Senior Management Consultant",
    email: "j.wilson@consulting.com",
    phone: "+1 (555) 456-7890",
    location: "Chicago, IL",
    linkedin: "linkedin.com/in/james-wilson-consulting",
  },
  summary:
    "Senior Management Consultant with 11+ years driving digital transformation and operational excellence across Fortune 500 companies. Expert in strategy development, M&A integration, and organizational change. Led $250M+ in client engagements.",
  experience: [
    {
      role: "Principal Consultant",
      company_or_client: "McKinsey & Company",
      start_date: "Sep 2020",
      end_date: "Present",
      location: "Chicago, IL",
      bullets: [
        "Led 12+ consulting engagements for Global 100 clients in healthcare, finance, and technology sectors",
        "Advised C-suite executives on strategic initiatives resulting in $500M+ in cost savings and revenue uplifts",
        "Managed team of 25+ consultants coordinating complex multi-year transformation programs",
        "Developed and delivered custom training for 200+ client stakeholders on digital transformation best practices",
        "Published 3 thought leadership pieces in Harvard Business Review reaching 500K+ readers",
      ],
    },
    {
      role: "Senior Consultant",
      company_or_client: "Bain & Company",
      start_date: "Jun 2017",
      end_date: "Aug 2020",
      location: "Boston, MA",
      bullets: [
        "Executed 15+ engagements in operations optimization and M&A strategy for technology and healthcare sectors",
        "Developed comprehensive business cases and financial models for 8 C-suite board presentations",
        "Managed client relationships and project delivery across $45M in annual engagements",
        "Promoted to Senior Consultant based on exceptional project delivery and client impact metrics",
      ],
    },
  ],
  education: [
    {
      degree: "MBA",
      field: "Business Administration",
      institution: "Stanford Graduate School of Business",
      gpa: "3.8",
      graduation_date: "May 2017",
      location: "Stanford, CA",
    },
    {
      degree: "Bachelor's",
      field: "Industrial Engineering",
      institution: "Georgia Tech",
      gpa: "3.9",
      graduation_date: "May 2015",
      location: "Atlanta, GA",
    },
  ],
  certifications: [
    {
      name: "Six Sigma Black Belt",
      issuer: "American Society for Quality",
      date: "2019",
    },
  ],
  skills: {
    programming_languages: ["Python", "SQL", "R"],
    frameworks: ["Lean", "Six Sigma", "Change Management"],
    databases: ["Tableau", "Power BI", "Business Objects"],
    devops: ["Project management", "Agile", "Scrum"],
    collaboration_tools: ["Microsoft Office", "Salesforce", "SAP"],
  },
  projects: [
    {
      title: "Digital Transformation Program",
      organization: "McKinsey & Company",
      date: "2022",
      bullets: [
        "Transformed enterprise operating model for Healthcare Fortune 100 client",
        "Delivered 25% operational efficiency gains exceeding targets by $120M",
      ],
    },
  ],
};

// ─── Baseline ATS Scores (Post-Hardening Reference) ─────────────────────────

interface BaselineMetrics {
  minScore: number;
  maxScore: number;
  targetScore: number;
  variance: number; // Target <5%
}

const EXPECTED_BASELINES: Record<string, BaselineMetrics> = {
  "Tech Engineer": { minScore: 95, maxScore: 100, targetScore: 99, variance: 0.05 },
  "Finance Analyst": { minScore: 95, maxScore: 100, targetScore: 98, variance: 0.05 },
  "Healthcare Provider": { minScore: 90, maxScore: 100, targetScore: 96, variance: 0.05 },
  "Consulting Manager": { minScore: 95, maxScore: 100, targetScore: 97, variance: 0.05 },
};

// ─── Test Suite ─────────────────────────────────────────────────────────────

describe("ATS Quality Validation (KAN-21)", () => {
  let testResults: Array<{
    industry: string;
    resume: string;
    score: number;
    passesATS: boolean;
    issueCount: number;
  }> = [];

  beforeAll(() => {
    console.log("\n📋 Starting ATS Quality Validation Test Suite");
    console.log("=".repeat(60));
  });

  afterAll(() => {
    console.log("\n" + "=".repeat(60));
    console.log("📊 Test Results Summary");
    console.log("=".repeat(60));
    testResults.forEach((result) => {
      const status = result.passesATS ? "✓ PASS" : "✗ FAIL";
      console.log(
        `${status} | ${result.industry.padEnd(20)} | Score: ${result.score}/100 | Issues: ${result.issueCount}`
      );
    });

    // Variance analysis
    const scores = testResults.map((r) => r.score);
    const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance =
      Math.sqrt(scores.reduce((sq, n) => sq + Math.pow(n - avgScore, 2), 0) / scores.length) /
      avgScore;

    console.log("\n📈 Score Stability Metrics:");
    console.log(`   Average Score: ${avgScore.toFixed(2)}/100`);
    console.log(`   Std Deviation: ${(variance * 100).toFixed(2)}%`);
    console.log(
      `   Variance Target: <5% ✓${variance < 0.05 ? " PASS" : " FAIL"}`
    );
  });

  // ─── Individual Resume Tests ─────────────────────────────────────────────

  describe("Tech/Software Engineering Resume", () => {
    it("should score Senior Software Engineer resume with ATS compliance", () => {
      const score = calculateATSScore(TECH_ENGINEER_RESUME);

      console.log("\n🖥️  Tech Engineer Resume Analysis:");
      console.log(`   Overall Score: ${score.overall}/100`);
      console.log(`   Passes ATS: ${score.passesATS}`);
      console.log(`   Summary: ${score.summary}`);

      testResults.push({
        industry: "Tech Engineer",
        resume: "Sarah Chen",
        score: score.overall,
        passesATS: score.passesATS,
        issueCount: score.issues.length,
      });

      expect(score.overall).toBeGreaterThanOrEqual(EXPECTED_BASELINES["Tech Engineer"].minScore);
      expect(score.overall).toBeLessThanOrEqual(EXPECTED_BASELINES["Tech Engineer"].maxScore);
      expect(score.passesATS).toBe(true);
      expect(score.issues.length).toBeLessThan(5); // Should have minimal critical issues
    });

    it("should extract keywords from tech job description accurately", () => {
      const jobDescription = `
        We are seeking a Senior Software Engineer with experience in:
        - Cloud Architecture (AWS, GCP, Azure)
        - Microservices and Kubernetes
        - Python, Java, Go
        - PostgreSQL and distributed databases
        - CI/CD pipelines and DevOps
        - Team leadership and mentoring
        - Apache Kafka and real-time systems
      `;

      const keywords = matchJobDescriptionKeywords(TECH_ENGINEER_RESUME, jobDescription);
      const matchedCount = keywords.filter((k) => k.found).length;

      console.log(`   Keywords Matched: ${matchedCount}/${keywords.length}`);

      expect(matchedCount).toBeGreaterThan(10);
      expect(matchedCount / keywords.length).toBeGreaterThan(0.6);
    });

    it("should identify no critical formatting issues", () => {
      const score = calculateATSScore(TECH_ENGINEER_RESUME);
      const criticalIssues = score.issues.filter((i) => i.severity === "critical");

      expect(criticalIssues.length).toBe(0);
    });
  });

  describe("Finance/Accounting Resume", () => {
    it("should score Senior Financial Analyst resume with ATS compliance", () => {
      const score = calculateATSScore(FINANCE_ACCOUNTANT_RESUME);

      console.log("\n💰 Finance Analyst Resume Analysis:");
      console.log(`   Overall Score: ${score.overall}/100`);
      console.log(`   Passes ATS: ${score.passesATS}`);
      console.log(`   Summary: ${score.summary}`);

      testResults.push({
        industry: "Finance Analyst",
        resume: "Michael Rodriguez",
        score: score.overall,
        passesATS: score.passesATS,
        issueCount: score.issues.length,
      });

      expect(score.overall).toBeGreaterThanOrEqual(EXPECTED_BASELINES["Finance Analyst"].minScore);
      expect(score.overall).toBeLessThanOrEqual(EXPECTED_BASELINES["Finance Analyst"].maxScore);
      expect(score.passesATS).toBe(true);
    });

    it("should extract financial keywords correctly", () => {
      const jobDescription = `
        Senior Financial Analyst - Investment Banking Division
        Requirements:
        - 5+ years financial analysis and modeling
        - M&A and valuation experience
        - Excel, VBA, Python
        - Bloomberg Terminal and FactSet
        - Financial forecasting and FP&A
        - CFA Level II or III preferred
      `;

      const keywords = matchJobDescriptionKeywords(FINANCE_ACCOUNTANT_RESUME, jobDescription);
      const matchedCount = keywords.filter((k) => k.found).length;

      console.log(`   Keywords Matched: ${matchedCount}/${keywords.length}`);

      expect(matchedCount).toBeGreaterThan(8);
    });

    it("should verify quantified achievements in experience", () => {
      const score = calculateATSScore(FINANCE_ACCOUNTANT_RESUME);
      const experienceSection = score.sections.find((s) => s.section === "Work Experience");

      expect(experienceSection?.score).toBeGreaterThan(20);
    });
  });

  describe("Healthcare/Medical Resume", () => {
    it("should score Clinical Nurse Leader resume with ATS compliance", () => {
      const score = calculateATSScore(HEALTHCARE_PROVIDER_RESUME);

      console.log("\n⚕️  Healthcare Provider Resume Analysis:");
      console.log(`   Overall Score: ${score.overall}/100`);
      console.log(`   Passes ATS: ${score.passesATS}`);
      console.log(`   Summary: ${score.summary}`);

      testResults.push({
        industry: "Healthcare Provider",
        resume: "Dr. Jennifer Martinez",
        score: score.overall,
        passesATS: score.passesATS,
        issueCount: score.issues.length,
      });

      expect(score.overall).toBeGreaterThanOrEqual(EXPECTED_BASELINES["Healthcare Provider"].minScore);
      expect(score.overall).toBeLessThanOrEqual(EXPECTED_BASELINES["Healthcare Provider"].maxScore);
      expect(score.passesATS).toBe(true);
    });

    it("should handle medical certifications correctly", () => {
      const score = calculateATSScore(HEALTHCARE_PROVIDER_RESUME);
      const issues = score.issues;

      const certIssues = issues.filter((i) => i.section.includes("Certification"));
      expect(certIssues.length).toBe(0);
    });

    it("should extract healthcare-specific keywords", () => {
      const jobDescription = `
        Clinical Nurse Leader - ICU
        Requirements:
        - CCRN certification required
        - 5+ years critical care experience
        - ACLS and PALS certifications
        - Epic or Cerner EHR experience
        - Nurse leadership experience
        - Patient safety focus
      `;

      const keywords = matchJobDescriptionKeywords(HEALTHCARE_PROVIDER_RESUME, jobDescription);
      const matchedCount = keywords.filter((k) => k.found).length;

      console.log(`   Keywords Matched: ${matchedCount}/${keywords.length}`);

      expect(matchedCount).toBeGreaterThan(8);
    });
  });

  describe("Consulting/Management Resume", () => {
    it("should score Principal Consultant resume with ATS compliance", () => {
      const score = calculateATSScore(CONSULTING_MANAGER_RESUME);

      console.log("\n📊 Consulting Manager Resume Analysis:");
      console.log(`   Overall Score: ${score.overall}/100`);
      console.log(`   Passes ATS: ${score.passesATS}`);
      console.log(`   Summary: ${score.summary}`);

      testResults.push({
        industry: "Consulting Manager",
        resume: "James Wilson",
        score: score.overall,
        passesATS: score.passesATS,
        issueCount: score.issues.length,
      });

      expect(score.overall).toBeGreaterThanOrEqual(EXPECTED_BASELINES["Consulting Manager"].minScore);
      expect(score.overall).toBeLessThanOrEqual(EXPECTED_BASELINES["Consulting Manager"].maxScore);
      expect(score.passesATS).toBe(true);
    });

    it("should verify action verbs in consulting experience", () => {
      const score = calculateATSScore(CONSULTING_MANAGER_RESUME);
      const actionVerbIssues = score.issues.filter((i) =>
        i.title.toLowerCase().includes("action verb")
      );

      expect(actionVerbIssues.length).toBeLessThan(2);
    });

    it("should extract consulting industry keywords", () => {
      const jobDescription = `
        Management Consultant - Strategy & Transformation
        Requirements:
        - 8+ years consulting experience
        - Change management expertise
        - M&A and digital transformation
        - Python, Tableau, Power BI
        - Stakeholder management
        - Six Sigma or Lean experience
      `;

      const keywords = matchJobDescriptionKeywords(CONSULTING_MANAGER_RESUME, jobDescription);
      const matchedCount = keywords.filter((k) => k.found).length;

      console.log(`   Keywords Matched: ${matchedCount}/${keywords.length}`);

      expect(matchedCount).toBeGreaterThan(8);
    });
  });

  // ─── Cross-Industry Consistency Tests ─────────────────────────────────────

  describe("Cross-Industry Consistency", () => {
    it("should maintain consistent scoring methodology across industries", () => {
      const resumes = [
        TECH_ENGINEER_RESUME,
        FINANCE_ACCOUNTANT_RESUME,
        HEALTHCARE_PROVIDER_RESUME,
        CONSULTING_MANAGER_RESUME,
      ];

      const scores = resumes.map((r) => calculateATSScore(r).overall);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const maxScore = Math.max(...scores);
      const minScore = Math.min(...scores);
      const scoreRange = maxScore - minScore;

      console.log("\n🔄 Cross-Industry Consistency Check:");
      console.log(`   Average Score: ${avgScore.toFixed(2)}/100`);
      console.log(`   Score Range: ${minScore}-${maxScore} (spread: ${scoreRange})`);

      // Scores should be relatively close (not more than 15 points spread)
      expect(scoreRange).toBeLessThan(20);
      expect(avgScore).toBeGreaterThan(80);
    });

    it("should enforce minimum passing score across all industries", () => {
      const resumes = [
        TECH_ENGINEER_RESUME,
        FINANCE_ACCOUNTANT_RESUME,
        HEALTHCARE_PROVIDER_RESUME,
        CONSULTING_MANAGER_RESUME,
      ];

      resumes.forEach((resume) => {
        const score = calculateATSScore(resume);
        expect(score.overall).toBeGreaterThanOrEqual(70); // Minimum passing
      });
    });

    it("should have <5% variance in scores", () => {
      const resumes = [
        TECH_ENGINEER_RESUME,
        FINANCE_ACCOUNTANT_RESUME,
        HEALTHCARE_PROVIDER_RESUME,
        CONSULTING_MANAGER_RESUME,
      ];

      const scores = resumes.map((r) => calculateATSScore(r).overall);
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
      const variance =
        Math.sqrt(scores.reduce((sq, n) => sq + Math.pow(n - avgScore, 2), 0) / scores.length) /
        avgScore;

      console.log(`\n📉 Score Variance Analysis:`);
      console.log(`   Coefficient of Variation: ${(variance * 100).toFixed(2)}%`);
      console.log(`   Target: <5%`);

      expect(variance).toBeLessThan(0.05);
    });
  });

  // ─── Keyword Extraction Consistency ──────────────────────────────────────

  describe("Keyword Extraction Consistency", () => {
    it("should extract consistent number of keywords", () => {
      const jobDesc = "software engineer with 5+ years experience in Python, AWS, and microservices";
      const resumes = [
        TECH_ENGINEER_RESUME,
        FINANCE_ACCOUNTANT_RESUME,
        HEALTHCARE_PROVIDER_RESUME,
        CONSULTING_MANAGER_RESUME,
      ];

      const keywordCounts = resumes.map((r) => matchJobDescriptionKeywords(r, jobDesc).length);
      const uniqueCounts = new Set(keywordCounts);

      // Keyword extraction should be consistent (same number of keywords extracted)
      expect(uniqueCounts.size).toBeLessThanOrEqual(2); // Allow minor variance
    });

    it("should match relevant keywords accurately", () => {
      const jobDesc =
        "Led teams, managed budgets, Python programming, data analysis, strategic planning";

      const keywords = matchJobDescriptionKeywords(CONSULTING_MANAGER_RESUME, jobDesc);
      const found = keywords.filter((k) => k.found);

      // Should find leadership and strategic keywords
      expect(found.length).toBeGreaterThanOrEqual(2);
    });

    it("should handle edge case - empty job description", () => {
      const emptyJobDesc = "";
      const keywords = matchJobDescriptionKeywords(TECH_ENGINEER_RESUME, emptyJobDesc);

      expect(keywords).toEqual([]);
    });

    it("should handle edge case - very long job description", () => {
      const longJobDesc = Array(100)
        .fill("software engineer python java microservices aws kubernetes docker")
        .join(" ");

      const keywords = matchJobDescriptionKeywords(TECH_ENGINEER_RESUME, longJobDesc);

      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.length).toBeLessThan(50); // Should still limit to top keywords
    });
  });

  // ─── Section Score Distribution ──────────────────────────────────────────

  describe("Section Score Distribution", () => {
    it("should weight sections appropriately", () => {
      const score = calculateATSScore(TECH_ENGINEER_RESUME);

      const experienceSection = score.sections.find((s) => s.section === "Work Experience");
      const skillsSection = score.sections.find((s) => s.section === "Skills");
      const headerSection = score.sections.find((s) => s.section === "Contact Info");

      // Experience should be heavily weighted (max 30)
      expect(experienceSection?.maxScore).toBe(30);
      // Skills should be 15
      expect(skillsSection?.maxScore).toBe(15);
      // Header should be 10
      expect(headerSection?.maxScore).toBe(10);
    });

    it("should have all sections present", () => {
      const score = calculateATSScore(TECH_ENGINEER_RESUME);

      const expectedSections = [
        "Contact Info",
        "Professional Summary",
        "Work Experience",
        "Education",
        "Skills",
        "Formatting",
        "Content Quality",
      ];

      const scoredSections = score.sections.map((s) => s.section);
      expectedSections.forEach((section) => {
        expect(scoredSections).toContain(section);
      });
    });

    it("should not exceed max score of 100", () => {
      const resumes = [
        TECH_ENGINEER_RESUME,
        FINANCE_ACCOUNTANT_RESUME,
        HEALTHCARE_PROVIDER_RESUME,
        CONSULTING_MANAGER_RESUME,
      ];

      resumes.forEach((resume) => {
        const score = calculateATSScore(resume);
        expect(score.overall).toBeLessThanOrEqual(100);
      });
    });
  });

  // ─── Issue Detection and Severity ────────────────────────────────────────

  describe("Issue Detection and Severity", () => {
    it("should correctly categorize issue severity", () => {
      const score = calculateATSScore(TECH_ENGINEER_RESUME);

      const criticalCount = score.issues.filter((i) => i.severity === "critical").length;
      const warningCount = score.issues.filter((i) => i.severity === "warning").length;
      const suggestionCount = score.issues.filter((i) => i.severity === "suggestion").length;

      console.log(
        `\n   Issue Distribution: ${criticalCount} critical, ${warningCount} warnings, ${suggestionCount} suggestions`
      );

      // Well-formed resume should have minimal critical issues
      expect(criticalCount).toBe(0);
    });

    it("should provide actionable fix suggestions", () => {
      // Create a minimal resume to trigger issues
      const poorResume: ResumeJSON = {
        header: {
          name: "",
          title: "",
          email: "invalid-email",
          phone: "",
          location: "",
          linkedin: "",
        },
        summary: "Brief",
        experience: [],
        education: [],
        certifications: [],
        skills: {},
        projects: [],
      };

      const score = calculateATSScore(poorResume);
      const issuesWithFix = score.issues.filter((i) => i.fix);

      expect(issuesWithFix.length).toBeGreaterThan(0);
    });
  });

  // ─── Regression Detection ────────────────────────────────────────────────

  describe("Regression Detection", () => {
    it("should detect missing critical sections", () => {
      const incompleteResume: ResumeJSON = {
        ...TECH_ENGINEER_RESUME,
        skills: {}, // Missing skills
      };

      const score = calculateATSScore(incompleteResume);
      const criticalIssues = score.issues.filter((i) => i.severity === "critical");

      const hasSkillsIssue = criticalIssues.some((i) =>
        i.title.toLowerCase().includes("skill")
      );

      expect(hasSkillsIssue).toBe(true);
    });

    it("should detect formatting regressions", () => {
      const resumeWithTabs: ResumeJSON = {
        ...TECH_ENGINEER_RESUME,
        experience: [
          {
            ...TECH_ENGINEER_RESUME.experience[0],
            bullets: ["\tLeading with tab character instead of space"],
          },
        ],
      };

      const score = calculateATSScore(resumeWithTabs);
      const formattingIssues = score.issues.filter((i) =>
        i.title.toLowerCase().includes("tab")
      );

      expect(formattingIssues.length).toBeGreaterThan(0);
    });

    it("should detect inconsistent date formats", () => {
      const inconsistentDateResume: ResumeJSON = {
        ...TECH_ENGINEER_RESUME,
        experience: [
          ...TECH_ENGINEER_RESUME.experience,
          {
            role: "Test Role",
            company_or_client: "Test Corp",
            start_date: "01/2020", // Different format
            end_date: "Dec 2021",
            location: "Test",
            bullets: ["Test bullet"],
          },
        ],
      };

      const score = calculateATSScore(inconsistentDateResume);
      const dateFormatIssues = score.issues.filter((i) =>
        i.title.toLowerCase().includes("date format")
      );

      expect(dateFormatIssues.length).toBeGreaterThan(0);
    });
  });
});
