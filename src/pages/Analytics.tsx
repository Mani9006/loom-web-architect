import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, BarChart3, CheckCircle2, Clock3, Target, FileText } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, Legend, AreaChart, Area,
} from "recharts";
import { EmptyState } from "@/components/EmptyState";

const COLORS = ["hsl(12,76%,58%)", "hsl(28,80%,52%)", "hsl(160,50%,45%)", "hsl(340,65%,55%)", "hsl(200,70%,50%)"];

type PacketStatus = "draft" | "ready" | "queued" | "submitted" | "failed" | "skipped";

interface PacketRow {
  id: string;
  status: PacketStatus;
  created_at: string;
  submitted_at: string | null;
}

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<{ name: string; value: number }[]>([]);
  const [activityData, setActivityData] = useState<{ date: string; prepared: number; submitted: number }[]>([]);
  const [totals, setTotals] = useState({ packets: 0, prepared: 0, queued: 0, submitted: 0, failed: 0 });
  const [skillData, setSkillData] = useState<{ skill: string; count: number }[]>([]);
  const [weeklyApplied, setWeeklyApplied] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const [packetsRes, resumesRes] = await Promise.all([
        supabase.from("draft_applications").select("id,status,created_at,submitted_at").eq("user_id", user.id),
        supabase.from("resumes").select("skills").eq("user_id", user.id).limit(1),
      ]);

      const packets = (packetsRes.data || []) as PacketRow[];

      // Pipeline stats
      const statusCounts: Record<string, number> = {};
      packets.forEach((packet) => { statusCounts[packet.status] = (statusCounts[packet.status] || 0) + 1; });
      const prepared = (statusCounts.draft || 0) + (statusCounts.ready || 0);
      setJobStats(
        [
          { name: "Prepared", value: prepared },
          { name: "Queued", value: statusCounts.queued || 0 },
          { name: "Submitted", value: statusCounts.submitted || 0 },
          { name: "Needs attention", value: statusCounts.failed || 0 },
          { name: "Skipped", value: statusCounts.skipped || 0 },
        ]
      );

      // Weekly applied (last 7 days)
      const weekDays: { day: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        weekDays.push({
          day: label,
          count: packets.filter((packet) => packet.submitted_at?.slice(0, 10) === key).length,
        });
      }
      setWeeklyApplied(weekDays);

      // Activity over time
      const days: typeof activityData = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        days.push({
          date: label,
          prepared: packets.filter((packet) => packet.created_at?.slice(0, 10) === key).length,
          submitted: packets.filter((packet) => packet.submitted_at?.slice(0, 10) === key).length,
        });
      }
      setActivityData(days);

      // Skills frequency from resume
      const skillFreq: Record<string, number> = {};
      if (resumesRes.data && resumesRes.data.length > 0) {
        const skills = resumesRes.data[0].skills;
        if (skills && typeof skills === "object" && !Array.isArray(skills)) {
          Object.values(skills as Record<string, string[]>).forEach((arr) => {
            if (Array.isArray(arr)) {
              arr.forEach((s) => { skillFreq[s] = (skillFreq[s] || 0) + 1; });
            }
          });
        }
      }
      setSkillData(
        Object.entries(skillFreq)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 8)
          .map(([skill, count]) => ({ skill, count }))
      );

      setTotals({
        packets: packets.length,
        prepared,
        queued: statusCounts.queued || 0,
        submitted: statusCounts.submitted || 0,
        failed: statusCounts.failed || 0,
      });

      setLoading(false);
    };
    fetchData();
  }, [navigate]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Prepared", value: totals.prepared, icon: FileText, color: "text-primary" },
    { label: "Queued", value: totals.queued, icon: Clock3, color: "text-accent" },
    { label: "Verified submitted", value: totals.submitted, icon: CheckCircle2, color: "text-emerald-600" },
    { label: "Needs attention", value: totals.failed, icon: AlertTriangle, color: "text-rose-600" },
  ];

  return (
    <div className="max-w-[1180px] mx-auto px-6 lg:px-10 pt-10 pb-16 space-y-6">
      <PageHeader
        title="Application outcomes."
        status="receipts · conversion"
        description="Prepared packets, guarded queues, verified submissions, and issues that need your attention. Only a recorded submission receipt counts as applied."
      />

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((s) => (
          <Card key={s.label} className="hover:shadow-md transition-shadow duration-200">
            <CardContent className="pt-5 pb-4 px-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-muted-foreground">{s.label}</span>
                <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
                  <s.icon className={`w-4 h-4 ${s.color}`} />
                </div>
              </div>
              <div className="text-3xl font-bold">{s.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Application Pipeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Target className="w-4 h-4 text-primary" /> Application Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {totals.packets === 0 ? (
              <EmptyState icon={Target} title="No application packets yet" subtitle="Prepare a matched job to start measuring outcomes" className="py-8" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={jobStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "oklch(var(--card))", border: "1px solid oklch(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {jobStats.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Activity Over Time */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-accent" /> Weekly packet activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "oklch(var(--card))", border: "1px solid oklch(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="prepared" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} strokeWidth={2} name="Prepared" />
                <Area type="monotone" dataKey="submitted" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.15} strokeWidth={2} name="Verified submitted" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Jobs Applied This Week */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-primary" /> Verified submissions this week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyApplied} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="oklch(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "oklch(var(--card))", border: "1px solid oklch(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="count" fill={COLORS[0]} radius={[6, 6, 0, 0]} name="Applied" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Skills Frequency */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Skills From Resume
            </CardTitle>
          </CardHeader>
          <CardContent>
            {skillData.length === 0 ? (
              <EmptyState icon={FileText} title="No skills data" subtitle="Upload a resume to see your skills breakdown" className="py-8" />
            ) : (
              <div className="space-y-3">
                {skillData.map((s, i) => (
                  <div key={s.skill}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium truncate max-w-[150px]">{s.skill}</span>
                      <span className="text-xs text-muted-foreground">{s.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${Math.min(100, (s.count / Math.max(...skillData.map((d) => d.count))) * 100)}%`,
                          background: COLORS[i % COLORS.length],
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
