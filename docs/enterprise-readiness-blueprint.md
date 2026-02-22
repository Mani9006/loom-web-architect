# Enterprise Readiness Blueprint — ResumePreps

**Version:** 1.0  
**Date:** 2026-02-22  
**Status:** Implementation-Ready

---

## Executive Summary

This blueprint defines the phased path to make ResumePreps enterprise-ready, covering Single Sign-On (SSO), Role-Based Access Control (RBAC), audit logging, multi-tenant isolation, and an admin portal. Each phase includes concrete milestones, KPI targets, validation methods, and technical architecture impacts.

---

## 1. Phased Implementation Plan

### Phase 1 — Foundation (Weeks 1–4) ✅ *Implemented in this PR*

**Goal:** Lay the data-model and access-control foundation.

| Milestone | Artifact | Status |
|-----------|----------|--------|
| 1.1 Enterprise schema | `supabase/migrations/20260222000000_enterprise_readiness.sql` | ✅ Done |
| 1.2 RBAC role enum extension | `enterprise_admin`, `enterprise_member` added to `app_role` | ✅ Done |
| 1.3 Tenant & membership tables | `enterprise_tenants`, `enterprise_memberships` | ✅ Done |
| 1.4 SSO config table | `sso_configurations` (SAML 2.0 + OIDC) | ✅ Done |
| 1.5 Audit log table + helper | `audit_log_entries`, `write_audit_log()` | ✅ Done |
| 1.6 AuthContext role exposure | `src/contexts/AuthContext.tsx` | ✅ Done |
| 1.7 RoleProtectedRoute | `src/components/RoleProtectedRoute.tsx` | ✅ Done |
| 1.8 Admin Portal UI | `src/pages/AdminPortal.tsx` | ✅ Done |
| 1.9 `/admin` route | `src/App.tsx` | ✅ Done |

**KPI target:** Enterprise schema deployed; admin role gates functional in staging.  
**Validation:** Navigate to `/admin` as non-admin → redirect to `/home`. Navigate as `admin` → portal renders.

---

### Phase 2 — SSO Integration (Weeks 5–8)

**Goal:** Enable tenant-level OIDC and SAML 2.0 login flows.

| Milestone | Description |
|-----------|-------------|
| 2.1 OIDC provider flow | Supabase custom OIDC provider per tenant; map `issuer_url` + `client_id` from `sso_configurations` |
| 2.2 SAML 2.0 support | Integrate a SAML SP library (e.g., `passport-saml` in an Edge Function); consume `idp_metadata_url` |
| 2.3 JIT provisioning | On first SSO login, auto-create user + assign `enterprise_member` role + link to tenant |
| 2.4 Domain enforcement | Validate email domain against tenant's `slug`; block personal-email login for SSO-enabled tenants |
| 2.5 Admin SSO config UI | Extend Admin Portal SSO tab with a form to create/update `sso_configurations` |

**Architecture impact:**  
- New Supabase Edge Function: `sso-callback` handles token exchange.  
- `sso_configurations.enabled` flag gates the SSO login button on the Auth page.  
- `enterprise_tenants.sso_enabled` toggles domain-enforcement middleware.

**KPI targets:**
- SSO login latency < 1.5 s (p95)  
- Zero users able to bypass domain restriction after SSO is enabled for their tenant

**Validation:**  
- Integration test: mock IdP → SSO callback → user created → tenant membership created.  
- E2E Playwright test: `auth.spec.ts` — SSO login flow.

---

### Phase 3 — Full RBAC Enforcement (Weeks 9–12)

**Goal:** Every sensitive action checks roles; tenant data is fully isolated.

| Milestone | Description |
|-----------|-------------|
| 3.1 Row-Level Security audit | Review all existing tables; add `tenant_id` FK where missing |
| 3.2 Tenant-scoped data isolation | Filter all user-facing queries by active tenant when user is `enterprise_member` |
| 3.3 `useRequireRole` hook | Client hook that wraps `useAuth().roles`; used in feature components |
| 3.4 Feature flags per tenant | `enterprise_tenants.features JSONB` column; disable/enable features per contract |
| 3.5 Seat-limit enforcement | Trigger or check on `enterprise_memberships INSERT`; reject if `count >= max_seats` |

**Architecture impact:**  
- `AuthContext` gains `activeTenant` + `tenantRole` from `enterprise_memberships`.  
- All protected queries add `.eq("tenant_id", activeTenantId)` where applicable.

**KPI targets:**
- Cross-tenant data leak: 0 incidents in pen-test  
- All admin actions gated: 100% coverage on `RoleProtectedRoute` or `useRequireRole`

**Validation:**  
- Supabase RLS unit tests (pg_tap or Jest + Supabase local).  
- Manual pen-test: attempt to read another tenant's data via direct API call.

---

### Phase 4 — Audit Log Pipeline (Weeks 13–16)

**Goal:** Immutable, queryable audit trail for SOC 2 / ISO 27001 compliance.

