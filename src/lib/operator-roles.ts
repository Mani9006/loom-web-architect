export const OPERATOR_ROLES = ["owner", "admin", "support", "billing", "engineer", "viewer"] as const;

export type OperatorRole = (typeof OPERATOR_ROLES)[number];

export const OPERATOR_PERMISSIONS = [
  "billing",
  "user_support",
  "impersonate",
  "promo_codes",
  "worker_replay",
  "feature_flags",
  "audit_log",
] as const;

export type OperatorPermission = (typeof OPERATOR_PERMISSIONS)[number];

const MATRIX: Record<OperatorRole, readonly OperatorPermission[]> = {
  owner: ["billing", "user_support", "impersonate", "promo_codes", "worker_replay", "feature_flags", "audit_log"],
  admin: ["billing", "user_support", "impersonate", "promo_codes", "worker_replay", "feature_flags", "audit_log"],
  support: ["user_support", "impersonate", "audit_log"],
  billing: ["billing", "promo_codes", "audit_log"],
  engineer: ["audit_log"],
  viewer: ["audit_log"],
};

export const ROLE_LABELS: Record<OperatorRole, string> = {
  owner: "Owner",
  admin: "Admin",
  support: "Support",
  billing: "Billing",
  engineer: "Engineer",
  viewer: "Viewer",
};

export const PERMISSION_LABELS: Record<OperatorPermission, string> = {
  billing: "Billing",
  user_support: "User support",
  impersonate: "Impersonate",
  promo_codes: "Promo codes",
  worker_replay: "Worker replay",
  feature_flags: "Feature flags",
  audit_log: "Audit log",
};

export function isOperatorRole(value: string | null | undefined): value is OperatorRole {
  return OPERATOR_ROLES.includes(value as OperatorRole);
}

export function permissionsFor(role: OperatorRole): OperatorPermission[] {
  return [...MATRIX[role]];
}

export function can(role: OperatorRole, permission: OperatorPermission): boolean {
  return MATRIX[role].includes(permission);
}

export function canInviteRole(actor: OperatorRole, invitee: OperatorRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return invitee !== "owner";
  return false;
}

export function canChangeRole(actor: OperatorRole, target: OperatorRole, next: OperatorRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner" && next !== "owner";
  return false;
}

export function canRevoke(actor: OperatorRole, target: OperatorRole): boolean {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

export function engineerIsReadOnly(role: OperatorRole): boolean {
  return role === "engineer" || role === "viewer";
}
