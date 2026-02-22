import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DeploymentSignal = {
  state: "success" | "pending" | "failure" | "unknown";
  description: string;
  targetUrl: string | null;
  commitSha: string | null;
  commitUrl: string | null;
};

type JiraSignal = {
  available: boolean;
  openCount: number;
  inProgressCount: number;
  reviewCount: number;
  sampleTickets: Array<{ key: string; summary: string; status: string }>;
  error?: string;
};

type PlatformSignal = {
  users: number;
  resumes: number;
  trackedJobs: number;
  conversations: number;
  coverLetters: number;
};

async function getDeploymentSignal(repo: string): Promise<DeploymentSignal> {
  try {
    const commitRes = await fetch(`https://api.github.com/repos/${repo}/commits/main`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!commitRes.ok) {
      return {
        state: "unknown",
        description: `GitHub main lookup failed (${commitRes.status})`,
        targetUrl: null,
        commitSha: null,
        commitUrl: null,
      };
    }

    const commitData = await commitRes.json();
    const sha = commitData?.sha ?? null;
    if (!sha) {
      return {
        state: "unknown",
        description: "GitHub main commit SHA missing",
        targetUrl: null,
        commitSha: null,
        commitUrl: null,
      };
    }

    const statusRes = await fetch(`https://api.github.com/repos/${repo}/commits/${sha}/status`, {
      headers: { Accept: "application/vnd.github+json" },
    });

    if (!statusRes.ok) {
      return {
        state: "unknown",
        description: `GitHub status lookup failed (${statusRes.status})`,
        targetUrl: null,
        commitSha: sha,
        commitUrl: `https://github.com/${repo}/commit/${sha}`,
      };
    }

    const statusData = await statusRes.json();
    const statuses = Array.isArray(statusData?.statuses) ? statusData.statuses : [];
    const vercelStatus = statuses.find((item: any) => item?.context === "Vercel") || statuses[0] || null;

    const state = (vercelStatus?.state || statusData?.state || "unknown") as DeploymentSignal["state"];
    const description =
      vercelStatus?.description ||
      (state === "success"
        ? "Deployment healthy"
        : state === "pending"
          ? "Deployment in progress"
          : state === "failure"
            ? "Deployment failed"
            : "No deployment signal");

    return {
      state,
      description,
      targetUrl: vercelStatus?.target_url || null,
      commitSha: sha,
      commitUrl: `https://github.com/${repo}/commit/${sha}`,
    };
  } catch (error) {
    return {
      state: "unknown",
      description: `Deployment check failed: ${error instanceof Error ? error.message : "unknown"}`,
      targetUrl: null,
      commitSha: null,
      commitUrl: null,
    };
  }
}

async function getJiraSignal(
  jiraBaseUrl: string | undefined,
  jiraUser: string | undefined,
  jiraToken: string | undefined,
  projectKey: string,
): Promise<JiraSignal> {
  if (!jiraBaseUrl || !jiraUser || !jiraToken) {
    return {
      available: false,
      openCount: 0,
      inProgressCount: 0,
      reviewCount: 0,
      sampleTickets: [],
      error: "Jira credentials missing in edge function env",
    };
  }

  try {
    const jql = encodeURIComponent(`project = ${projectKey} AND statusCategory != Done ORDER BY updated DESC`);
    const url = `${jiraBaseUrl}/rest/api/3/search/jql?jql=${jql}&maxResults=25&fields=summary,status`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${btoa(`${jiraUser}:${jiraToken}`)}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      return {
        available: false,
        openCount: 0,
        inProgressCount: 0,
        reviewCount: 0,
        sampleTickets: [],
        error: `Jira lookup failed (${res.status})`,
      };
    }

    const data = await res.json();
    const issues = Array.isArray(data?.issues) ? data.issues : [];

    let inProgressCount = 0;
    let reviewCount = 0;

    const sampleTickets = issues.slice(0, 8).map((issue: any) => {
      const status = issue?.fields?.status?.name || "Unknown";
      const lower = String(status).toLowerCase();
      if (lower.includes("review")) {
        reviewCount += 1;
      } else {
        inProgressCount += 1;
      }
      return {
        key: issue?.key || "UNKNOWN",
        summary: issue?.fields?.summary || "No summary",
        status,
      };
    });

    for (const issue of issues.slice(8)) {
      const status = issue?.fields?.status?.name || "Unknown";
      const lower = String(status).toLowerCase();
      if (lower.includes("review")) {
        reviewCount += 1;
      } else {
        inProgressCount += 1;
      }
    }

    return {
      available: true,
      openCount: issues.length,
      inProgressCount,
      reviewCount,
      sampleTickets,
    };
  } catch (error) {
    return {
      available: false,
      openCount: 0,
      inProgressCount: 0,
      reviewCount: 0,
      sampleTickets: [],
      error: `Jira check failed: ${error instanceof Error ? error.message : "unknown"}`,
    };
  }
}

