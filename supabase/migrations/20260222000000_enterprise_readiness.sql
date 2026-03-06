-- Enterprise Readiness Blueprint: Phase 1 Schema
-- Covers: SSO config, RBAC tenant roles, audit logs, enterprise tenants & memberships

-- ─────────────────────────────────────────────
-- 1. Extend app_role enum with enterprise roles
-- ─────────────────────────────────────────────
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'enterprise_admin';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'enterprise_member';

-- ─────────────────────────────────────────────
-- 2. Enterprise tenants
-- ─────────────────────────────────────────────
CREATE TABLE public.enterprise_tenants (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name           TEXT        NOT NULL,
  slug           TEXT        NOT NULL UNIQUE,
  plan           TEXT        NOT NULL DEFAULT 'enterprise'
                               CHECK (plan IN ('enterprise', 'enterprise_plus')),
  sso_enabled    BOOLEAN     NOT NULL DEFAULT false,
  max_seats      INTEGER     NOT NULL DEFAULT 25,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.enterprise_tenants ENABLE ROW LEVEL SECURITY;

-- Admins can manage all tenants
CREATE POLICY "Admins can manage tenants"
  ON public.enterprise_tenants
  USING (public.has_role(auth.uid(), 'admin'));

-- Enterprise admins can view their own tenant
CREATE POLICY "Enterprise admins can view their tenant"
  ON public.enterprise_tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_memberships em
      WHERE em.tenant_id = enterprise_tenants.id
        AND em.user_id   = auth.uid()
        AND em.tenant_role IN ('owner', 'admin')
    )
  );

-- Enterprise members can view their own tenant
CREATE POLICY "Enterprise members can view their tenant"
  ON public.enterprise_tenants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_memberships em
      WHERE em.tenant_id = enterprise_tenants.id
        AND em.user_id   = auth.uid()
    )
  );

-- ─────────────────────────────────────────────
-- 3. Enterprise memberships (tenant ↔ user)
-- ─────────────────────────────────────────────
CREATE TABLE public.enterprise_memberships (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES public.enterprise_tenants(id) ON DELETE CASCADE,
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_role TEXT        NOT NULL DEFAULT 'member'
                            CHECK (tenant_role IN ('owner', 'admin', 'member', 'viewer')),
  invited_by  UUID        REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);

CREATE INDEX idx_enterprise_memberships_tenant ON public.enterprise_memberships(tenant_id);
CREATE INDEX idx_enterprise_memberships_user   ON public.enterprise_memberships(user_id);

ALTER TABLE public.enterprise_memberships ENABLE ROW LEVEL SECURITY;

-- Members can see memberships in their tenants
CREATE POLICY "Members can view tenant memberships"
  ON public.enterprise_memberships FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.enterprise_memberships em2
      WHERE em2.tenant_id = enterprise_memberships.tenant_id
        AND em2.user_id   = auth.uid()
        AND em2.tenant_role IN ('owner', 'admin')
    )
  );

-- Tenant owners/admins can invite members
CREATE POLICY "Tenant admins can manage memberships"
  ON public.enterprise_memberships FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.enterprise_memberships em2
      WHERE em2.tenant_id = enterprise_memberships.tenant_id
        AND em2.user_id   = auth.uid()
        AND em2.tenant_role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Tenant admins can update memberships"
  ON public.enterprise_memberships FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.enterprise_memberships em2
      WHERE em2.tenant_id = enterprise_memberships.tenant_id
        AND em2.user_id   = auth.uid()
        AND em2.tenant_role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Tenant admins can delete memberships"
  ON public.enterprise_memberships FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.enterprise_memberships em2
      WHERE em2.tenant_id = enterprise_memberships.tenant_id
        AND em2.user_id   = auth.uid()
        AND em2.tenant_role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────
