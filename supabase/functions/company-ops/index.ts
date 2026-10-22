import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ROLES = ["owner", "admin", "support", "billing", "engineer", "viewer"] as const;
type Role = (typeof ROLES)[number];
type Permission =
  | "billing"
  | "user_support"
  | "impersonate"
  | "promo_codes"
  | "worker_replay"
  | "feature_flags"
  | "audit_log";

const MATRIX: Record<Role, Permission[]> = {
  owner: ["billing", "user_support", "impersonate", "promo_codes", "worker_replay", "feature_flags", "audit_log"],
  admin: ["billing", "user_support", "impersonate", "promo_codes", "worker_replay", "feature_flags", "audit_log"],
  support: ["user_support", "impersonate", "audit_log"],
  billing: ["billing", "promo_codes", "audit_log"],
  engineer: ["audit_log"],
  viewer: ["audit_log"],
};

const DEFAULT_OWNER_EMAILS = ["myfamily9006@gmail.com"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function toLower(value: string | null | undefined) {
  return String(value || "").trim().toLowerCase();
}

function ownerEmails() {
  const raw = [Deno.env.get("OWNER_EMAIL"), Deno.env.get("ADMIN_OWNER_EMAILS")].filter(Boolean).join(",");
  const values = (raw || DEFAULT_OWNER_EMAILS.join(",")).split(",").map(toLower).filter(Boolean);
  return values.length ? values : DEFAULT_OWNER_EMAILS;
}

function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

function can(role: Role, permission: Permission) {
  return MATRIX[role].includes(permission);
}

function canInvite(actor: Role, invitee: Role) {
  if (actor === "owner") return true;
  if (actor === "admin") return invitee !== "owner";
  return false;
}

function canChange(actor: Role, target: Role, next: Role) {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner" && next !== "owner";
  return false;
}

function canRevoke(actor: Role, target: Role) {
  if (actor === "owner") return true;
  if (actor === "admin") return target !== "owner";
  return false;
}

async function audit(
  service: SupabaseClient,
  actorId: string,
  action: string,
  resource: string,
  resourceId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await service.rpc("write_audit_log", {
    p_actor_id: actorId,
    p_action: action,
    p_resource: resource,
    p_resource_id: resourceId,
    p_metadata: metadata,
  });
  if (error) console.error("audit write failed", error);
}

async function ensureOrg(service: SupabaseClient) {
  const { data } = await service.from("operator_orgs").select("*").eq("slug", "resumepreps").maybeSingle();
  if (data) return data as { id: string; name: string; slug: string; seat_limit: number; global_auto_apply: boolean };
  const { data: created, error } = await service
    .from("operator_orgs")
    .insert({ name: "ResumePreps", slug: "resumepreps", seat_limit: 25 })
    .select("*")
    .maybeSingle();
  if (error || !created) throw new Error(error?.message || "Could not create operator org");
  return created as { id: string; name: string; slug: string; seat_limit: number; global_auto_apply: boolean };
}

async function seedOwner(service: SupabaseClient, orgId: string, user: { id: string; email?: string | null }) {
  const email = toLower(user.email);
  if (!email || !ownerEmails().includes(email)) return;
  const { data: existing } = await service
    .from("operator_members")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing) return;
  await service.from("operator_members").insert({ org_id: orgId, user_id: user.id, role: "owner" });
}

async function membership(service: SupabaseClient, orgId: string, userId: string) {
  const { data } = await service
    .from("operator_members")
    .select("id, org_id, user_id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as { id: string; org_id: string; user_id: string; role: Role } | null;
}

async function usedSeats(service: SupabaseClient, orgId: string) {
  const { count: members } = await service
    .from("operator_members")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId);
  const { count: invites } = await service
    .from("operator_invites")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .is("accepted_at", null)
    .is("revoked_at", null);
  return (members || 0) + (invites || 0);
}