async function getPlatformSignal(): Promise<PlatformSignal> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRole = Deno.env.get("SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !serviceRole) {
    return {
      users: 0,
      resumes: 0,
      trackedJobs: 0,
      conversations: 0,
      coverLetters: 0,
    };
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  const [users, resumes, trackedJobs, conversations, coverLetters] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }),
    supabase.from("resumes").select("id", { count: "exact", head: true }),
    supabase.from("tracked_jobs").select("id", { count: "exact", head: true }),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
    supabase.from("cover_letters").select("id", { count: "exact", head: true }),
  ]);

  return {
    users: users.count || 0,
    resumes: resumes.count || 0,
    trackedJobs: trackedJobs.count || 0,
    conversations: conversations.count || 0,
    coverLetters: coverLetters.count || 0,
  };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function buildScorecard(deployment: DeploymentSignal, jira: JiraSignal, platform: PlatformSignal) {
  let releaseReadiness = 50;
  if (deployment.state === "success") releaseReadiness += 30;
  if (deployment.state === "pending") releaseReadiness += 10;
  if (deployment.state === "failure") releaseReadiness -= 25;
  if (jira.reviewCount === 0) releaseReadiness += 10;
  if (jira.reviewCount > 3) releaseReadiness -= 15;

  let operationalHealth = 55;
  if (jira.available) operationalHealth += 15;
  if (jira.openCount <= 5) operationalHealth += 10;
  if (jira.openCount > 12) operationalHealth -= 10;
  if (deployment.state === "failure") operationalHealth -= 20;

  let growthMomentum = 40;
  if (platform.users > 10) growthMomentum += 20;
  if (platform.resumes > 50) growthMomentum += 15;
  if (platform.coverLetters > 20) growthMomentum += 10;
  if (platform.trackedJobs > 50) growthMomentum += 10;

  return {
    releaseReadiness: clampScore(releaseReadiness),
    operationalHealth: clampScore(operationalHealth),
    growthMomentum: clampScore(growthMomentum),
  };
}

function buildPriorities(deployment: DeploymentSignal, jira: JiraSignal) {
  const priorities: Array<{ severity: "critical" | "high" | "medium"; owner: string; action: string; reason: string }> = [];

  if (deployment.state === "failure") {
    priorities.push({
      severity: "critical",
      owner: "sentinel",
      action: "Run rollback-readiness and post-deploy validation immediately",
      reason: deployment.description,
    });
  }

  if (deployment.state === "pending") {
    priorities.push({
      severity: "high",
      owner: "atlas",
      action: "Hold new merges until deployment reaches success",
      reason: "Production deployment is still pending",
    });
  }

  if (!jira.available) {
    priorities.push({
      severity: "high",
      owner: "atlas",
      action: "Configure Jira credentials in executive-brief edge function secrets",
      reason: jira.error || "Jira integration unavailable",
    });
  }

  if (jira.reviewCount > 0) {
    priorities.push({
      severity: "medium",
      owner: "prism",
      action: "Clear review queue and attach commit/test evidence for each ticket",
      reason: `${jira.reviewCount} ticket(s) waiting in Review`,
    });
  }

  if (jira.inProgressCount > 8) {
    priorities.push({
      severity: "medium",
      owner: "atlas",
      action: "Reduce WIP: enforce max 5 in-progress tickets and close loops",
      reason: `${jira.inProgressCount} ticket(s) in active execution`,
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      severity: "medium",
      owner: "atlas",
      action: "Run next strategic experiment: ATS quality benchmark vs top competitors",
      reason: "Core operations are stable",
    });
  }

  return priorities;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const repo = body?.repo || Deno.env.get("EXECUTIVE_GITHUB_REPO") || "Mani9006/loom-web-architect";
    const projectKey = body?.projectKey || Deno.env.get("EXECUTIVE_JIRA_PROJECT") || "KAN";

    const jiraBaseUrl = Deno.env.get("JIRA_BASE_URL");
    const jiraUser = Deno.env.get("JIRA_USER");
    const jiraToken = Deno.env.get("JIRA_API_TOKEN");

    const [deployment, jira, platform] = await Promise.all([
      getDeploymentSignal(repo),
      getJiraSignal(jiraBaseUrl, jiraUser, jiraToken, projectKey),
      getPlatformSignal(),
    ]);

    const scorecard = buildScorecard(deployment, jira, platform);
    const priorities = buildPriorities(deployment, jira);

    const response = {
      generatedAt: new Date().toISOString(),
      repo,
      projectKey,
      signals: {
        deployment,
        jira,
        platform,
      },
      scorecard,
      priorities,
      controlLoops: [
        {
          id: "release-gate",
          owner: "sentinel",
          description: "Block release when type-check/test/build or post-deploy validation fails",
        },
        {
          id: "jira-orchestration",
          owner: "atlas",
          description: "Enforce owner mapping, WIP limits, and review evidence per ticket",
        },
        {
          id: "ats-quality",
          owner: "spark",
          description: "Track ATS baseline and stop regressions before production",
        },
      ],
      executiveSummary:
        deployment.state === "success"
          ? "Platform is deploy-stable. Focus on reducing active WIP and accelerating quality-verified ticket throughput."
          : "Platform requires operational attention before scaling changes. Resolve deployment and review bottlenecks first.",
    };

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      },
    );
  }
});
