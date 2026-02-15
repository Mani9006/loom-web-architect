import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BarChart3, TrendingUp, Target, Briefcase, FileText, MessageSquare, Mic2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LineChart, Line, Legend, AreaChart, Area,
} from "recharts";
import { EmptyState } from "@/components/EmptyState";

const COLORS = ["hsl(12,76%,58%)", "hsl(28,80%,52%)", "hsl(160,50%,45%)", "hsl(340,65%,55%)", "hsl(200,70%,50%)"];

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<{ name: string; value: number }[]>([]);
  const [activityData, setActivityData] = useState<{ date: string; conversations: number; coverLetters: number; applications: number }[]>([]);
  const [totals, setTotals] = useState({ jobs: 0, conversations: 0, coverLetters: 0, interviews: 0 });
  const [skillData, setSkillData] = useState<{ skill: string; count: number }[]>([]);
  const [weeklyApplied, setWeeklyApplied] = useState<{ day: string; count: number }[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const [jobsRes, convsRes, clRes, resumesRes] = await Promise.all([
        supabase.from("tracked_jobs").select("id, status, created_at").eq("user_id", user.id),
        supabase.from("conversations").select("id, chat_mode, created_at").eq("user_id", user.id),
        supabase.from("cover_letters").select("id, created_at").eq("user_id", user.id),
        supabase.from("resumes").select("skills").eq("user_id", user.id).limit(1),
      ]);

      const jobs = jobsRes.data || [];
      const convs = convsRes.data || [];
      const cls = clRes.data || [];

      // Pipeline stats
      const statusCounts: Record<string, number> = {};
      jobs.forEach((j) => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });
      setJobStats(
        ["Saved", "Applied", "Interviewing", "Offer", "Rejected"]
          .map((s) => ({ name: s, value: statusCounts[s] || 0 }))
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
          count: jobs.filter((j) => j.status !== "Saved" && j.created_at?.slice(0, 10) === key).length,
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
          conversations: convs.filter((c) => c.created_at?.slice(0, 10) === key).length,
          coverLetters: cls.filter((c) => c.created_at?.slice(0, 10) === key).length,
          applications: jobs.filter((j) => j.created_at?.slice(0, 10) === key).length,
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

      const interviewConvs = convs.filter((c) => c.chat_mode === "interview-prep");
      setTotals({
        jobs: jobs.length,
        conversations: convs.length,
        coverLetters: cls.length,
        interviews: interviewConvs.length,
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

  const interviewRatio = totals.jobs > 0
    ? Math.round((jobStats.find((s) => s.name === "Interviewing")?.value || 0) / totals.jobs * 100)
    : 0;

  const statCards = [
    { label: "Jobs Tracked", value: totals.jobs, icon: Briefcase, color: "text-primary" },
    { label: "Interview Rate", value: `${interviewRatio}%`, icon: TrendingUp, color: "text-accent" },
    { label: "Cover Letters", value: totals.coverLetters, icon: FileText, color: "text-primary" },
    { label: "Mock Interviews", value: totals.interviews, icon: Mic2, color: "text-accent" },
  ];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-accent" /> Career Analytics
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Track your progress and identify areas for growth</p>
      </div>

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
            {totals.jobs === 0 ? (
              <EmptyState icon={Target} title="No applications yet" subtitle="Start tracking jobs to see your pipeline" className="py-8" />
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={jobStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
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
              <TrendingUp className="w-4 h-4 text-accent" /> Weekly Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={activityData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="applications" stroke={COLORS[2]} fill={COLORS[2]} fillOpacity={0.15} strokeWidth={2} name="Applications" />
                <Area type="monotone" dataKey="conversations" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} strokeWidth={2} name="Conversations" />
                <Area type="monotone" dataKey="coverLetters" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} strokeWidth={2} name="Cover Letters" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Jobs Applied This Week */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-primary" /> Jobs Applied This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyApplied} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
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
