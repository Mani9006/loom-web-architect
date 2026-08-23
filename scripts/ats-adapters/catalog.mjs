// ATS catalog for the browser worker. Keep host lists in sync with
// src/lib/ats-detect.ts. Detection ≠ ability to submit.

export const ATS_CATALOG = [
  { slug: "greenhouse", label: "Greenhouse", live: true, mode: "adapter", hostSuffixes: ["greenhouse.io"] },
  { slug: "lever", label: "Lever", live: true, mode: "adapter", hostSuffixes: ["lever.co"] },
  { slug: "ashby", label: "Ashby", live: true, mode: "adapter", hostSuffixes: ["ashbyhq.com"] },
  { slug: "workable", label: "Workable", live: true, mode: "adapter", hostSuffixes: ["workable.com"] },
  { slug: "workday", label: "Workday", live: true, mode: "adapter", hostSuffixes: ["myworkdayjobs.com", "myworkday.com"] },
  { slug: "icims", label: "iCIMS", live: false, mode: "needs_you", hostSuffixes: ["icims.com"] },
  { slug: "smartrecruiters", label: "SmartRecruiters", live: false, mode: "needs_you", hostSuffixes: ["smartrecruiters.com"] },
  { slug: "jobvite", label: "Jobvite", live: false, mode: "needs_you", hostSuffixes: ["jobvite.com"] },
  { slug: "successfactors", label: "SAP SuccessFactors", live: false, mode: "needs_you", hostSuffixes: ["successfactors.com", "successfactors.eu", "sapsf.com", "sapsf.eu"] },
  { slug: "oraclecloud", label: "Oracle Cloud HCM", live: false, mode: "needs_you", hostSuffixes: ["oraclecloud.com"] },
  { slug: "rippling", label: "Rippling", live: false, mode: "needs_you", hostSuffixes: ["rippling.com"] },
  { slug: "phenom", label: "Phenom", live: false, mode: "needs_you", hostSuffixes: ["phenom.com", "phenompeople.com"] },
  { slug: "bamboohr", label: "BambooHR", live: false, mode: "needs_you", hostSuffixes: ["bamboohr.com"] },
  { slug: "jazzhr", label: "JazzHR", live: false, mode: "needs_you", hostSuffixes: ["jazz.co", "applytojob.com"] },
  { slug: "breezyhr", label: "Breezy HR", live: false, mode: "needs_you", hostSuffixes: ["breezy.hr"] },
  { slug: "recruitee", label: "Recruitee", live: false, mode: "needs_you", hostSuffixes: ["recruitee.com"] },
  { slug: "teamtailor", label: "Teamtailor", live: false, mode: "needs_you", hostSuffixes: ["teamtailor.com"] },
  { slug: "pinpoint", label: "Pinpoint", live: false, mode: "needs_you", hostSuffixes: ["pinpoint.tech", "pinpointhq.com"] },
  { slug: "polymer", label: "Polymer", live: false, mode: "needs_you", hostSuffixes: ["polymer.co"] },
  { slug: "dover", label: "Dover", live: false, mode: "needs_you", hostSuffixes: ["dover.com", "app.dover.io"] },
  { slug: "gem", label: "Gem", live: false, mode: "needs_you", hostSuffixes: ["gem.com"] },
  { slug: "brassring", label: "Brassring", live: false, mode: "needs_you", hostSuffixes: ["brassring.com"] },
  { slug: "dayforce", label: "Dayforce", live: false, mode: "needs_you", hostSuffixes: ["dayforcehcm.com", "dayforce.com"] },
  { slug: "hireology", label: "Hireology", live: false, mode: "needs_you", hostSuffixes: ["hireology.com"] },
  { slug: "join", label: "Join", live: false, mode: "needs_you", hostSuffixes: ["join.com"] },
  { slug: "paylocity", label: "Paylocity", live: false, mode: "needs_you", hostSuffixes: ["paylocity.com"] },
  { slug: "ultipro", label: "UKG / UltiPro", live: false, mode: "needs_you", hostSuffixes: ["ultipro.com", "ukg.com"] },
  { slug: "adp", label: "ADP", live: false, mode: "needs_you", hostSuffixes: ["adp.com", "workforcenow.adp.com"] },
  { slug: "zohorecruit", label: "Zoho Recruit", live: false, mode: "needs_you", hostSuffixes: ["zohorecruit.com", "recruit.zoho.com", "zoho.com"] },
  { slug: "indeed", label: "Indeed", live: false, mode: "account_required", hostSuffixes: ["indeed.com"] },
  { slug: "naukri", label: "Naukri", live: false, mode: "account_required", hostSuffixes: ["naukri.com"] },
  { slug: "linkedin", label: "LinkedIn", live: false, mode: "account_required", hostSuffixes: ["linkedin.com"] },
];

function hostMatches(hostname, suffix) {
  return hostname === suffix || hostname.endsWith(`.${suffix}`);
}

export function detectAts(url) {
  let parsed;
  try {
    parsed = new URL(String(url || ""));
  } catch {
    return { ats: null, label: "Unknown", detected: false, submittable: false, mode: "unknown", reason: "Invalid URL", host: null };
  }
  const host = parsed.hostname.toLowerCase();
  const entry = ATS_CATALOG.find((item) => item.hostSuffixes.some((suffix) => hostMatches(host, suffix)));
  if (!entry) {
    return {
      ats: null, label: "Unknown ATS", detected: false, submittable: false, mode: "unknown",
      reason: "ATS not recognized. Packet stays in Needs you.", host,
    };
  }
  return {
    ats: entry.slug,
    label: entry.label,
    detected: true,
    submittable: entry.live === true,
    mode: entry.mode,
    reason: entry.live
      ? `Live ${entry.label} adapter`
      : entry.mode === "account_required"
        ? `${entry.label} needs the candidate's own account`
        : `${entry.label} detected; no live submit adapter`,
    host,
  };
}