-- 4. SSO configurations (SAML 2.0 / OIDC)
-- ─────────────────────────────────────────────
CREATE TABLE public.sso_configurations (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID        NOT NULL UNIQUE REFERENCES public.enterprise_tenants(id) ON DELETE CASCADE,
  protocol        TEXT        NOT NULL DEFAULT 'oidc'
                                CHECK (protocol IN ('saml', 'oidc')),
  -- OIDC fields
  issuer_url      TEXT,
  client_id       TEXT,
  -- SAML fields
  idp_metadata_url TEXT,
  sp_acs_url      TEXT,
  -- shared
  attribute_map   JSONB       NOT NULL DEFAULT '{"email":"email","name":"name"}'::jsonb,
  enabled         BOOLEAN     NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sso_configurations ENABLE ROW LEVEL SECURITY;

-- Only platform admins and tenant owners can manage SSO config
CREATE POLICY "Admins can manage SSO configurations"
  ON public.sso_configurations
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Tenant admins can view their SSO config"
  ON public.sso_configurations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_memberships em
      WHERE em.tenant_id = sso_configurations.tenant_id
        AND em.user_id   = auth.uid()
        AND em.tenant_role IN ('owner', 'admin')
    )
  );

-- ─────────────────────────────────────────────
-- 5. Audit log entries
-- ─────────────────────────────────────────────
CREATE TABLE public.audit_log_entries (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        REFERENCES public.enterprise_tenants(id) ON DELETE SET NULL,
  actor_id    UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      TEXT        NOT NULL,   -- e.g. "resume.created", "user.role_changed"
  resource    TEXT,                   -- e.g. "resume", "user_role"
  resource_id TEXT,                   -- UUID or other identifier of the affected record
  metadata    JSONB       NOT NULL DEFAULT '{}'::jsonb,
  ip_address  TEXT,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_tenant    ON public.audit_log_entries(tenant_id);
CREATE INDEX idx_audit_log_actor     ON public.audit_log_entries(actor_id);
CREATE INDEX idx_audit_log_action    ON public.audit_log_entries(action);
CREATE INDEX idx_audit_log_created   ON public.audit_log_entries(created_at DESC);

ALTER TABLE public.audit_log_entries ENABLE ROW LEVEL SECURITY;

-- Platform admins can see all audit entries
CREATE POLICY "Admins can view all audit logs"
  ON public.audit_log_entries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Tenant admins/owners can view their tenant's audit logs
CREATE POLICY "Tenant admins can view their audit logs"
  ON public.audit_log_entries FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.enterprise_memberships em
      WHERE em.tenant_id = audit_log_entries.tenant_id
        AND em.user_id   = auth.uid()
        AND em.tenant_role IN ('owner', 'admin')
    )
  );

-- Audit entries are written by service-role only (no user INSERT policy needed)
-- Applications call a SECURITY DEFINER helper below.

-- ─────────────────────────────────────────────
-- 6. Helper function: write_audit_log
-- ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_audit_log(
  p_actor_id    UUID,
  p_action      TEXT,
  p_resource    TEXT    DEFAULT NULL,
  p_resource_id TEXT    DEFAULT NULL,
  p_tenant_id   UUID    DEFAULT NULL,
  p_metadata    JSONB   DEFAULT '{}'::jsonb,
  p_ip_address  TEXT    DEFAULT NULL,
  p_user_agent  TEXT    DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.audit_log_entries
    (actor_id, action, resource, resource_id, tenant_id, metadata, ip_address, user_agent)
  VALUES
    (p_actor_id, p_action, p_resource, p_resource_id, p_tenant_id, p_metadata, p_ip_address, p_user_agent)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- ─────────────────────────────────────────────
-- 7. updated_at triggers for new tables
-- ─────────────────────────────────────────────
CREATE TRIGGER update_enterprise_tenants_updated_at
  BEFORE UPDATE ON public.enterprise_tenants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sso_configurations_updated_at
  BEFORE UPDATE ON public.sso_configurations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────
-- 8. Global admin can read all enterprise data
-- ─────────────────────────────────────────────
CREATE POLICY "Admins can view all enterprise memberships"
  ON public.enterprise_memberships FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));
