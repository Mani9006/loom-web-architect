const DEFAULT_OWNER_EMAILS = ["myfamily9006@gmail.com"];

function normalizeEmail(value: string | null | undefined): string {
  return String(value || "").trim().toLowerCase();
}

export function getOwnerEmails(): string[] {
  const fromEnv = String(import.meta.env.VITE_ADMIN_OWNER_EMAILS || "");
  const values = (fromEnv ? fromEnv.split(",") : DEFAULT_OWNER_EMAILS)
    .map((item) => normalizeEmail(item))
    .filter(Boolean);
  return values.length > 0 ? values : DEFAULT_OWNER_EMAILS;
}

export function isOwnerEmail(email: string | null | undefined): boolean {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  return getOwnerEmails().includes(normalized);
}
