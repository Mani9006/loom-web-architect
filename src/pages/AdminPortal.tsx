import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { isOwnerEmail } from "@/lib/admin";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import type { Database } from "@/integrations/supabase/types";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  ClipboardList,
  Crown,
  Database as DatabaseIcon,
  DollarSign,
  ExternalLink,
  GitBranch,
  KeyRound,
  Loader2,
  Rocket,
  RefreshCcw,
  Shield,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PortalRole = "admin" | "moderator" | "user";
type AccountStatus = "active" | "suspended" | "blocked";
type PurchaseState = "trial" | "active" | "past_due" | "canceled" | "manual";

type Tenant = Database["public"]["Tables"]["enterprise_tenants"]["Row"];
type Membership = Database["public"]["Tables"]["enterprise_memberships"]["Row"] & {
  profiles?: { full_name: string | null; email: string | null } | null;
};
type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type AuditEntry = Database["public"]["Tables"]["audit_log_entries"]["Row"];
type SsoConfig = Database["public"]["Tables"]["sso_configurations"]["Row"];

interface PortalResponse {
  generatedAt: string;
  ownerEmails: string[];
  company: {
    totalUsers: number;
    activeUsers7d: number;
    totalResumes: number;
    totalTrackedJobs: number;
    totalConversations: number;
    totalCoverLetters: number;
    totalDocuments: number;
    totalMessages: number;
    onboardingCompletedUsers: number;
  };
  auth: {
    totalAuthUsers: number;
    signedIn7d: number;
    signedIn30d: number;
    blockedAccounts: number;
    emailVerifiedUsers: number;
    googleAccounts: number;
    passwordAccounts: number;
  };
  access: {
    roleCounts: Record<PortalRole, number>;
    ownersPresent: Array<{ email: string | null; role: PortalRole; userId: string }>;
    model: string;
    subscriptionNote: string;
  };
  billing: {
    purchaseStateCounts: Record<PurchaseState, number>;
    planCounts: Record<string, number>;
    aiEnabledUsers: number;
    restrictedUsers: number;
  };
  apiCosts: {
    rangeDays: number;
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedAiCostRangeUsd: number;
    estimatedAiCostMonthlyUsd: number;
    fixedInfraMonthlyUsd: number;
    estimatedMonthlyTotalUsd: number;
  };
  trends: Array<{ date: string; signups: number; activeUsers: number }>;
  integrations: {
    openai: boolean;
    anthropic: boolean;
    perplexity: boolean;
    mem0: boolean;
    exa: boolean;
    serviceRole: boolean;
    supabaseUrl: boolean;
  };
  opsLinks: {
    vercel: string;
    supabase: string;
    github: string;
    jira: string;
    slack: string;
  };
  users: Array<{
    userId: string;
    email: string | null;
    fullName: string | null;
    location: string | null;
    targetRole: string | null;
    onboardingCompleted: boolean;
    role: PortalRole;
    createdAt: string;
    lastActiveAt: string;
    authProvider: string;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    isAuthBanned: boolean;
    bannedUntil: string | null;
    accountStatus: AccountStatus;
    purchaseState: PurchaseState;
    subscriptionPlan: string;
    aiFeaturesEnabled: boolean;
    blockedReason: string | null;
    blockedUntil: string | null;
    conversations: number;
    resumes: number;
    trackedJobs: number;
    appliedJobs: number;
    coverLetters: number;
    documents: number;
    messages30d: number;
    inputTokens30d: number;
    outputTokens30d: number;
    estimatedAiCost30dUsd: number;
  }>;
}

