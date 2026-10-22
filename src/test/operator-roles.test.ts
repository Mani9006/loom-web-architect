import { describe, expect, it } from "vitest";
import {
  can,
  canChangeRole,
  canInviteRole,
  canRevoke,
  engineerIsReadOnly,
  isOperatorRole,
  permissionsFor,
} from "@/lib/operator-roles";

describe("operator roles", () => {
  it("recognizes the six company roles", () => {
    expect(["owner", "admin", "support", "billing", "engineer", "viewer"].every(isOperatorRole)).toBe(true);
    expect(isOperatorRole("member")).toBe(false);
  });

  it("gives owner and admin the full privileged matrix", () => {
    for (const role of ["owner", "admin"] as const) {
      expect(can(role, "billing")).toBe(true);
      expect(can(role, "user_support")).toBe(true);
      expect(can(role, "impersonate")).toBe(true);
      expect(can(role, "promo_codes")).toBe(true);
      expect(can(role, "worker_replay")).toBe(true);
      expect(can(role, "feature_flags")).toBe(true);
      expect(can(role, "audit_log")).toBe(true);
    }
  });

  it("keeps support on people, not billing or replay", () => {
    expect(can("support", "user_support")).toBe(true);
    expect(can("support", "impersonate")).toBe(true);
    expect(can("support", "billing")).toBe(false);
    expect(can("support", "worker_replay")).toBe(false);
    expect(can("support", "feature_flags")).toBe(false);
  });

  it("keeps billing on money and codes only", () => {
    expect(can("billing", "billing")).toBe(true);
    expect(can("billing", "promo_codes")).toBe(true);
    expect(can("billing", "impersonate")).toBe(false);
    expect(can("billing", "user_support")).toBe(false);
  });

  it("treats engineer as read-only ops", () => {
    expect(engineerIsReadOnly("engineer")).toBe(true);
    expect(permissionsFor("engineer")).toEqual(["audit_log"]);
    expect(can("engineer", "worker_replay")).toBe(false);
    expect(can("engineer", "feature_flags")).toBe(false);
  });

  it("lets viewers read the audit log and nothing else", () => {
    expect(permissionsFor("viewer")).toEqual(["audit_log"]);
    expect(can("viewer", "impersonate")).toBe(false);
  });

  it("restricts invite and revoke to owner/admin", () => {
    expect(canInviteRole("owner", "support")).toBe(true);
    expect(canInviteRole("admin", "owner")).toBe(false);
    expect(canInviteRole("admin", "engineer")).toBe(true);
    expect(canInviteRole("support", "viewer")).toBe(false);
    expect(canRevoke("admin", "owner")).toBe(false);
    expect(canRevoke("owner", "admin")).toBe(true);
    expect(canChangeRole("admin", "support", "owner")).toBe(false);
    expect(canChangeRole("owner", "viewer", "admin")).toBe(true);
  });
});
