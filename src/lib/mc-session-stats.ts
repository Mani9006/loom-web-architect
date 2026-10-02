export interface SessionStats {
  discovered: number;
  applied: number;
  interviews: number;
}

// Statuses a job reaches only after the user has actually applied.
const APPLIED_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home", "offer"]);

export function computeSessionStats(
  rows: { session_id: string; status: string }[],
  sessionIds: string[],
): Record<string, SessionStats> {
  const map: Record<string, SessionStats> = {};
  for (const sid of sessionIds) map[sid] = { discovered: 0, applied: 0, interviews: 0 };
  for (const r of rows) {
    const s = map[r.session_id];
    if (!s) continue;
    s.discovered += 1;
    if (APPLIED_STATUSES.has(r.status)) s.applied += 1;
    if (INTERVIEW_STATUSES.has(r.status)) s.interviews += 1;
  }
  return map;
}