function OperationsTab({ data }: { data: PortalResponse | null }) {
  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">Operations data is not available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const integrations = [
    { name: "OpenAI", ok: data.integrations.openai },
    { name: "Anthropic", ok: data.integrations.anthropic },
    { name: "Perplexity", ok: data.integrations.perplexity },
    { name: "Mem0", ok: data.integrations.mem0 },
    { name: "Exa", ok: data.integrations.exa },
    { name: "Supabase URL", ok: data.integrations.supabaseUrl },
    { name: "Service Role", ok: data.integrations.serviceRole },
  ];

  const links = [
    { key: "vercel", name: "Vercel Project", icon: Rocket, url: data.opsLinks.vercel },
    { key: "supabase", name: "Supabase Dashboard", icon: DatabaseIcon, url: data.opsLinks.supabase },
    { key: "github", name: "GitHub Repository", icon: GitBranch, url: data.opsLinks.github },
    { key: "jira", name: "Jira Workspace", icon: ClipboardList, url: data.opsLinks.jira },
    { key: "slack", name: "Slack Workspace", icon: Users, url: data.opsLinks.slack },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integration Health</CardTitle>
          <CardDescription>Connected services used by ResumePreps production workflows.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {integrations.map((item) => (
            <div key={item.name} className="rounded-lg border px-3 py-2 flex items-center justify-between">
              <span className="text-sm font-medium">{item.name}</span>
              <Badge variant={item.ok ? "default" : "outline"}>{item.ok ? "Connected" : "Missing"}</Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Owner Quick Controls</CardTitle>
          <CardDescription>One-click access to the main platforms used to run the company.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {links.map((link) => {
            const Icon = link.icon;
            if (!link.url) {
              return (
                <div key={link.key} className="rounded-lg border px-3 py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <span className="text-sm">{link.name}</span>
                  </div>
                  <Badge variant="outline">Not set</Badge>
                </div>
              );
            }
            return (
              <Button key={link.key} variant="outline" asChild className="justify-between">
                <a href={link.url} target="_blank" rel="noreferrer">
                  <span className="inline-flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    {link.name}
                  </span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}

const CHART_COLORS = {
  active: "hsl(160, 50%, 45%)",
  signup: "hsl(12, 76%, 58%)",
};

function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function roleBadge(role: PortalRole): "default" | "secondary" | "outline" {
  if (role === "admin") return "default";
  if (role === "moderator") return "secondary";
  return "outline";
}

type AccessDraft = {
  accountStatus: AccountStatus;
  purchaseState: PurchaseState;
  subscriptionPlan: string;
  aiFeaturesEnabled: boolean;
  blockedReason: string;
  blockedUntil: string;
};

function OverviewTab({
  loading,
  refreshing,
  rangeDays,
  setRangeDays,
  data,
  roleDrafts,
  setRoleDrafts,
  accessDrafts,
  setAccessDrafts,
  savingRoles,
  savingAccess,
  actionBusy,
  userSearch,
  setUserSearch,
  onRefresh,
  onSaveRole,
  onSaveAccess,
  onCreateResetLink,
  onForceSignOut,
}: {
  loading: boolean;
  refreshing: boolean;
  rangeDays: 7 | 30 | 90;
  setRangeDays: (value: 7 | 30 | 90) => void;
  data: PortalResponse | null;
  roleDrafts: Record<string, PortalRole>;
  setRoleDrafts: React.Dispatch<React.SetStateAction<Record<string, PortalRole>>>;
  accessDrafts: Record<string, AccessDraft>;
  setAccessDrafts: React.Dispatch<React.SetStateAction<Record<string, AccessDraft>>>;
  savingRoles: Record<string, boolean>;
  savingAccess: Record<string, boolean>;
  actionBusy: Record<string, boolean>;
  userSearch: string;
  setUserSearch: React.Dispatch<React.SetStateAction<string>>;
  onRefresh: () => void;
  onSaveRole: (userId: string) => Promise<void>;
  onSaveAccess: (userId: string) => Promise<void>;
  onCreateResetLink: (userId: string, email: string | null) => Promise<void>;
  onForceSignOut: (userId: string) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((idx) => (
            <Skeleton key={idx} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-muted-foreground">No admin data available yet.</p>
        </CardContent>
      </Card>
    );
  }

  const filteredUsers = data.users.filter((item) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    return (
      (item.fullName || "").toLowerCase().includes(q) ||
      (item.email || "").toLowerCase().includes(q) ||
      item.userId.toLowerCase().includes(q) ||
      item.subscriptionPlan.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input
          placeholder="Search users, emails, plan..."
          value={userSearch}
          onChange={(e) => setUserSearch(e.target.value)}
          className="w-full md:w-[280px]"
        />
        <Select
          value={String(rangeDays)}
          onValueChange={(value) => setRangeDays(Number(value) as 7 | 30 | 90)}
        >
          <SelectTrigger className="w-[130px]">
            <SelectValue placeholder="Range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="gap-2" disabled={refreshing} onClick={onRefresh}>
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <Users className="w-4 h-4" /> Total Users
            </CardDescription>
            <CardTitle className="text-3xl">{formatNumber(data.company.totalUsers)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Active in 7 days: <span className="font-medium">{formatNumber(data.company.activeUsers7d)}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Auth Sign-ins (30d)</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(data.auth.signedIn30d)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              7 days: {formatNumber(data.auth.signedIn7d)} | Verified emails: {formatNumber(data.auth.emailVerifiedUsers)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" /> AI/API Monthly (Est.)
            </CardDescription>
            <CardTitle className="text-2xl">{formatUsd(data.apiCosts.estimatedAiCostMonthlyUsd)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Tokens ({data.apiCosts.rangeDays}d): {formatNumber(data.apiCosts.totalTokens)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Blocked or Restricted</CardDescription>
            <CardTitle className="text-2xl">{formatNumber(data.billing.restrictedUsers)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Banned auth users: {formatNumber(data.auth.blockedAccounts)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> Total Monthly (Est.)
            </CardDescription>
            <CardTitle className="text-2xl">{formatUsd(data.apiCosts.estimatedMonthlyTotalUsd)}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Infra fixed: {formatUsd(data.apiCosts.fixedInfraMonthlyUsd)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Growth & Activity Trend</CardTitle>
            <CardDescription>Daily signups vs active users over the selected period.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={data.trends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="signups"
                  stroke={CHART_COLORS.signup}
                  fill={CHART_COLORS.signup}
                  fillOpacity={0.18}
                  strokeWidth={2}
                  name="Signups"
                />
                <Area
                  type="monotone"
                  dataKey="activeUsers"
                  stroke={CHART_COLORS.active}
                  fill={CHART_COLORS.active}
                  fillOpacity={0.18}
                  strokeWidth={2}
                  name="Active Users"
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Access & Subscription</CardTitle>
            <CardDescription>{data.access.model}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm">Admins</span>
              <Badge variant="default">{data.access.roleCounts.admin || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Moderators</span>
              <Badge variant="secondary">{data.access.roleCounts.moderator || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Users</span>
              <Badge variant="outline">{data.access.roleCounts.user || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Paid (active)</span>
              <Badge variant="secondary">{data.billing.purchaseStateCounts.active || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Past due</span>
              <Badge variant="outline">{data.billing.purchaseStateCounts.past_due || 0}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm">Canceled</span>
              <Badge variant="outline">{data.billing.purchaseStateCounts.canceled || 0}</Badge>
            </div>
            <div className="pt-2 text-xs text-muted-foreground leading-relaxed">
              {data.access.subscriptionNote}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>User Management</CardTitle>
          <CardDescription>
            Owner-only controls for role, account status, purchase state, AI feature access, and recovery actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Auth</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>AI</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Sign-in</TableHead>
                <TableHead>Usage</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredUsers.slice(0, 120).map((item) => {
                const accessDraft = accessDrafts[item.userId] || {
                  accountStatus: item.accountStatus,
                  purchaseState: item.purchaseState,
                  subscriptionPlan: item.subscriptionPlan || "free",
                  aiFeaturesEnabled: item.aiFeaturesEnabled,
                  blockedReason: item.blockedReason || "",
                  blockedUntil: item.blockedUntil || "",
                };

                return (
                <TableRow key={item.userId}>
                  <TableCell>
                    <div className="font-medium">{item.fullName || item.email || "Unknown user"}</div>
                    <div className="text-xs text-muted-foreground">{item.email || item.userId}</div>
                  </TableCell>
                  <TableCell className="text-xs">
                    <div className="space-y-1">
                      <div>Provider: {item.authProvider || "unknown"}</div>
                      <div>{item.emailConfirmedAt ? "Verified" : "Unverified"}</div>
                      <div>{item.isAuthBanned ? "Banned in Auth" : "Not banned"}</div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-2">
                      <Badge variant={roleBadge(item.role)}>{item.role}</Badge>
                      <Select
                        value={roleDrafts[item.userId] || item.role}
                        onValueChange={(value) =>
                          setRoleDrafts((prev) => ({ ...prev, [item.userId]: value as PortalRole }))
                        }
                      >
                        <SelectTrigger className="h-8 w-[130px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="admin">admin</SelectItem>
                          <SelectItem value="moderator">moderator</SelectItem>
                          <SelectItem value="user">user</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Select
                      value={accessDraft.purchaseState}
                      onValueChange={(value) =>
                        setAccessDrafts((prev) => ({
                          ...prev,
                          [item.userId]: { ...accessDraft, purchaseState: value as PurchaseState },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="trial">trial</SelectItem>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="past_due">past_due</SelectItem>
                        <SelectItem value="canceled">canceled</SelectItem>
                        <SelectItem value="manual">manual</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Input
                      value={accessDraft.subscriptionPlan}
                      onChange={(e) =>
                        setAccessDrafts((prev) => ({
                          ...prev,
                          [item.userId]: { ...accessDraft, subscriptionPlan: e.target.value.toLowerCase() || "free" },
                        }))
                      }
                      className="h-8 w-[120px]"
                    />
                  </TableCell>
                  <TableCell>
                    <Switch
                      checked={accessDraft.aiFeaturesEnabled}
                      onCheckedChange={(checked) =>
                        setAccessDrafts((prev) => ({
                          ...prev,
                          [item.userId]: { ...accessDraft, aiFeaturesEnabled: checked },
                        }))
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <Select
                      value={accessDraft.accountStatus}
                      onValueChange={(value) =>
                        setAccessDrafts((prev) => ({
                          ...prev,
                          [item.userId]: { ...accessDraft, accountStatus: value as AccountStatus },
                        }))
                      }
                    >
                      <SelectTrigger className="h-8 w-[130px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">active</SelectItem>
                        <SelectItem value="suspended">suspended</SelectItem>
                        <SelectItem value="blocked">blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-xs">{item.lastSignInAt ? formatDate(item.lastSignInAt) : "-"}</TableCell>
                  <TableCell className="text-xs">
                    C:{item.conversations} R:{item.resumes} J:{item.trackedJobs}
                    <br />
                    Tokens:{formatNumber(item.inputTokens30d + item.outputTokens30d)} · {formatUsd(item.estimatedAiCost30dUsd)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingRoles[item.userId]}
                        onClick={() => void onSaveRole(item.userId)}
                      >
                        {savingRoles[item.userId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Role"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={savingAccess[item.userId]}
                        onClick={() => void onSaveAccess(item.userId)}
                      >
                        {savingAccess[item.userId] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Access"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionBusy[`reset:${item.userId}`]}
                        onClick={() => void onCreateResetLink(item.userId, item.email)}
                      >
                        {actionBusy[`reset:${item.userId}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Reset Link"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={actionBusy[`logout:${item.userId}`]}
                        onClick={() => void onForceSignOut(item.userId)}
                      >
                        {actionBusy[`logout:${item.userId}`] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Force Logout"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              )})}
            </TableBody>
          </Table>
          {filteredUsers.length > 120 && (
            <p className="text-xs text-muted-foreground mt-3">
              Showing first 120 results. Use search to narrow to a specific account.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

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

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !slug.trim()) return;
    setCreating(true);
    const { error } = await supabase.from("enterprise_tenants").insert({ name: name.trim(), slug: slug.trim() });
    if (error) {
      toast({ title: "Failed to create tenant", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Tenant created" });
      setName("");
      setSlug("");
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
              <Input
                id="tenant-slug"
                placeholder="acme-corp"
                value={slug}
                onChange={(e) =>
                  setSlug(
                    e.target.value
                      .toLowerCase()
                      .replace(/[^a-z0-9-]/g, "-")
                      .replace(/-+/g, "-")
                      .replace(/^-|-$/g, ""),
                  )
                }
              />
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
                    <Badge variant={t.sso_enabled ? "default" : "outline"}>{t.sso_enabled ? "SSO on" : "SSO off"}</Badge>
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

function MembersTab() {
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("enterprise_memberships")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      toast({ title: "Error loading members", description: error.message, variant: "destructive" });
      setMemberships([]);
      setLoading(false);
      return;
    }

    const memberships = data ?? [];
    const userIds = Array.from(new Set(memberships.map((item) => item.user_id)));
    const profileMap = new Map<string, Pick<Profile, "full_name" | "email">>();

    if (userIds.length > 0) {
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("user_id, full_name, email")
        .in("user_id", userIds);

      if (profilesError) {
        toast({ title: "Error loading member profiles", description: profilesError.message, variant: "destructive" });
      } else {
        (profilesData ?? []).forEach((profile) => {
          profileMap.set(profile.user_id, {
            full_name: profile.full_name,
            email: profile.email,
          });
        });
      }
    }

    const enrichedMemberships: Membership[] = memberships.map((membership) => ({
      ...membership,
      profiles: profileMap.get(membership.user_id) ?? null,
    }));

    setMemberships(enrichedMemberships);
    setLoading(false);
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const rolePill = (r: string) => {
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
                <Badge variant={rolePill(m.tenant_role)}>{m.tenant_role}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  useEffect(() => {
    void load();
  }, [load]);

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
            <p className="text-xs text-muted-foreground">Create a tenant first, then configure SSO here.</p>
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
                <Badge variant={c.enabled ? "default" : "outline"}>{c.enabled ? "Active" : "Disabled"}</Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

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

  useEffect(() => {
    void load();
  }, [load]);

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
                    Actor: {e.actor_id ? e.actor_id.slice(0, 8) + "…" : "system"} · {new Date(e.created_at).toLocaleString()}
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

export default function AdminPortal() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rangeDays, setRangeDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<PortalResponse | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, PortalRole>>({});
  const [accessDrafts, setAccessDrafts] = useState<Record<string, AccessDraft>>({});
  const [savingRoles, setSavingRoles] = useState<Record<string, boolean>>({});
  const [savingAccess, setSavingAccess] = useState<Record<string, boolean>>({});
  const [actionBusy, setActionBusy] = useState<Record<string, boolean>>({});
  const [userSearch, setUserSearch] = useState("");

  const callAdminPortal = useCallback(
    async (payload: Record<string, unknown>) => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        navigate("/auth");
        throw new Error("Session not available.");
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!supabaseUrl || !publishableKey) {
        throw new Error("Supabase environment variables are missing for admin portal.");
      }

      const response = await fetch(`${supabaseUrl}/functions/v1/admin-portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: publishableKey,
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Admin action failed (${response.status}): ${body}`);
      }

      return await response.json();
    },
    [navigate],
  );

  const fetchPortal = useCallback(
    async (isRefresh = false) => {
      if (!user) return;
      if (!isOwnerEmail(user.email)) return;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);

      try {
        const payload = (await callAdminPortal({ action: "summary", rangeDays })) as PortalResponse;
        setData(payload);
        setRoleDrafts(
          payload.users.reduce<Record<string, PortalRole>>((acc, item) => {
            acc[item.userId] = item.role;
            return acc;
          }, {}),
        );
        setAccessDrafts(
          payload.users.reduce<Record<string, AccessDraft>>((acc, item) => {
            acc[item.userId] = {
              accountStatus: item.accountStatus,
              purchaseState: item.purchaseState,
              subscriptionPlan: item.subscriptionPlan || "free",
              aiFeaturesEnabled: item.aiFeaturesEnabled,
              blockedReason: item.blockedReason || "",
              blockedUntil: item.blockedUntil || "",
            };
            return acc;
          }, {}),
        );
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [callAdminPortal, rangeDays, user],
  );

  useEffect(() => {
    if (!user) return;
    if (!isOwnerEmail(user.email)) return;
    void fetchPortal();
  }, [fetchPortal, user]);

  const saveRole = useCallback(
    async (targetUserId: string) => {
      if (!data) return;
      const role = roleDrafts[targetUserId];
      if (!role) return;

      try {
        setSavingRoles((prev) => ({ ...prev, [targetUserId]: true }));
        await callAdminPortal({ action: "set-role", targetUserId, role });
        toast({ title: "Role updated" });
        await fetchPortal(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update role");
      } finally {
        setSavingRoles((prev) => ({ ...prev, [targetUserId]: false }));
      }
    },
    [callAdminPortal, data, fetchPortal, roleDrafts, toast],
  );

  const saveAccess = useCallback(
    async (targetUserId: string) => {
      const draft = accessDrafts[targetUserId];
      if (!draft) return;
      try {
        setSavingAccess((prev) => ({ ...prev, [targetUserId]: true }));
        await callAdminPortal({
          action: "set-account-access",
          targetUserId,
          accountStatus: draft.accountStatus,
          purchaseState: draft.purchaseState,
          subscriptionPlan: draft.subscriptionPlan,
          aiFeaturesEnabled: draft.aiFeaturesEnabled,
          blockedReason: draft.blockedReason || null,
          blockedUntil: draft.blockedUntil || null,
        });
        toast({ title: "Access updated" });
        await fetchPortal(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update account access");
      } finally {
        setSavingAccess((prev) => ({ ...prev, [targetUserId]: false }));
      }
    },
    [accessDrafts, callAdminPortal, fetchPortal, toast],
  );

  const createResetLink = useCallback(
    async (targetUserId: string, email: string | null) => {
      const key = `reset:${targetUserId}`;
      try {
        setActionBusy((prev) => ({ ...prev, [key]: true }));
        const payload = (await callAdminPortal({
          action: "password-reset-link",
          targetUserId,
          email,
        })) as { result?: { resetLink?: string } };

        const resetLink = payload?.result?.resetLink;
        if (!resetLink) throw new Error("No reset link returned.");

        await navigator.clipboard.writeText(resetLink);
        toast({ title: "Password reset link copied", description: "Share this link securely with the user." });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to generate reset link");
      } finally {
        setActionBusy((prev) => ({ ...prev, [key]: false }));
      }
    },
    [callAdminPortal, toast],
  );

  const forceSignOut = useCallback(
    async (targetUserId: string) => {
      const key = `logout:${targetUserId}`;
      try {
        setActionBusy((prev) => ({ ...prev, [key]: true }));
        await callAdminPortal({ action: "force-signout", targetUserId });
        toast({ title: "User signed out of all sessions" });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to force sign out");
      } finally {
        setActionBusy((prev) => ({ ...prev, [key]: false }));
      }
    },
    [callAdminPortal, toast],
  );

  const lastUpdated = useMemo(() => (data?.generatedAt ? formatDate(data.generatedAt) : "-"), [data?.generatedAt]);

  if (!user) return null;

  if (!isOwnerEmail(user.email)) return <Navigate to="/home" replace />;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Crown className="w-6 h-6 text-primary" /> Admin Portal
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Company health, enterprise controls, user access, and AI/API costs in one place.
          </p>
          <p className="text-xs text-muted-foreground mt-1">Signed in as: {user.email}</p>
          <p className="text-xs text-muted-foreground mt-1">Last overview update: {lastUpdated}</p>
        </div>
        <Badge variant="secondary" className="gap-1">
          <Shield className="w-3 h-3" /> Owner
        </Badge>
      </div>

      {error && (
        <Card className="border-destructive/40">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold">Admin Portal Error</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview" className="gap-1.5">
            <ShieldCheck className="w-4 h-4" /> Overview
          </TabsTrigger>
          <TabsTrigger value="operations" className="gap-1.5">
            <Rocket className="w-4 h-4" /> Operations
          </TabsTrigger>
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
            <ClipboardList className="w-4 h-4" /> Audit
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab
            loading={loading}
            refreshing={refreshing}
            rangeDays={rangeDays}
            setRangeDays={setRangeDays}
            data={data}
            roleDrafts={roleDrafts}
            setRoleDrafts={setRoleDrafts}
            accessDrafts={accessDrafts}
            setAccessDrafts={setAccessDrafts}
            savingRoles={savingRoles}
            savingAccess={savingAccess}
            actionBusy={actionBusy}
            userSearch={userSearch}
            setUserSearch={setUserSearch}
            onRefresh={() => void fetchPortal(true)}
            onSaveRole={(userId) => saveRole(userId)}
            onSaveAccess={(userId) => saveAccess(userId)}
            onCreateResetLink={(userId, email) => createResetLink(userId, email)}
            onForceSignOut={(userId) => forceSignOut(userId)}
          />
        </TabsContent>
        <TabsContent value="operations" className="mt-4">
          <OperationsTab data={data} />
        </TabsContent>

        <TabsContent value="tenants" className="mt-4">
          <TenantsTab />
        </TabsContent>
        <TabsContent value="members" className="mt-4">
          <MembersTab />
        </TabsContent>
        <TabsContent value="sso" className="mt-4">
          <SsoTab />
        </TabsContent>
        <TabsContent value="audit" className="mt-4">
          <AuditLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