| Milestone | Description |
|-----------|-------------|
| 4.1 Server-side instrumentation | Edge Functions call `write_audit_log()` on every mutating action |
| 4.2 Client-side event capture | React hooks emit audit events for UI-triggered actions (role changes, SSO toggles) |
| 4.3 Retention policy | Cron job archives entries > 90 days to cold storage (Supabase Storage or S3) |
| 4.4 Audit log export | Admin Portal → Audit Log tab → CSV/JSON export button |
| 4.5 Alerting | Supabase Realtime subscription on `audit_log_entries`; alert on `action = "user.role_changed"` |

**Architecture impact:**  
- `write_audit_log` SECURITY DEFINER function already deployed (Phase 1).  
- New Edge Function: `audit-export` streams audit entries as CSV.

**KPI targets:**
- 100% of mutating API calls produce an audit entry  
- Export latency < 3 s for 10 000-entry window  
- Retention: entries queryable for ≥ 90 days

**Validation:**  
- Automated test: perform 5 actions → assert 5 matching audit entries exist.  
- Load test: insert 50 000 entries; export must complete < 3 s.

---

### Phase 5 — Admin Portal Completion + Customer Handoff (Weeks 17–20)

**Goal:** Self-service admin portal; enterprise deals can onboard without engineering.

| Milestone | Description |
|-----------|-------------|
| 5.1 Tenant provisioning wizard | Multi-step form: name → seats → SSO → invite admins |
| 5.2 Member invitation flow | Email invite with magic link; maps to `enterprise_memberships` |
| 5.3 Role management UI | Admins can change `tenant_role` for any member |
| 5.4 Usage dashboard | Seats used vs. available; active users (30-day); resume/job activity per tenant |
| 5.5 SLA / support tier display | Shows contract tier and support SLA in Admin Portal header |
| 5.6 White-label subdomain | Route `{slug}.resumepreps.com` to tenant-scoped view |

**KPI targets:**
- Time-to-first-login for new enterprise tenant < 30 min (without engineering support)  
- NPS for enterprise onboarding ≥ 8/10

**Validation:**  
- User research session: enterprise admin completes onboarding end-to-end.  
- Automated smoke test on each new tenant provisioning.

---

## 2. Security & Compliance Control Map

| Control | Standard | Current State | Gap | Owner | Phase |
|---------|----------|---------------|-----|-------|-------|
| SSO / Federated Identity | SOC 2 CC6.1 | Google OAuth only | No SAML/OIDC per tenant | Eng | 2 |
| RBAC | SOC 2 CC6.3 | `admin/moderator/user` enum | No tenant-level roles | Eng | 1 ✅ |
| Audit Logging | SOC 2 CC7.2 | None | No immutable event log | Eng | 1 ✅ (schema) |
| Data Isolation | SOC 2 CC6.6 | Per-user RLS | No tenant-level isolation | Eng | 3 |
| Encryption in Transit | SOC 2 CC6.7 | TLS via Supabase/Vercel | ✅ Covered | Infra | – |
| Encryption at Rest | SOC 2 CC6.8 | Supabase default AES-256 | ✅ Covered | Infra | – |
| MFA | SOC 2 CC6.1 | Not enforced | No per-tenant MFA policy | Eng | 3 |
| Vulnerability Scanning | SOC 2 CC7.1 | `scripts/security-audit.sh` | No SAST/DAST in CI | DevSecOps | 2 |
| Incident Response Plan | SOC 2 CC7.3 | None | No documented IRP | SecOps | 4 |
| Vendor Risk Management | ISO 27001 A.15 | Informal | No formal vendor inventory | Legal | 5 |
| Privacy (GDPR/CCPA) | GDPR Art. 17 | Manual delete | No automated data erasure | Eng | 4 |
| Penetration Testing | SOC 2 CC7.1 | Never conducted | Schedule annual pen-test | SecOps | 3 |

### Gap Analysis Summary

**Critical gaps (block enterprise deals):**
1. No tenant-level SSO (Phase 2)
2. No tenant data isolation (Phase 3)
3. No audit log (Phase 1 schema ✅, instrumentation Phase 4)

**High gaps (required for SOC 2 Type II):**
4. No MFA enforcement per tenant
5. No formal incident response plan
6. No SAST in CI pipeline

**Medium gaps (required for ISO 27001):**
7. No vendor inventory
8. No automated GDPR data erasure

---

## 3. Technical Architecture Impacts

### Database

```
auth.users
  └── public.user_roles          (platform RBAC: admin/moderator/user)
  └── public.enterprise_memberships  (tenant RBAC: owner/admin/member/viewer)
        └── public.enterprise_tenants  (isolated workspace)
              └── public.sso_configurations  (1:1 per tenant)

public.audit_log_entries          (append-only; actor + action + resource)
```

### Authentication Flow (Post-SSO)

```
Browser → /auth?tenant=acme-corp
  → Supabase checks sso_configurations WHERE tenant_id = acme-corp.id AND enabled = true
  → Redirect to IdP (OIDC authorization_endpoint or SAML IdP SSO URL)
  → IdP callback → Edge Function sso-callback
  → JIT: upsert user, assign enterprise_member role, create enterprise_membership
  → Redirect to /home with session
```