async function requirePerm(
  service: SupabaseClient,
  user: { id: string; email?: string | null },
  permission?: Permission,
) {
  const org = await ensureOrg(service);
  await seedOwner(service, org.id, user);
  const member = await membership(service, org.id, user.id);
  if (!member) throw new Error("Not a company member");
  if (permission && !can(member.role, permission)) throw new Error("Missing permission");
  return { org, member };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(supabaseUrl, anon, { global: { headers: { Authorization: authHeader } } });
    const service = createClient(supabaseUrl, serviceKey);
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) return json({ error: "Invalid auth" }, 401);

    const payload = await req.json().catch(() => ({}));
    const action = String(payload.action || "");

    if (action === "session") {
      const { org, member } = await requirePerm(service, user);
      const seats = await usedSeats(service, org.id);
      return json({
        org: { ...org, used_seats: seats },
        member: { ...member, email: user.email },
        permissions: MATRIX[member.role],
      });
    }

    if (action === "list_team") {
      const { org, member } = await requirePerm(service, user);
      const { data: members } = await service.from("operator_members").select("*").eq("org_id", org.id).order("created_at");
      const { data: invites } = await service
        .from("operator_invites")
        .select("*")
        .eq("org_id", org.id)
        .is("revoked_at", null)
        .is("accepted_at", null)
        .order("created_at", { ascending: false });
      const ids = (members || []).map((row: { user_id: string }) => row.user_id);
      const emails: Record<string, string> = {};
      for (const id of ids) {
        const { data } = await service.auth.admin.getUserById(id);
        if (data.user?.email) emails[id] = data.user.email;
      }
      return json({
        role: member.role,
        members: (members || []).map((row: { user_id: string }) => ({ ...row, email: emails[row.user_id] || "" })),
        invites: invites || [],
        seats: { used: await usedSeats(service, org.id), limit: org.seat_limit },
      });
    }

    if (action === "invite") {
      const { org, member } = await requirePerm(service, user);
      const email = toLower(payload.email);
      const role = payload.role;
      if (!email || !isRole(role)) return json({ error: "Email and role required" }, 400);
      if (!canInvite(member.role, role)) return json({ error: "Cannot invite that role" }, 403);
      if (await usedSeats(service, org.id) >= org.seat_limit) return json({ error: "No seats remaining" }, 400);
      const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await service
        .from("operator_invites")
        .insert({
          org_id: org.id,
          email,
          role,
          token,
          invited_by: user.id,
        })
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      await audit(service, user.id, "team.invite", "operator_invite", data?.id || null, { email, role });
      const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://resumepreps.com";
      return json({ invite: data, accept_url: `${origin}/invite/${token}` });
    }

    if (action === "revoke") {
      const { org, member } = await requirePerm(service, user);
      if (payload.inviteId) {
        const { data: invite } = await service.from("operator_invites").select("*").eq("id", payload.inviteId).maybeSingle();
        if (!invite || invite.org_id !== org.id) return json({ error: "Invite not found" }, 404);
        if (!canInvite(member.role, invite.role as Role)) return json({ error: "Cannot revoke that invite" }, 403);
        await service.from("operator_invites").update({ revoked_at: new Date().toISOString() }).eq("id", invite.id);
        await audit(service, user.id, "team.invite_revoke", "operator_invite", invite.id, { email: invite.email });
        return json({ ok: true });
      }
      if (payload.memberId) {
        const { data: target } = await service.from("operator_members").select("*").eq("id", payload.memberId).maybeSingle();
        if (!target || target.org_id !== org.id) return json({ error: "Member not found" }, 404);
        if (!canRevoke(member.role, target.role as Role)) return json({ error: "Cannot revoke that member" }, 403);
        if (target.role === "owner") {
          const { count } = await service
            .from("operator_members")
            .select("id", { count: "exact", head: true })
            .eq("org_id", org.id)
            .eq("role", "owner");
          if ((count || 0) <= 1) return json({ error: "Cannot revoke the last owner" }, 400);
        }
        await service.from("operator_members").delete().eq("id", target.id);
        await audit(service, user.id, "team.revoke", "operator_member", target.id, { user_id: target.user_id, role: target.role });
        return json({ ok: true });
      }
      return json({ error: "memberId or inviteId required" }, 400);
    }

    if (action === "change_role") {
      const { org, member } = await requirePerm(service, user);
      const next = payload.role;
      if (!isRole(next)) return json({ error: "Invalid role" }, 400);
      const { data: target } = await service.from("operator_members").select("*").eq("id", payload.memberId).maybeSingle();
      if (!target || target.org_id !== org.id) return json({ error: "Member not found" }, 404);
      if (!canChange(member.role, target.role as Role, next)) return json({ error: "Cannot change that role" }, 403);
      if (target.role === "owner" && next !== "owner") {
        const { count } = await service
          .from("operator_members")
          .select("id", { count: "exact", head: true })
          .eq("org_id", org.id)
          .eq("role", "owner");
        if ((count || 0) <= 1) return json({ error: "Cannot demote the last owner" }, 400);
      }
      await service.from("operator_members").update({ role: next, updated_at: new Date().toISOString() }).eq("id", target.id);
      await audit(service, user.id, "team.role_change", "operator_member", target.id, {
        user_id: target.user_id,
        from: target.role,
        to: next,
      });
      return json({ ok: true });
    }

    if (action === "accept_invite") {
      const token = String(payload.token || "");
      const { data: invite } = await service.from("operator_invites").select("*").eq("token", token).maybeSingle();
      if (!invite || invite.revoked_at || invite.accepted_at) return json({ error: "Invite is not valid" }, 400);
      if (new Date(invite.expires_at).getTime() < Date.now()) return json({ error: "Invite expired" }, 400);
      if (toLower(user.email) !== toLower(invite.email)) return json({ error: "Sign in with the invited email" }, 403);
      const { error } = await service.from("operator_members").insert({
        org_id: invite.org_id,
        user_id: user.id,
        role: invite.role,
      });
      if (error && !String(error.message).includes("duplicate")) return json({ error: error.message }, 400);
      await service.from("operator_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
      await audit(service, user.id, "team.accept_invite", "operator_invite", invite.id, { role: invite.role });
      return json({ ok: true, role: invite.role });
    }

    if (action === "search_users") {
      await requirePerm(service, user, "user_support");
      const q = toLower(payload.query);
      if (!q) return json({ users: [] });
      const { data } = await service.auth.admin.listUsers({ page: 1, perPage: 200 });
      const users = (data.users || [])
        .filter((row) => toLower(row.email).includes(q) || row.id.startsWith(q))
        .slice(0, 20);
      const ids = users.map((row) => row.id);
      const { data: balances } = ids.length
        ? await service.from("credit_balances").select("user_id, balance").in("user_id", ids)
        : { data: [] };
      const { data: access } = ids.length
        ? await service.from("user_access_controls").select("user_id, purchase_state, subscription_plan, account_status").in("user_id", ids)
        : { data: [] };
      const balanceMap = Object.fromEntries((balances || []).map((row: { user_id: string; balance: number }) => [row.user_id, row.balance]));
      const accessMap = Object.fromEntries((access || []).map((row: { user_id: string }) => [row.user_id, row]));
      return json({
        users: users.map((row) => ({
          id: row.id,
          email: row.email,
          created_at: row.created_at,
          balance: balanceMap[row.id] ?? 0,
          access: accessMap[row.id] || null,
        })),
      });
    }

    if (action === "grant_credits") {
      await requirePerm(service, user, "billing");
      const targetId = String(payload.userId || "");
      const delta = Number(payload.delta);
      if (!targetId || !Number.isFinite(delta) || delta === 0) return json({ error: "userId and nonzero delta required" }, 400);
      const { data, error } = await service.rpc("grant_credits", {
        p_user_id: targetId,
        p_delta: Math.trunc(delta),
        p_reason: delta > 0 ? "admin_grant" : "admin_refund",
        p_metadata: { actor_id: user.id, note: payload.note || "" },
      });
      if (error) return json({ error: error.message }, 400);
      await audit(service, user.id, delta > 0 ? "credits.grant" : "credits.refund", "credit_balances", targetId, {
        delta: Math.trunc(delta),
        note: payload.note || "",
      });
      return json({ balance: data });
    }

    if (action === "set_access") {
      await requirePerm(service, user, "user_support");
      const targetId = String(payload.userId || "");
      const patch: Record<string, unknown> = { user_id: targetId, updated_at: new Date().toISOString() };
      if (payload.account_status) patch.account_status = payload.account_status;
      if (payload.purchase_state) patch.purchase_state = payload.purchase_state;
      if (typeof payload.auto_apply_enabled === "boolean") patch.auto_apply_enabled = payload.auto_apply_enabled;
      await service.from("user_access_controls").upsert(patch, { onConflict: "user_id" });
      await audit(service, user.id, "user.access", "user_access_controls", targetId, patch);
      return json({ ok: true });
    }

    if (action === "reset_password") {
      await requirePerm(service, user, "user_support");
      const email = toLower(payload.email);
      if (!email) return json({ error: "email required" }, 400);
      const origin = req.headers.get("origin") || Deno.env.get("APP_URL") || "https://resumepreps.com";
      const { data, error } = await service.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${origin}/reset-password` },
      });
      if (error) return json({ error: error.message }, 400);
      await audit(service, user.id, "user.password_reset_link", "auth.users", email, {});
      return json({ link: data.properties?.action_link || null });
    }

    if (action === "impersonate") {
      await requirePerm(service, user, "impersonate");
      const targetId = String(payload.userId || "");
      if (!targetId) return json({ error: "userId required" }, 400);
      const { org } = await requirePerm(service, user);
      await service.from("operator_impersonations").insert({
        org_id: org.id,
        actor_id: user.id,
        target_user_id: targetId,
        reason: payload.reason || "read-only support",
      });
      const { data: target } = await service.auth.admin.getUserById(targetId);
      const { data: balance } = await service.from("credit_balances").select("*").eq("user_id", targetId).maybeSingle();
      const { data: access } = await service.from("user_access_controls").select("*").eq("user_id", targetId).maybeSingle();
      const { data: drafts } = await service
        .from("draft_applications")
        .select("id,status,updated_at")
        .eq("user_id", targetId)
        .order("updated_at", { ascending: false })
        .limit(8);
      await audit(service, user.id, "user.impersonate", "auth.users", targetId, { mode: "read_only" });
      return json({
        snapshot: {
          id: targetId,
          email: target.user?.email,
          balance,
          access,
          drafts: drafts || [],
        },
      });
    }

    if (action === "list_incidents") {
      await requirePerm(service, user, "audit_log");
      const { data } = await service.from("app_incidents").select("*").order("last_seen_at", { ascending: false }).limit(50);
      return json({ incidents: data || [] });
    }

    if (action === "list_audit") {
      await requirePerm(service, user, "audit_log");
      const { data } = await service.from("audit_log_entries").select("*").order("created_at", { ascending: false }).limit(80);
      return json({ entries: data || [] });
    }

    if (action === "list_codes") {
      await requirePerm(service, user, "promo_codes");
      const { org } = await requirePerm(service, user);
      const { data } = await service.from("operator_promo_codes").select("*").eq("org_id", org.id).order("created_at", { ascending: false });
      return json({ codes: data || [] });
    }

    if (action === "create_code") {
      const { org } = await requirePerm(service, user, "promo_codes");
      const code = String(payload.code || "").trim().toUpperCase();
      if (!code) return json({ error: "code required" }, 400);
      const { data, error } = await service
        .from("operator_promo_codes")
        .insert({
          org_id: org.id,
          code,
          kind: payload.kind === "referral" ? "referral" : "promo",
          percent_off: payload.percent_off ?? null,
          credits_grant: payload.credits_grant ?? null,
          max_redemptions: payload.max_redemptions ?? null,
          created_by: user.id,
        })
        .select("*")
        .maybeSingle();
      if (error) return json({ error: error.message }, 400);
      await audit(service, user.id, "promo.create", "operator_promo_codes", data?.id || null, { code });
      return json({ code: data });
    }

    if (action === "toggle_code") {
      await requirePerm(service, user, "promo_codes");
      await service.from("operator_promo_codes").update({ active: Boolean(payload.active) }).eq("id", payload.codeId);
      await audit(service, user.id, "promo.toggle", "operator_promo_codes", String(payload.codeId || ""), {
        active: Boolean(payload.active),
      });
      return json({ ok: true });
    }

    if (action === "health") {
      await requirePerm(service, user, "audit_log");
      const { data: beats } = await service.from("mc_worker_heartbeats").select("*").order("last_seen", { ascending: false }).limit(3);
      const last = beats?.[0]?.last_seen ? new Date(beats[0].last_seen).getTime() : 0;
      const { count } = await service
        .from("app_incidents")
        .select("id", { count: "exact", head: true })
        .gte("last_seen_at", new Date(Date.now() - 3600_000).toISOString());
      const { data: failed } = await service
        .from("applypass_tasks")
        .select("id,status,error_message,updated_at,user_id")
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(12);
      const { org } = await requirePerm(service, user);
      return json({
        supabase: "ok",
        stripe: Deno.env.get("STRIPE_SECRET_KEY") ? "configured" : "missing",
        email: Deno.env.get("RESEND_API_KEY") ? "configured" : "missing",
        worker: last && Date.now() - last < 15 * 60_000 ? "ok" : last ? "stale" : "missing",
        last_heartbeat: beats?.[0]?.last_seen || null,
        incidents_1h: count || 0,
        failed_tasks: failed || [],
        global_auto_apply: org.global_auto_apply,
      });
    }

    if (action === "set_kill_switch") {
      const { org } = await requirePerm(service, user, "feature_flags");
      await service
        .from("operator_orgs")
        .update({ global_auto_apply: Boolean(payload.enabled), updated_at: new Date().toISOString() })
        .eq("id", org.id);
      await audit(service, user.id, "flags.auto_apply", "operator_orgs", org.id, { enabled: Boolean(payload.enabled) });
      return json({ ok: true, global_auto_apply: Boolean(payload.enabled) });
    }

    if (action === "replay_task") {
      await requirePerm(service, user, "worker_replay");
      const taskId = String(payload.taskId || "");
      if (!taskId) return json({ error: "taskId required" }, 400);
      const { data: task } = await service.from("applypass_tasks").select("*").eq("id", taskId).maybeSingle();
      if (!task) return json({ error: "Task not found" }, 404);
      await service
        .from("applypass_tasks")
        .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", taskId);
      await audit(service, user.id, "worker.replay", "applypass_tasks", taskId, { previous: task.status });
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Company ops failed";
    const status = message.includes("permission") || message.includes("member") ? 403 : 500;
    return json({ error: message }, status);
  }
});
