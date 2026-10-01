/**
 * True when a scan_companies row was created by one-click intake for a portal
 * with no submission adapter (Workday, iCIMS, ...). Those rows are stored with
 * api_type "lever" and api_identifier "manual" (or "manual-<slug>"), so
 * api_type alone must never be trusted to mean the job can be auto-submitted.
 */
export function isManualIntakeIdentifier(apiIdentifier: unknown): boolean {
  const identifier = String(apiIdentifier ?? "");
  return identifier === "manual" || identifier.startsWith("manual-");
}
