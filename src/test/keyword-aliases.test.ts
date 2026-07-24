/**
 * keyword-aliases — honesty-gated JD keyword admissibility, skills rebuild,
 * and summary coverage for the tailor pipeline.
 *
 * Central guarantee under test: the alias map can ONLY foreground a JD
 * keyword when the base resume already evidences it. It can never insert an
 * unsupported keyword (no fabrication), and the deterministic scorer's
 * tokenization no longer drops sentence-final evidence ("systems." → systems).
 */
import { describe, expect, it } from "vitest";
import {
  computeKeywordScore,
  normalizeForMatch,
  resumeToPlainText,
  scoreResumeDeterministic,
} from "../../supabase/functions/_shared/ats-deterministic";
import {
  augmentSummaryCoverage,
  isApplicationSnapshot,
  isKeywordEvidenced,
  rebuildSkillsForJob,
  splitKeywordsByEvidence,
} from "../../supabase/functions/_shared/keyword-aliases";

const ML_RESUME_TEXT = [
  "AI/ML Engineer with 3 years deploying advanced machine learning systems.",
  "Engineered ML features using behavioral and event-level data for fraud-risk scoring and anomaly-detection models used in financial systems.",
  "Used Python, SQL, and Pandas to clean, engineer, and model marketing datasets for predicting engagement patterns.",
  "Created automated dashboards in Tableau and Python (Plotly/Matplotlib) to track funnel performance.",
  "Automated data cleansing processes for ingestion of regulatory documents.",
  "Worked with large-scale datasets using PySpark on Hadoop-based data environments, leveraging HDFS and Hive-style tables for distributed processing.",
  "Skills: Python, SQL, PySpark, R, XGBoost, Tableau, Power BI, Plotly, Snowflake, GCP BigQuery, PostgreSQL, SQL Server, Kubernetes, Docker, Airflow, dbt",
].join("\n");

describe("normalizeForMatch tokenization", () => {
  it("does not glue sentence-final periods to tokens", () => {
    expect(normalizeForMatch("models used in financial systems.")).toContain(" systems");
    expect(normalizeForMatch("models used in financial systems.").split(" ")).toContain("systems");
  });
  it("keeps interior dots in tech names", () => {
    expect(normalizeForMatch("Built with Node.js at scale.")).toContain("node.js");
  });
  it("keyword coverage matches sentence-final evidence", () => {
    const r = computeKeywordScore(
      "Engineered features for anomaly-detection models used in financial systems. Worked with distributed processing on data platforms.",
      ["Distributed data systems"],
    );
    expect(r.matched).toEqual(["Distributed data systems"]);
  });
});

describe("isKeywordEvidenced (honesty gate)", () => {
  it("admits JD keywords backed by aliases of real evidence", () => {
    expect(isKeywordEvidenced("Machine learning", ML_RESUME_TEXT)).toBe(true); // "ML" bullets
    expect(isKeywordEvidenced("Data science", "Role: Data Scientist at Acme")).toBe(true);
    expect(isKeywordEvidenced("Data wrangling", ML_RESUME_TEXT)).toBe(true); // data cleansing
    expect(isKeywordEvidenced("Data visualization", ML_RESUME_TEXT)).toBe(true); // dashboards/Tableau
    expect(isKeywordEvidenced("Data warehousing", ML_RESUME_TEXT)).toBe(true); // Snowflake/BigQuery
    expect(isKeywordEvidenced("Advanced SQL", ML_RESUME_TEXT)).toBe(true); // advanced + SQL
    expect(isKeywordEvidenced("Complex queries", ML_RESUME_TEXT)).toBe(true); // SQL on large datasets
    expect(isKeywordEvidenced("SQL", "Skills: PostgreSQL, MySQL")).toBe(true); // exact tech shown
    expect(isKeywordEvidenced("Quantitative analysis", "Built statistical models and regression analyses for forecasting.")).toBe(true);
    expect(isKeywordEvidenced("Instrumentation", "Implemented model monitoring, telemetry, and metrics collection.")).toBe(true);
    expect(isKeywordEvidenced("Experimentation design", "Designed A/B tests and performed hypothesis testing.")).toBe(true);
  });
  it("NEVER admits unsupported keywords (no fabrication)", () => {
    expect(isKeywordEvidenced("Kubernetes", "Built dashboards in Excel for sales tracking.")).toBe(false);
    expect(isKeywordEvidenced("People analytics", ML_RESUME_TEXT)).toBe(false);
    expect(isKeywordEvidenced("HR analytics", ML_RESUME_TEXT)).toBe(false);
    expect(isKeywordEvidenced("Terraform", ML_RESUME_TEXT)).toBe(false);
    expect(isKeywordEvidenced("Kafka", ML_RESUME_TEXT)).toBe(false);
    expect(isKeywordEvidenced("SQL", "Built dashboards and wrote reports.")).toBe(false);
    expect(isKeywordEvidenced("Experimentation design", "Built machine-learning models in Python.")).toBe(false);
    expect(isKeywordEvidenced("Econometrics", "Built statistical models and regression analyses.")).toBe(false);
    expect(isKeywordEvidenced("Instrumentation", "Reported business metrics in a dashboard.")).toBe(false);
  });
  it("splitKeywordsByEvidence partitions without loss", () => {
    const { evidenced, unevidenced } = splitKeywordsByEvidence(
      ["Machine learning", "People analytics", "Data wrangling", "HR analytics"],
      ML_RESUME_TEXT,
    );
    expect(evidenced).toEqual(["Machine learning", "Data wrangling"]);
    expect(unevidenced).toEqual(["People analytics", "HR analytics"]);
  });
});