### Client-Side RBAC

```
AuthContext
  ├── roles: AppRole[]          ← from public.user_roles
  ├── isAdmin: boolean
  ├── activeTenant: Tenant | null    ← (Phase 3)
  └── tenantRole: TenantRole | null  ← (Phase 3)

RoleProtectedRoute(allowedRoles)   ← wraps React Router Outlet
useRequireRole(role)               ← hook for component-level gates (Phase 3)
```

### Audit Log Write Path

```
Client action → Edge Function (mutating API)
  → perform DB mutation
  → call write_audit_log(actor_id, action, resource, resource_id, tenant_id, metadata)
  → INSERT INTO audit_log_entries (SECURITY DEFINER, bypasses RLS)
```

---

## 4. Pricing & Packaging for Enterprise Deals

### Tier Structure

| Tier | Price | Seats | SSO | RBAC | Audit Log | SLA |
|------|-------|-------|-----|------|-----------|-----|
| **Pro** | $29/user/mo | 1 | ✗ | Basic | ✗ | Best-effort |
| **Enterprise** | $79/user/mo (min 10) | 25 | ✓ OIDC | Full tenant RBAC | 90-day retention | 99.5% / 24h support |
| **Enterprise+** | Custom | Unlimited | ✓ SAML + OIDC | Custom roles | Custom retention + export | 99.9% / 4h support |

### Enterprise Add-Ons

| Add-On | Price | Description |
|--------|-------|-------------|
| Audit Log Export API | +$5/user/mo | Programmatic CSV/JSON export |
| White-label subdomain | +$500/mo | `{slug}.resumepreps.com` |
| Dedicated Supabase project | +$1 000/mo | Full data isolation at infra level |
| Annual pen-test report | $2 500/yr | Co-branded security report |

### Deal Readiness Checklist (per prospect)

- [ ] SSO: OIDC or SAML configured and tested with customer IdP
- [ ] Tenant provisioned: slug, seats, plan set
- [ ] Enterprise admin invited and role confirmed
- [ ] DPA (Data Processing Agreement) signed
- [ ] Security questionnaire completed (SOC 2 report or trust portal shared)
- [ ] SLA addendum attached to contract

---

## 5. Success Metrics & KPIs

### Enterprise Deal Readiness Score

Score is computed as: `(controls_implemented / total_required_controls) × 100`

| KPI | Target | Measurement Method | Current |
|-----|--------|--------------------|---------|
| Deal Readiness Score | ≥ 80 / 100 | Controls map audit (Section 2) | ~35 (Phase 1 done) |
| SSO adoption by enterprise tenants | 100% | `sso_configurations.enabled` count / tenant count | N/A (Phase 2) |
| Audit log coverage | 100% mutating actions | Ratio of actions with audit entry vs. total API mutations | 0% (Phase 4) |
| Role coverage | 100% sensitive routes | `RoleProtectedRoute` + `useRequireRole` coverage report | Phase 1 ✅ routing |
| Time-to-onboard enterprise customer | < 30 min | Stopwatch from signed contract to first active user | N/A (Phase 5) |
| Cross-tenant data leak incidents | 0 | Pen-test findings + bug bounty reports | Unknown (Phase 3) |
| Enterprise NPS | ≥ 8/10 | Post-onboarding survey (3-question NPS) | N/A (Phase 5) |
| Uptime SLA compliance | ≥ 99.5% | Vercel + Supabase status page SLA tracking | Meets (Vercel/Supabase) |

### Implementation ETA

| Phase | Milestone | ETA | Owner |
|-------|-----------|-----|-------|
| 1 | Schema + RBAC + Admin Portal (foundation) | ✅ Week 4 | Eng |
| 2 | SSO OIDC + SAML integration | Week 8 | Eng |
| 3 | Full RBAC enforcement + tenant isolation | Week 12 | Eng |
| 4 | Audit log instrumentation + export | Week 16 | Eng + SecOps |
| 5 | Admin Portal completion + enterprise handoff | Week 20 | Eng + CS |

**Full enterprise-ready target: Week 20** (~5 months from Phase 1 start).

---

## 6. Quick Validation Guide

### Validate Phase 1 (this PR)

```bash
# 1. Type-check passes
npm run type-check

# 2. Tests pass
npm run test

# 3. Build succeeds
npm run build

# 4. Manual: visit /admin as non-admin → redirected to /home ✓
# 5. Manual: visit /admin as admin → Admin Portal renders ✓
```

### Validate SSO config (Phase 2 — future)

```bash
# After deploying sso-callback Edge Function:
curl -X POST https://{project}.supabase.co/functions/v1/sso-callback \
  -H "Content-Type: application/json" \
  -d '{"tenant":"acme-corp","code":"<oidc_code>"}'
# Expected: { "user": {...}, "membership": {...} }
```

### Validate Audit Log (Phase 4 — future)

```sql
-- After any mutating action:
SELECT * FROM audit_log_entries ORDER BY created_at DESC LIMIT 5;
-- Expected: rows with actor_id, action, resource, created_at
```
