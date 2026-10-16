// Shared funnel math for My Collection so session cards and the Stats tab agree.
// A job that has moved past "applied" (viewed, interview, ...) was still applied to.

const APPLIED_STATUSES = new Set(["applied", "viewed", "interview", "take_home", "offer"]);
const INTERVIEW_STATUSES = new Set(["interview", "take_home"]);

export interface FunnelCounts {
  total: number;
  applied: number;
  interviews: number;
  offers: number;
}

export function computeFunnel(statuses: string[]): FunnelCounts {
  let applied = 0;
  let interviews = 0;
  let offers = 0;
  for (const s of statuses) {
    if (APPLIED_STATUSES.has(s)) applied++;
    if (INTERVIEW_STATUSES.has(s)) interviews++;
    if (s === "offer") offers++;
  }
  return { total: statuses.length, applied, interviews, offers };
}
