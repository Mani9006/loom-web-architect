// Funnel order for auto-applied (source="email") status moves only — manual
// board drags are unrestricted. Without this, a later, lower-signal email
// (e.g. a duplicate ATS "application received" confirmation arriving after
// an interview invite) would silently regress a job's kanban status, since
// the classifier has no memory of what's already been recorded.
// rejected/offer share the top rank because they're terminal outcomes that
// should always be recorded once seen, never re-opened by an older signal.
export const STATUS_RANK: Record<string, number> = {
  discovered: 0, saved: 1, applied: 2, viewed: 3, interview: 4, take_home: 5, offer: 6, rejected: 6,
};

export function isForwardStatusMove(from: string, to: string): boolean {
  // hold/withdrawn are deliberate user actions, not pipeline stages — never let
  // an email signal (stray/duplicate/out-of-order) pull a job back out of them.
  if (from === "hold" || from === "withdrawn") return false;
  if (to === "rejected" || to === "offer") return true;
  return (STATUS_RANK[to] ?? 0) > (STATUS_RANK[from] ?? -1);
}
