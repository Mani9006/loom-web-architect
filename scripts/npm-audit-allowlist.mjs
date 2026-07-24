import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const ALLOWED_ADVISORY_URL =
  "https://github.com/advisories/GHSA-qwww-vcr4-c8h2";
const ALLOWED_PACKAGES = new Set(["react-router", "react-router-dom"]);

function isHighOrCritical(vulnerability) {
  return vulnerability?.severity === "high" ||
    vulnerability?.severity === "critical";
}

export function assessAuditReport(report) {
  if (!report || typeof report !== "object" || !report.metadata?.vulnerabilities) {
    return {
      ok: false,
      message: "npm audit did not return a complete vulnerability report.",
    };
  }

  const highOrCritical = Object.entries(report.vulnerabilities ?? {})
    .filter(([, vulnerability]) => isHighOrCritical(vulnerability));

  if (highOrCritical.length === 0) {
    return { ok: true, allowedAdvisoryPresent: false };
  }

  const packageNames = new Set(highOrCritical.map(([name]) => name));
  if (
    packageNames.size !== ALLOWED_PACKAGES.size ||
    [...packageNames].some((name) => !ALLOWED_PACKAGES.has(name))
  ) {
    return {
      ok: false,
      message: `Unexpected high/critical packages: ${
        [...packageNames].sort().join(", ")
      }`,
    };
  }

  const detailedAdvisories = highOrCritical.flatMap(([, vulnerability]) =>
    (vulnerability.via ?? []).filter((via) =>
      via && typeof via === "object"
    )
  );
  if (
    detailedAdvisories.length !== 1 ||
    detailedAdvisories[0].url !== ALLOWED_ADVISORY_URL ||
    detailedAdvisories[0].severity !== "high"
  ) {
    return {
      ok: false,
      message: "The high/critical advisory set does not match the approved exception.",
    };
  }

  const routerDom = report.vulnerabilities["react-router-dom"];
  const routerDomVia = routerDom?.via ?? [];
  if (
    routerDomVia.length !== 1 ||
    routerDomVia[0] !== "react-router" ||
    routerDom?.isDirect !== true
  ) {
    return {
      ok: false,
      message: "The approved transitive React Router advisory shape changed.",
    };
  }

  const router = report.vulnerabilities["react-router"];
  if (
    router?.isDirect !== false ||
    (router.effects ?? []).length !== 1 ||
    router.effects[0] !== "react-router-dom"
  ) {
    return {
      ok: false,
      message: "The approved React Router dependency relationship changed.",
    };
  }

  return { ok: true, allowedAdvisoryPresent: true };
}

function run() {
  const audit = spawnSync(
    "npm",
    ["audit", "--json", "--audit-level=high"],
    {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      shell: false,
    },
  );

  if (audit.error) {
    console.error(`npm audit could not start: ${audit.error.message}`);
    process.exit(1);
  }

  let report;
  try {
    report = JSON.parse(audit.stdout);
  } catch {
    console.error("npm audit returned invalid JSON.");
    if (audit.stderr.trim()) console.error(audit.stderr.trim());
    process.exit(1);
  }

  const assessment = assessAuditReport(report);
  if (!assessment.ok) {
    console.error(assessment.message);
    process.exit(1);
  }

  if (assessment.allowedAdvisoryPresent) {
    console.log(
      `Allowed ${ALLOWED_ADVISORY_URL}: unstable React Router RSC APIs are not used; see docs/security-risk-register.md.`,
    );
  } else {
    console.log("No high or critical npm advisories found.");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) run();
