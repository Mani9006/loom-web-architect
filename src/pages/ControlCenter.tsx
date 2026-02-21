import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Gauge, Loader2, Radar, RefreshCcw, ShieldCheck, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

interface ControlCenterResponse {
  generatedAt: string;
  repo: string;
  projectKey: string;
  executiveSummary: string;
  scorecard: {
    releaseReadiness: number;
    operationalHealth: number;
    growthMomentum: number;
  };
  signals: {
    deployment: {
      state: "success" | "pending" | "failure" | "unknown";
      description: string;
      targetUrl: string | null;
      commitSha: string | null;
      commitUrl: string | null;
    };
    jira: {
      available: boolean;
      openCount: number;
      inProgressCount: number;
      reviewCount: number;
      error?: string;
      sampleTickets: Array<{ key: string; summary: string; status: string }>;
    };
    platform: {
      users: number;
      resumes: number;
      trackedJobs: number;
      conversations: number;
      coverLetters: number;
    };
  };
  priorities: Array<{
    severity: "critical" | "high" | "medium";
    owner: string;
    action: string;
    reason: string;
  }>;
  controlLoops: Array<{ id: string; owner: string; description: string }>;
}

function scoreTone(score: number): "default" | "secondary" | "destructive" {
  if (score >= 80) return "default";
  if (score >= 60) return "secondary";
  return "destructive";
}

function deploymentBadgeTone(state: string): "default" | "secondary" | "destructive" {
  if (state === "success") return "default";
  if (state === "pending") return "secondary";
  return "destructive";
}

export default function ControlCenter() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<ControlCenterResponse | null>(null);

  const fetchControlData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

      const response = await fetch(`${supabaseUrl}/functions/v1/executive-brief`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: anonKey,
          Authorization: `Bearer ${session?.access_token ?? anonKey}`,
        },
        body: JSON.stringify({ projectKey: "KAN" }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`Control Center API failed (${response.status}): ${body}`);
      }

      const payload = (await response.json()) as ControlCenterResponse;
      setData(payload);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchControlData();
  }, [fetchControlData]);

  const lastUpdated = useMemo(() => {
    if (!data?.generatedAt) return "-";
    return new Date(data.generatedAt).toLocaleString();
  }, [data?.generatedAt]);

  if (loading) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <Skeleton className="h-10 w-72" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((idx) => (
            <Skeleton key={idx} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" /> Executive Control Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time command surface for deployment, execution, quality, and growth.
          </p>
          <p className="text-xs text-muted-foreground mt-2">Last updated: {lastUpdated}</p>
        </div>

        <Button
          variant="outline"
          className="gap-2"
          disabled={refreshing}
          onClick={() => void fetchControlData(true)}
        >
          {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCcw className="w-4 h-4" />}
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0" />
            <div>
              <p className="font-medium">Control Center fetch failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Gauge className="w-4 h-4" /> Release Readiness
                </CardDescription>
                <CardTitle className="text-3xl">{data.scorecard.releaseReadiness}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={scoreTone(data.scorecard.releaseReadiness)}>Score / 100</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Radar className="w-4 h-4" /> Operational Health
                </CardDescription>
                <CardTitle className="text-3xl">{data.scorecard.operationalHealth}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={scoreTone(data.scorecard.operationalHealth)}>Score / 100</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Growth Momentum
                </CardDescription>
                <CardTitle className="text-3xl">{data.scorecard.growthMomentum}</CardTitle>
              </CardHeader>
              <CardContent>
                <Badge variant={scoreTone(data.scorecard.growthMomentum)}>Score / 100</Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Executive Summary</CardTitle>
              <CardDescription>{data.executiveSummary}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Deployment</p>
                <Badge variant={deploymentBadgeTone(data.signals.deployment.state)}>
                  {data.signals.deployment.state.toUpperCase()}
                </Badge>
                <p className="text-sm text-muted-foreground">{data.signals.deployment.description}</p>
                {data.signals.deployment.targetUrl && (
                  <a
                    href={data.signals.deployment.targetUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline"
                  >
                    Open deployment
                  </a>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Jira Execution</p>
                <p className="text-sm">Open: <span className="font-semibold">{data.signals.jira.openCount}</span></p>
                <p className="text-sm">In Progress: <span className="font-semibold">{data.signals.jira.inProgressCount}</span></p>
                <p className="text-sm">Review: <span className="font-semibold">{data.signals.jira.reviewCount}</span></p>
                {!data.signals.jira.available && (
                  <p className="text-xs text-destructive">{data.signals.jira.error || "Jira unavailable"}</p>
                )}
              </div>

              <div className="rounded-lg border p-4 space-y-2">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Platform Volume</p>
                <p className="text-sm">Users: <span className="font-semibold">{data.signals.platform.users}</span></p>
                <p className="text-sm">Resumes: <span className="font-semibold">{data.signals.platform.resumes}</span></p>
                <p className="text-sm">Tracked Jobs: <span className="font-semibold">{data.signals.platform.trackedJobs}</span></p>
                <p className="text-sm">Cover Letters: <span className="font-semibold">{data.signals.platform.coverLetters}</span></p>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Top Priorities</CardTitle>
                <CardDescription>Immediate actions with explicit ownership.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.priorities.map((item, index) => (
                  <div key={`${item.owner}-${index}`} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <p className="font-medium text-sm">{item.action}</p>
                      <Badge variant={item.severity === "critical" ? "destructive" : item.severity === "high" ? "secondary" : "default"}>
                        {item.severity}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mb-1">Owner: {item.owner}</p>
                    <p className="text-xs text-muted-foreground">{item.reason}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Control Loops</CardTitle>
                <CardDescription>Automations that keep the system industry-grade.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.controlLoops.map((loop) => (
                  <div key={loop.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-medium text-sm">{loop.id}</p>
                      <Badge variant="outline">{loop.owner}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{loop.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {data.signals.jira.sampleTickets.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Active Ticket Snapshot</CardTitle>
                <CardDescription>Recent non-done Jira issues from {data.projectKey}.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {data.signals.jira.sampleTickets.map((ticket) => (
                  <div key={ticket.key} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{ticket.key}</p>
                      <p className="text-xs text-muted-foreground truncate">{ticket.summary}</p>
                    </div>
                    <Badge variant="outline">{ticket.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="w-4 h-4 text-primary" />
            HQ mode is active. Use this view as the operating system for release, quality, and execution.
          </div>
        </>
      )}
    </div>
  );
}
