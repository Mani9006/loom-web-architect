import { useState } from "react";
import {
  BarChart2, CheckCircle2, Target, TrendingUp, Zap, Flag, Trophy, Users,
  ChevronDown, ChevronRight, Map,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Competitor {
  name: string;
  pricing: string;
  atsCheck: boolean;
  interviewPrep: boolean;
  jobTracker: boolean;
  aiNative: boolean;
  coverLetter: boolean;
  moat: string;
  gtm: string;
}

interface Wedge {
  id: string;
  title: string;
  insight: string;
  winCondition: string;
  activationPlay: string;
}

interface ActionItem {
  id: number;
  initiative: string;
  owner: string;
  deliverable: string;
  metric: string;
}

interface KpiRow {
  kpi: string;
  target: string;
  validation: string;
}

// ─── Static data ─────────────────────────────────────────────────────────────

const competitors: Competitor[] = [
  { name: "Resume.io",   pricing: "~$8/mo",  atsCheck: false, interviewPrep: false, jobTracker: false, aiNative: false,   coverLetter: false, moat: "Template library",    gtm: "SEO/content" },
  { name: "Zety",        pricing: "~$24/mo", atsCheck: false, interviewPrep: false, jobTracker: false, aiNative: false,   coverLetter: true,  moat: "SEO dominance",       gtm: "SEO/content" },
  { name: "Kickresume",  pricing: "~$10/mo", atsCheck: false, interviewPrep: false, jobTracker: false, aiNative: false,   coverLetter: true,  moat: "Design quality",      gtm: "Referral, SEO" },
  { name: "Enhancv",     pricing: "~$25/mo", atsCheck: false, interviewPrep: false, jobTracker: false, aiNative: false,   coverLetter: false, moat: "Career narrative",    gtm: "Content/SEO" },
  { name: "Teal",        pricing: "Free/$29",atsCheck: false, interviewPrep: false, jobTracker: true,  aiNative: false,   coverLetter: false, moat: "VC-backed community", gtm: "Viral/organic" },
  { name: "LinkedIn",    pricing: "Free/$40",atsCheck: false, interviewPrep: false, jobTracker: false, aiNative: false,   coverLetter: false, moat: "Network effect",      gtm: "Platform" },
  { name: "ResumePreps", pricing: "Competitive", atsCheck: true, interviewPrep: true, jobTracker: true, aiNative: true, coverLetter: true,  moat: "All-in-one career OS", gtm: "SEO + product-led" },
];

const featureCoverageData = competitors.map((c) => ({
  name: c.name,
  features: [c.atsCheck, c.interviewPrep, c.jobTracker, c.aiNative, c.coverLetter].filter(Boolean).length,
}));

const COLORS = ["hsl(12,76%,58%)", "hsl(28,80%,52%)", "hsl(160,50%,45%)", "hsl(340,65%,55%)", "hsl(200,70%,50%)", "hsl(260,60%,55%)", "hsl(90,55%,45%)"];

const wedges: Wedge[] = [
  {
    id: "W1",
    title: "All-in-One Career OS",
    insight: "Job seekers switch between 4–7 tools per application cycle. Each context switch is friction and a churn opportunity for competitors.",
    winCondition: "Be the single tab users never close during their job search.",
    activationPlay: "Onboarding flow that creates resume → ATS check → cover letter → mock interview in one session. Target: time-to-first-value < 5 min.",
  },
  {
    id: "W2",
    title: "ATS Transparency as Trust Engine",
    insight: "Most ATS tools give vague 'scores'. Hiring managers and candidates both distrust black-box results.",
    winCondition: "Publish methodology, show specific keyword gap analysis, surface recommended rewrites inline.",
    activationPlay: "Public ATS benchmark report comparing accuracy vs. competitors on real job descriptions. Monthly refresh. Drives SEO + trust.",
  },
  {
    id: "W3",
    title: "Interview Prep ↔ Resume Feedback Loop",
    insight: "Interviewers ask questions directly tied to resume claims. No competitor closes this loop.",
    winCondition: "After resume creation, auto-surface likely interview questions per bullet point with AI mock interview.",
    activationPlay: '"Interview Readiness Score" per resume section. Viral share hook: post score to LinkedIn/X.',
  },
  {
    id: "W4",
    title: "AI-Native Architecture",
    insight: "Incumbents bolt AI onto legacy template systems. ResumePreps is built AI-first at every layer.",
    winCondition: "Faster iteration, more personalized outputs, better data flywheel as users grow.",
    activationPlay: "Highlight model quality in onboarding and publish improvement changelog to build trust with technical users.",
  },
  {
    id: "W5",
    title: "Free Tier with Real Value",
    insight: "Teal captured market share with a generous free tier. Users who feel value quickly convert and refer.",
    winCondition: "Free tier delivers complete resume + ATS check + 1 cover letter; upsell on volume and interview prep.",
    activationPlay: "Remove paywall friction from core value actions; monetise advanced AI features and unlimited usage.",
  },
];

const actionItems: { phase: string; days: string; items: ActionItem[] }[] = [
  {
    phase: "Foundation",
    days: "Days 1–30",
    items: [
      { id: 1, initiative: "Onboarding flow optimisation", owner: "Product", deliverable: "Time-to-first-resume < 3 min", metric: "Activation rate ≥ 40%" },
      { id: 2, initiative: "ATS transparency page", owner: "Content + Product", deliverable: "Public methodology doc + sample report", metric: "Organic sessions +20%" },
      { id: 3, initiative: "Resume → ATS → Cover Letter workflow", owner: "Product", deliverable: "Inline 'Next Step' prompt after each artefact", metric: "Day-1 retention +15%" },
      { id: 4, initiative: "Landing page messaging audit", owner: "Growth", deliverable: "Headline: 'All-in-One Career OS'", metric: "Bounce rate −10%" },
      { id: 5, initiative: "SEO content pipeline", owner: "Growth/Content", deliverable: "10 long-form posts on high-intent keywords", metric: "500 new organic sessions" },
    ],
  },
  {
    phase: "Growth",
    days: "Days 31–60",
    items: [
      { id: 6, initiative: "Referral programme", owner: "Growth", deliverable: "Invite friend → unlock 1 month premium", metric: "K-factor ≥ 1.2" },
      { id: 7, initiative: "Interview Readiness Score", owner: "Product", deliverable: "Per-resume score + LinkedIn share card", metric: "1,000 shares in 30 days" },
      { id: 8, initiative: "LinkedIn / X distribution loop", owner: "Growth", deliverable: "Weekly 'ATS tip' thread with platform link", metric: "500 new signups from social" },
      { id: 9, initiative: "Bootcamp / career-centre partnerships", owner: "BD", deliverable: "3 signed pilot agreements", metric: "200 new users from partners" },
      { id: 10, initiative: "Email drip (activation + upsell)", owner: "Growth", deliverable: "5-email sequence post-signup", metric: "Email → upgrade CVR ≥ 3%" },
    ],
  },
  {
    phase: "Moat",
    days: "Days 61–90",
    items: [
      { id: 11, initiative: "Monthly ATS benchmark report", owner: "Product + Content", deliverable: "Public accuracy report", metric: "50 press/backlinks" },
      { id: 12, initiative: "Job tracker network effect", owner: "Product", deliverable: "Import from LinkedIn / Gmail / CSV", metric: "Job tracker DAU +30%" },
      { id: 13, initiative: "Enterprise / team plan", owner: "Product + Sales", deliverable: "Multi-seat plan + admin dashboard", metric: "5 pilot customers" },
      { id: 14, initiative: "Public API / integrations", owner: "Engineering", deliverable: "API for bootcamp LMS integrations", metric: "3 integration partners" },
      { id: 15, initiative: "NPS + retention campaign", owner: "Growth", deliverable: "In-app NPS survey + re-engagement flow", metric: "NPS ≥ 45, D30 retention ≥ 35%" },
    ],
  },
];

const kpiSections: { section: string; icon: React.ElementType; rows: KpiRow[] }[] = [
  {
    section: "Acquisition",
    icon: Users,
    rows: [
      { kpi: "Weekly new signups", target: "500 / week (90-day)", validation: "Supabase `profiles` table" },
      { kpi: "Organic search sessions", target: "+100% (90-day)", validation: "Vercel / GA web analytics" },
      { kpi: "Referral signups", target: "200 / week", validation: "Referral tracking param" },
      { kpi: "Social-driven signups", target: "150 / week", validation: "UTM attribution" },
    ],
  },
  {
    section: "Activation",
    icon: Zap,
    rows: [
      { kpi: "Time-to-first-resume", target: "< 3 min", validation: "In-app event: resume_created" },
      { kpi: "Signup → resume created", target: "≥ 40%", validation: "Funnel: signed_up → resume_created" },
      { kpi: "Signup → ATS check", target: "≥ 25%", validation: "Funnel: signed_up → ats_check_run" },
      { kpi: "Signup → cover letter", target: "≥ 20%", validation: "Funnel: signed_up → cover_letter_created" },
    ],
  },
  {
    section: "Retention",
    icon: TrendingUp,
    rows: [
      { kpi: "D7 retention", target: "≥ 30%", validation: "Cohort: active 7 days after signup" },
      { kpi: "D30 retention", target: "≥ 20%", validation: "Cohort: active 30 days after signup" },
      { kpi: "Weekly active users", target: "+20% WoW", validation: "Supabase session events" },
    ],
  },
  {
    section: "Revenue",
    icon: BarChart2,
    rows: [
      { kpi: "MRR growth", target: "+15% MoM", validation: "Stripe payment provider" },
      { kpi: "Free → paid conversion", target: "≥ 4%", validation: "Stripe: free → paid plan" },
      { kpi: "ARPU", target: "≥ $12 / mo", validation: "MRR / paying users" },
    ],
  },
  {
    section: "Product Quality",
    icon: CheckCircle2,
    rows: [
      { kpi: "ATS pass rate (user resumes)", target: "≥ 70% score ≥ 80", validation: "In-app ATS score event" },
      { kpi: "NPS", target: "≥ 45", validation: "In-app NPS survey (monthly)" },
      { kpi: "Crash / error rate", target: "< 0.5%", validation: "Error tracking (Sentry / logs)" },
      { kpi: "Interview Readiness Score usage", target: "30% of resume creators", validation: "interview_readiness_viewed event" },
    ],
  },
];

// ─── Sub-components ──────────────────────────────────────────────────────────

function FeatureDot({ value }: { value: boolean }) {
  return value
    ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
    : <span className="block w-4 h-1 rounded bg-muted mx-auto mt-1.5" />;
}

function WedgeCard({ wedge }: { wedge: Wedge }) {
  const [open, setOpen] = useState(false);
  return (
    <Card className="hover:shadow-md transition-shadow duration-200">
      <CardHeader className="pb-2 cursor-pointer select-none" onClick={() => setOpen((v) => !v)}>
        <CardTitle className="text-sm font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px]">{wedge.id}</Badge>
            {wedge.title}
          </span>
          {open ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" /> : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />}
        </CardTitle>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3 pt-0">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Insight</p>
            <p className="text-sm text-foreground">{wedge.insight}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Win Condition</p>
            <p className="text-sm text-foreground">{wedge.winCondition}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-0.5">Activation Play</p>
            <p className="text-sm text-foreground">{wedge.activationPlay}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function ActionPhaseCard({ phase, days, items }: { phase: string; days: string; items: ActionItem[] }) {
  const phaseColor: Record<string, string> = {
    Foundation: "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800",
    Growth: "bg-orange-500/10 text-orange-600 border-orange-200 dark:border-orange-800",
    Moat: "bg-purple-500/10 text-purple-600 border-purple-200 dark:border-purple-800",
  };
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{phase} Sprint</CardTitle>
          <Badge variant="outline" className={phaseColor[phase]}>{days}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.map((item) => (
          <div key={item.id} className="rounded-lg border p-3 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium leading-snug">{item.initiative}</p>
              <Badge variant="secondary" className="text-[10px] shrink-0">{item.owner}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{item.deliverable}</p>
            <p className="text-xs font-medium text-primary">{item.metric}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function KpiSection({ section, icon: Icon, rows }: { section: string; icon: React.ElementType; rows: KpiRow[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary" /> {section}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y divide-border">
          {rows.map((row) => (
            <div key={row.kpi} className="py-2.5 grid grid-cols-[1fr_auto] gap-3 items-start">
              <div>
                <p className="text-sm font-medium leading-snug">{row.kpi}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{row.validation}</p>
              </div>
              <Badge variant="outline" className="text-[11px] whitespace-nowrap">{row.target}</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function MarketDominationMap() {
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Map className="w-5 h-5 text-accent" /> Market Domination Map
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Competitive positioning strategy — moving ResumePreps to top-tier market leadership.
        </p>
      </div>

      <Tabs defaultValue="matrix">
        <TabsList className="flex flex-wrap gap-1 h-auto">
          <TabsTrigger value="matrix" className="flex items-center gap-1.5 text-xs">
            <Target className="w-3.5 h-3.5" /> Competitor Matrix
          </TabsTrigger>
          <TabsTrigger value="wedges" className="flex items-center gap-1.5 text-xs">
            <Zap className="w-3.5 h-3.5" /> Strategic Wedges
          </TabsTrigger>
          <TabsTrigger value="plan" className="flex items-center gap-1.5 text-xs">
            <Flag className="w-3.5 h-3.5" /> 90-Day Plan
          </TabsTrigger>
          <TabsTrigger value="kpis" className="flex items-center gap-1.5 text-xs">
            <Trophy className="w-3.5 h-3.5" /> KPI Board
          </TabsTrigger>
        </TabsList>

        {/* ── Tab 1: Competitor Matrix ── */}
        <TabsContent value="matrix" className="space-y-6 mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Feature coverage chart */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-primary" /> Feature Coverage Score (out of 5)
                </CardTitle>
                <CardDescription className="text-xs">Number of key capabilities offered by each competitor</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={featureCoverageData} layout="vertical" margin={{ top: 4, right: 20, left: 10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" horizontal={false} />
                    <XAxis type="number" domain={[0, 5]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={90} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }} />
                    <Bar dataKey="features" radius={[0, 6, 6, 0]} name="Features">
                      {featureCoverageData.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Summary callout */}
            <Card className="flex flex-col justify-between">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Differentiation Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">ResumePreps is the <span className="font-semibold text-foreground">only platform</span> covering all five core job-search workflows in a single product.</p>
                <div className="rounded-lg bg-muted p-3 font-mono text-xs space-y-1 leading-relaxed">
                  <p>ResumePreps = Career OS</p>
                  <p className="text-muted-foreground">├── Resume Builder (AI-native)</p>
                  <p className="text-muted-foreground">├── ATS Checker (transparent)</p>
                  <p className="text-muted-foreground">├── Cover Letter Generator</p>
                  <p className="text-muted-foreground">├── Interview Prep (resume-linked)</p>
                  <p className="text-muted-foreground">└── Job Tracker + Contacts</p>
                </div>
                <p className="font-semibold">"Stop juggling 5 tabs. ResumePreps is your entire job search in one place."</p>
              </CardContent>
            </Card>
          </div>

          {/* Full feature matrix table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Full Feature Matrix</CardTitle>
              <CardDescription className="text-xs">ATS = ATS Checker · IP = Interview Prep · JT = Job Tracker · AI = AI-Native · CL = Cover Letter</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm border-collapse min-w-[600px]">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground uppercase tracking-wide">
                    <th className="py-2 pr-4 font-semibold">Competitor</th>
                    <th className="py-2 pr-4 text-center font-semibold">ATS</th>
                    <th className="py-2 pr-4 text-center font-semibold">IP</th>
                    <th className="py-2 pr-4 text-center font-semibold">JT</th>
                    <th className="py-2 pr-4 text-center font-semibold">AI</th>
                    <th className="py-2 pr-4 text-center font-semibold">CL</th>
                    <th className="py-2 pr-4 font-semibold">Pricing</th>
                    <th className="py-2 pr-4 font-semibold">Moat</th>
                    <th className="py-2 font-semibold">GTM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {competitors.map((c) => (
                    <tr key={c.name} className={c.name === "ResumePreps" ? "bg-primary/5 font-semibold" : ""}>
                      <td className="py-2.5 pr-4">{c.name}</td>
                      <td className="py-2.5 pr-4"><FeatureDot value={c.atsCheck} /></td>
                      <td className="py-2.5 pr-4"><FeatureDot value={c.interviewPrep} /></td>
                      <td className="py-2.5 pr-4"><FeatureDot value={c.jobTracker} /></td>
                      <td className="py-2.5 pr-4"><FeatureDot value={c.aiNative} /></td>
                      <td className="py-2.5 pr-4"><FeatureDot value={c.coverLetter} /></td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{c.pricing}</td>
                      <td className="py-2.5 pr-4 text-xs text-muted-foreground">{c.moat}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{c.gtm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Tab 2: Strategic Wedges ── */}
        <TabsContent value="wedges" className="space-y-4 mt-4">
          <p className="text-sm text-muted-foreground">
            Five decisive areas where ResumePreps can outmaneuver every competitor. Click each wedge to expand.
          </p>
          <div className="space-y-3">
            {wedges.map((w) => <WedgeCard key={w.id} wedge={w} />)}
          </div>
        </TabsContent>

        {/* ── Tab 3: 90-Day Plan ── */}
        <TabsContent value="plan" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {actionItems.map((phase) => (
              <ActionPhaseCard key={phase.phase} phase={phase.phase} days={phase.days} items={phase.items} />
            ))}
          </div>
        </TabsContent>

        {/* ── Tab 4: KPI Board ── */}
        <TabsContent value="kpis" className="mt-4">
          <div className="mb-4">
            <p className="text-sm text-muted-foreground">
              Weekly review board. All targets are 90-day goals unless noted. Validate weekly against indicated data sources.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {kpiSections.map((s) => (
              <KpiSection key={s.section} section={s.section} icon={s.icon} rows={s.rows} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
