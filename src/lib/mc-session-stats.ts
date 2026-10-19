export interface SessionStats {
  discovered: number;
  applied: number;
  interviews: number;
}

// Statuses a job passes through once the application has actually been sent.
const SUBMITTED_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home", "offer"]);

export function computeSessionStats(rows: { session_id: string; status: string }[]): Record<string, SessionStats> {
  const map: Record<string, SessionStats> = {};
  for (const row of rows) {
    const stats = (map[row.session_id] ??= { discovered: 0, applied: 0, interviews: 0 });
    stats.discovered += 1;
    if (SUBMITTED_STATUSES.has(row.status)) stats.applied += 1;
    if (INTERVIEW_STATUSES.has(row.status)) stats.interviews += 1;
  }
  return map;
}
