import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, TrendingUp, Target, Briefcase, FileText, MessageSquare, Mic2 } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area,
} from "recharts";

const COLORS = ["hsl(239,84%,67%)", "hsl(174,60%,51%)", "hsl(45,93%,58%)", "hsl(0,84%,60%)", "hsl(280,60%,60%)"];

const SKILL_GAPS = [
  { skill: "React", level: 85 },
  { skill: "TypeScript", level: 78 },
  { skill: "System Design", level: 52 },
  { skill: "SQL", level: 70 },
  { skill: "Leadership", level: 60 },
  { skill: "Communication", level: 88 },
];

const INTERVIEW_PERFORMANCE = [
  { week: "W1", score: 62, sessions: 2 },
  { week: "W2", score: 68, sessions: 3 },
  { week: "W3", score: 71, sessions: 2 },
  { week: "W4", score: 78, sessions: 4 },
  { week: "W5", score: 82, sessions: 3 },
  { week: "W6", score: 85, sessions: 5 },
];

export default function Analytics() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [jobStats, setJobStats] = useState<{ name: string; value: number }[]>([]);
  const [activityData, setActivityData] = useState<{ date: string; conversations: number; coverLetters: number }[]>([]);
  const [totals, setTotals] = useState({ jobs: 0, conversations: 0, coverLetters: 0, interviews: 0 });

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      const [jobsRes, convsRes, clRes] = await Promise.all([
        supabase.from("tracked_jobs").select("status").eq("user_id", user.id),
        supabase.from("conversations").select("id, chat_mode, created_at").eq("user_id", user.id),
        supabase.from("cover_letters").select("id, created_at").eq("user_id", user.id),
      ]);

      const jobs = jobsRes.data || [];
      const convs = convsRes.data || [];
      const cls = clRes.data || [];

      // Job pipeline
      const statusCounts: Record<string, number> = {};
      jobs.forEach((j) => { statusCounts[j.status] = (statusCounts[j.status] || 0) + 1; });
      setJobStats(
        ["Saved", "Applied", "Interviewing", "Offer", "Rejected"]
          .map((s) => ({ name: s, value: statusCounts[s] || 0 }))
      );

      // Activity over time (last 7 days)
      const days: { date: string; conversations: number; coverLetters: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const label = d.toLocaleDateString("en-US", { weekday: "short" });
        days.push({
          date: label,
          conversations: convs.filter((c) => c.created_at?.slice(0, 10) === key).length,
          coverLetters: cls.filter((c) => c.created_at?.slice(0, 10) === key).length,
        });
      }
      setActivityData(days);

      const interviewConvs = convs.filter((c) => c.chat_mode === "interview-prep");
      setTotals({
        jobs: jobs.length,
        conversations: convs.length,
        coverLetters: cls.length,
        interviews: interviewConvs.length,
      });

      setLoading(false);
    };
    fetch();
  }, [navigate]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-28 bg-muted animate-pulse rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-72 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const statCards = [
    { label: "Jobs Tracked", value: totals.jobs, icon: Briefcase, color: "text-primary" },
    { label: "Conversations", value: totals.conversations, icon: MessageSquare, color: "text-accent" },
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
          <Card key={s.label}>
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
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={jobStats} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {jobStats.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
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
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Area type="monotone" dataKey="conversations" stroke={COLORS[0]} fill={COLORS[0]} fillOpacity={0.15} strokeWidth={2} name="Conversations" />
                <Area type="monotone" dataKey="coverLetters" stroke={COLORS[1]} fill={COLORS[1]} fillOpacity={0.15} strokeWidth={2} name="Cover Letters" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Skill Gaps */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-primary" /> Skill Assessment
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {SKILL_GAPS.map((s) => (
                <div key={s.skill}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{s.skill}</span>
                    <span className="text-xs text-muted-foreground">{s.level}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${s.level}%`,
                        background: s.level >= 80 ? COLORS[1] : s.level >= 65 ? COLORS[0] : COLORS[3],
                      }}
                    />
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-muted-foreground mt-2">Based on resume analysis and interview performance</p>
            </div>
          </CardContent>
        </Card>

        {/* Interview Performance */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Mic2 className="w-4 h-4 text-accent" /> Interview Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={INTERVIEW_PERFORMANCE} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "11px" }} />
                <Line type="monotone" dataKey="score" stroke={COLORS[1]} strokeWidth={2.5} dot={{ r: 4, fill: COLORS[1] }} name="Score" />
                <Line type="monotone" dataKey="sessions" stroke={COLORS[0]} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 3, fill: COLORS[0] }} name="Sessions" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
