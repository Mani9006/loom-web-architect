import { useCallback, useEffect, useState } from "react";
import {
  Building2,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Loader2,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";

type Tenant = Database["public"]["Tables"]["enterprise_tenants"]["Row"];
type Membership = Database["public"]["Tables"]["enterprise_memberships"]["Row"] & {
  profiles?: { full_name: string | null; email: string | null } | null;
};
type AuditEntry = Database["public"]["Tables"]["audit_log_entries"]["Row"];
type SsoConfig = Database["public"]["Tables"]["sso_configurations"]["Row"];

// ─── Tenants tab ──────────────────────────────────────────────────────────────

function TenantsTab() {
  const { toast } = useToast();
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enterprise_tenants")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Error loading tenants", description: error.message, variant: "destructive" });
    setTenants(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("enterprise_tenants").insert({ name: name.trim(), slug: slug.trim() });
    if (error) {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tenant created" });
      setName(""); setSlug("");
      void load();
    }
    setCreating(false);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create Enterprise Tenant</CardTitle>
          <CardDescription>Provision a new isolated tenant workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label htmlFor="tenant-name">Company Name</Label>
              <Input id="tenant-name" placeholder="Acme Corp" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="space-y-1 flex-1 min-w-[180px]">
              <Label htmlFor="tenant-slug">Slug (unique)</Label>
              <Input id="tenant-slug" placeholder="acme-corp" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""))} />
            </div>
            <Button type="submit" disabled={creating || !name || !slug} className="gap-2">
              {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4" />}
              Create
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base">Active Tenants</CardTitle>
            <CardDescription>{tenants.length} tenant{tenants.length !== 1 ? "s" : ""} provisioned</CardDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => void load()}>
            <RefreshCcw className="w-4 h-4" />
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
          ) : tenants.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No tenants yet.</p>
          ) : (
            <div className="space-y-2">
              {tenants.map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">/{t.slug} · {t.max_seats} seats</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant={t.sso_enabled ? "default" : "outline"}>
                      {t.sso_enabled ? "SSO on" : "SSO off"}
                    </Badge>
                    <Badge variant="secondary">{t.plan}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Members tab ──────────────────────────────────────────────────────────────

function MembersTab() {
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enterprise_memberships")
      .select("*, profiles(full_name, email)")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) toast({ title: "Error loading members", description: error.message, variant: "destructive" });
    setMemberships((data as Membership[]) ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const roleBadge = (r: string) => {
    if (r === "owner") return "default" as const;
    if (r === "admin") return "secondary" as const;
    return "outline" as const;
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Enterprise Members</CardTitle>
          <CardDescription>All tenant memberships across the platform.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCcw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : memberships.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">No memberships yet.</p>
        ) : (
          <div className="space-y-2">
            {memberships.map((m) => (
              <div key={m.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {m.profiles?.full_name ?? m.profiles?.email ?? m.user_id}
                  </p>
                  <p className="text-xs text-muted-foreground">Tenant: {m.tenant_id.slice(0, 8)}…</p>
                </div>
                <Badge variant={roleBadge(m.tenant_role)}>{m.tenant_role}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── SSO tab ──────────────────────────────────────────────────────────────────

function SsoTab() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<SsoConfig[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sso_configurations")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) toast({ title: "Error loading SSO configs", description: error.message, variant: "destructive" });
    setConfigs(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">SSO Configurations</CardTitle>
          <CardDescription>SAML 2.0 and OIDC identity provider settings per tenant.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCcw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : configs.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <KeyRound className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No SSO configurations yet.</p>
            <p className="text-xs text-muted-foreground">
              SSO configs are created per tenant. Create a tenant first, then configure SSO here.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {configs.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">Tenant: {c.tenant_id.slice(0, 8)}…</p>
                  <p className="text-xs text-muted-foreground">
                    {c.protocol.toUpperCase()} · {c.issuer_url ?? c.idp_metadata_url ?? "–"}
                  </p>
                </div>
                <Badge variant={c.enabled ? "default" : "outline"}>
                  {c.enabled ? "Active" : "Disabled"}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Audit Log tab ────────────────────────────────────────────────────────────

function AuditLogTab() {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("audit_log_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) toast({ title: "Error loading audit log", description: error.message, variant: "destructive" });
    setEntries(data ?? []);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  const actionColor = (action: string): "default" | "secondary" | "destructive" | "outline" => {
    if (action.includes("delete") || action.includes("removed")) return "destructive";
    if (action.includes("created") || action.includes("invited")) return "default";
    if (action.includes("updated") || action.includes("changed")) return "secondary";
    return "outline";
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base">Audit Log</CardTitle>
          <CardDescription>Immutable record of security-relevant platform events.</CardDescription>
        </div>
        <Button variant="ghost" size="icon" onClick={() => void load()}>
          <RefreshCcw className="w-4 h-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}</div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 space-y-2">
            <ClipboardList className="w-8 h-8 text-muted-foreground mx-auto" />
            <p className="text-sm text-muted-foreground">No audit events recorded yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.id} className="flex items-start justify-between rounded-lg border p-3 gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <Badge variant={actionColor(e.action)} className="text-xs">{e.action}</Badge>
                    {e.resource && <span className="text-xs text-muted-foreground">{e.resource}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Actor: {e.actor_id ? e.actor_id.slice(0, 8) + "…" : "system"} ·{" "}
                    {new Date(e.created_at).toLocaleString()}
                  </p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-1" />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AdminPortal() {
  const { user } = useAuth();

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Enterprise Admin Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Manage tenants, memberships, SSO, and audit logs for enterprise customers.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Signed in as: {user?.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Shield className="w-3 h-3" /> Admin
          </Badge>
        </div>
      </div>

      {/* KPI summary row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "SSO Protocols", value: "SAML 2.0, OIDC", icon: KeyRound },
          { label: "Tenant Roles", value: "owner · admin · member · viewer", icon: Users },
          { label: "Audit Retention", value: "90 days (default)", icon: ClipboardList },
          { label: "Max Seats / Tenant", value: "25 (enterprise)", icon: Building2 },
        ].map(({ label, value, icon: Icon }) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1.5 text-xs">
                <Icon className="w-3.5 h-3.5" /> {label}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm font-medium leading-tight">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="tenants">
        <TabsList>
          <TabsTrigger value="tenants" className="gap-1.5">
            <Building2 className="w-4 h-4" /> Tenants
          </TabsTrigger>
          <TabsTrigger value="members" className="gap-1.5">
            <Users className="w-4 h-4" /> Members
          </TabsTrigger>
          <TabsTrigger value="sso" className="gap-1.5">
            <KeyRound className="w-4 h-4" /> SSO
          </TabsTrigger>
          <TabsTrigger value="audit" className="gap-1.5">
            <ClipboardList className="w-4 h-4" /> Audit Log
          </TabsTrigger>
        </TabsList>

        <TabsContent value="tenants" className="mt-4"><TenantsTab /></TabsContent>
        <TabsContent value="members" className="mt-4"><MembersTab /></TabsContent>
        <TabsContent value="sso" className="mt-4"><SsoTab /></TabsContent>
        <TabsContent value="audit" className="mt-4"><AuditLogTab /></TabsContent>
      </Tabs>
    </div>
  );
}