describe("rebuildSkillsForJob", () => {
  const sourceSkills = {
    programming_languages: ["Python", "SQL", "PySpark", "R", "Bash"],
    analytics_bi: ["Tableau", "Power BI", "Plotly", "Matplotlib"],
    data_engineering: ["Airflow", "dbt", "Snowflake", "GCP BigQuery", "PostgreSQL"],
    cloud_devops: ["Docker", "Kubernetes"],
  };

  it("keeps every kept skill a real source skill and ranks JD-relevant first", () => {
    const { skills, admitted } = rebuildSkillsForJob({
      sourceSkills,
      jdKeywords: ["Data visualization", "Power BI"],
      baseResumeText: ML_RESUME_TEXT,
      jdText: "Experience with Tableau or another leading visualization tool is required. Power BI a plus.",
    });
    expect(skills.analytics_bi.slice(0, 3)).toContain("Power BI");
    expect(skills.analytics_bi.indexOf("Matplotlib")).toBeGreaterThan(skills.analytics_bi.indexOf("Power BI"));
    const admittedSet = new Set(admitted.map((a) => a.toLowerCase()));
    for (const values of Object.values(skills)) {
      for (const v of values) {
        if (admittedSet.has(v.toLowerCase())) continue; // evidence-gated admittance is by design
        const isSource = Object.values(sourceSkills).flat().some((s) => s.toLowerCase() === v.toLowerCase());
        if (!isSource) throw new Error(`non-source skill leaked: ${v}`);
      }
    }
  });

  it("admits evidenced JD keywords as skills — and only evidenced ones", () => {
    const { skills, admitted } = rebuildSkillsForJob({
      sourceSkills,
      jdKeywords: ["Data wrangling", "Machine learning", "People analytics", "HR analytics", "Kafka"],
      baseResumeText: ML_RESUME_TEXT,
      currentTailoredText: "Summary about analytics.", // keywords not yet covered
    });
    expect(admitted).toContain("Data wrangling");
    expect(admitted).toContain("Machine learning");
    expect(admitted).not.toContain("People analytics");
    expect(admitted).not.toContain("HR analytics");
    expect(admitted).not.toContain("Kafka");
    const flat = Object.values(skills).flat().join(" ").toLowerCase();
    expect(flat).toContain("data wrangling");
    expect(flat).toContain("machine learning");
    expect(flat).not.toContain("people analytics");
    expect(flat).not.toContain("kafka");
  });

  it("does not duplicate a keyword already covered by the tailored text", () => {
    const { admitted } = rebuildSkillsForJob({
      sourceSkills,
      jdKeywords: ["Machine learning"],
      baseResumeText: ML_RESUME_TEXT,
      currentTailoredText: "Deployed machine learning systems in production.",
    });
    expect(admitted).toEqual([]);
  });

  it("drops nothing JD-relevant because of category caps", () => {
    const { skills } = rebuildSkillsForJob({
      sourceSkills,
      jdKeywords: ["Kubernetes"],
      baseResumeText: ML_RESUME_TEXT,
      jdText: "Kubernetes required.",
    });
    expect(skills.cloud_devops).toContain("Kubernetes");
  });
});

describe("augmentSummaryCoverage", () => {
  const jd = ["Data wrangling", "Data visualization", "People analytics", "HR analytics"];

  it("appends only evidenced, still-missing keywords", () => {
    const tailoredText = "Data Scientist with analytics experience.";
    const { summary, added } = augmentSummaryCoverage("Data Scientist with analytics experience.", {
      jdKeywords: jd,
      baseResumeText: ML_RESUME_TEXT,
      tailoredText,
    });
    expect(added).toEqual(["Data wrangling", "Data visualization"]);
    expect(summary).toContain("Core strengths include data wrangling, and data visualization.");
    expect(summary).not.toMatch(/people analytics|hr analytics/i);
    expect(summary).not.toMatch(/\d/); // no invented numbers
  });

  it("is a no-op when nothing evidenced is missing", () => {
    const text = "Skills include data wrangling and data visualization for dashboards.";
    const { summary, added } = augmentSummaryCoverage(text, {
      jdKeywords: jd,
      baseResumeText: ML_RESUME_TEXT,
      tailoredText: text,
    });
    expect(added).toEqual([]);
    expect(summary).toBe(text);
  });

  it("closes transferable analytics gaps only when the source story proves them", () => {
    const base = "Developed statistical models and regression analyses. Built model monitoring and telemetry for production systems.";
    const jdKeywords = ["Quantitative analysis", "Instrumentation", "Experimentation design", "Econometrics"];
    const { summary, added } = augmentSummaryCoverage("Data Scientist delivering production analytics.", {
      jdKeywords,
      baseResumeText: base,
      tailoredText: "Data Scientist delivering production analytics.",
    });

    expect(added).toEqual(["Quantitative analysis", "Instrumentation"]);
    expect(summary).toMatch(/quantitative analysis/i);
    expect(summary).toMatch(/instrumentation/i);
    expect(summary).not.toMatch(/experimentation design|econometrics/i);
  });
});

