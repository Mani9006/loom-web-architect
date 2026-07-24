import assert from "node:assert/strict";
import test from "node:test";
import { assessAuditReport } from "./npm-audit-allowlist.mjs";

const cleanReport = {
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 0,
      critical: 0,
      total: 0,
    },
  },
  vulnerabilities: {},
};

const allowedReport = {
  metadata: {
    vulnerabilities: {
      info: 0,
      low: 0,
      moderate: 0,
      high: 2,
      critical: 0,
      total: 2,
    },
  },
  vulnerabilities: {
    "react-router": {
      name: "react-router",
      severity: "high",
      isDirect: false,
      via: [{
        severity: "high",
        url: "https://github.com/advisories/GHSA-qwww-vcr4-c8h2",
      }],
      effects: ["react-router-dom"],
    },
    "react-router-dom": {
      name: "react-router-dom",
      severity: "high",
      isDirect: true,
      via: ["react-router"],
      effects: [],
    },
  },
};

test("accepts a clean npm audit report", () => {
  assert.deepEqual(
    assessAuditReport(cleanReport),
    { ok: true, allowedAdvisoryPresent: false },
  );
});

test("accepts only the documented React Router advisory graph", () => {
  assert.deepEqual(
    assessAuditReport(allowedReport),
    { ok: true, allowedAdvisoryPresent: true },
  );
});

test("rejects another high advisory even beside the allowed advisory", () => {
  const report = structuredClone(allowedReport);
  report.vulnerabilities.example = {
    name: "example",
    severity: "high",
    isDirect: true,
    via: [{
      severity: "high",
      url: "https://github.com/advisories/GHSA-example",
    }],
    effects: [],
  };
  assert.equal(assessAuditReport(report).ok, false);
});

test("rejects a changed advisory or dependency graph", () => {
  const changedAdvisory = structuredClone(allowedReport);
  changedAdvisory.vulnerabilities["react-router"].via[0].url =
    "https://github.com/advisories/GHSA-different";
  assert.equal(assessAuditReport(changedAdvisory).ok, false);

  const changedGraph = structuredClone(allowedReport);
  changedGraph.vulnerabilities["react-router-dom"].via = ["another-package"];
  assert.equal(assessAuditReport(changedGraph).ok, false);
});