describe("application snapshot lineage", () => {
  it("detects snapshots and masters", () => {
    expect(isApplicationSnapshot({ personal_info: { _v2_extras: { document_role: "application_snapshot" } } })).toBe(true);
    expect(isApplicationSnapshot({ personal_info: { _v2_extras: { source_resume_id: "x" } } })).toBe(true);
    expect(isApplicationSnapshot({ personal_info: {} })).toBe(false);
    expect(isApplicationSnapshot({ personal_info: { _v2_extras: {} } })).toBe(false);
  });
});

describe("real-data regression (PROD MongoDB / Figma triples)", () => {
  it("fixed scorer no longer drops sentence-final evidence in the stored Figma tailored resume", () => {
    // The stored tailored resume ends a bullet with "...financial systems." —
    // previously tokenized as "systems.", hiding evidence for the JD keyword.
    const storedTailoredText = "Engineered ML features using behavioral, longitudinal, and event-level data for fraud-risk scoring and anomaly-detection models used in financial systems. Worked with large-scale datasets using PySpark on Hadoop-based data environments, leveraging HDFS and Hive-style tables for distributed processing.";
    const r = computeKeywordScore(storedTailoredText, ["Distributed data systems"]);
    expect(r.matched).toEqual(["Distributed data systems"]);
  });

  it("deterministic floor lifts keyword coverage on the MongoDB example without fabrication", () => {
    const master = {
      personal_info: { fullName: "Candidate", title: "AI/ML Engineer", location: "Dallas, TX" },
      summary: "AI/ML Engineer with over 3 years of expertise in deploying advanced machine learning systems across healthcare, finance, and e-commerce.",
      experience: [{
        role: "Data Analyst",
        company_or_client: "University of Memphis",
        bullets: [
          "Used Python, SQL, and Pandas to clean, engineer, and model marketing datasets for predicting engagement patterns and evaluating conversion behavior.",
          "Created automated dashboards in Tableau and Python (Plotly/Matplotlib) to track funnel performance, channel attribution, and marketing KPIs.",
        ],
      }, {
        role: "Data Scientist",
        company_or_client: "Dr. Reddy's Laboratories",
        bullets: ["Automated data cleansing processes for ingestion of regulatory documents and production logs."],
      }],
      skills: {
        programming_languages: ["Python", "SQL", "PySpark", "R", "Bash"],
        analytics_bi: ["Tableau", "Power BI", "Dash", "Plotly", "Matplotlib", "Seaborn"],
        data_engineering: ["Airflow", "dbt", "Snowflake", "GCP BigQuery", "SQL Server", "PostgreSQL"],
        cloud_devops: ["GCP Cloud Run", "Docker", "Kubernetes"],
      },
      education: [{ degree: "Master’s in Information Systems" }],
    };
    const jdKeywords = ["Senior Analyst", "Python", "R", "Tableau dashboards", "Data governance", "Data quality", "Data modeling", "People analytics", "HR analytics", "Advanced SQL", "Complex queries", "Data wrangling", "Data visualization", "Data warehousing", "Data warehouse cloud"];

    const before = scoreResumeDeterministic(master, jdKeywords);

    // Deterministic floor the fixed pipeline guarantees: skills rebuild +
    // summary coverage, both evidence-gated.
    const baseText = resumeToPlainText(master);
    const rebuilt = rebuildSkillsForJob({
      sourceSkills: master.skills,
      jdKeywords,
      baseResumeText: baseText,
      currentTailoredText: baseText,
    });
    const augmented = augmentSummaryCoverage(master.summary, {
      jdKeywords,
      baseResumeText: baseText,
      tailoredText: baseText,
    });
    const floored = { ...master, summary: augmented.summary, skills: rebuilt.skills };
    const after = scoreResumeDeterministic(floored, jdKeywords);

    // Honest lift: evidenced gaps close, unevidenced ones stay missing.
    expect(after.matched_keywords).toEqual(expect.arrayContaining(["Data wrangling", "Data visualization", "Data warehousing", "Data warehouse cloud"]));
    expect(after.missing_keywords).toEqual(expect.arrayContaining(["People analytics", "HR analytics"]));
    expect(after.dim_keywords).toBeGreaterThanOrEqual(before.dim_keywords + 20);
    expect(after.overall).toBeGreaterThanOrEqual(before.overall + 4);
  });
});
