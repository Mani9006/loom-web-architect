import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Search, Crown, CheckCircle2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useSubscription } from "@/components/SubscriptionGate";
import ApplyPassWorkspace from "@/components/chat/ApplyPassWorkspace";
import {
  APPLYPASS_LATEST_SEARCH_KEY,
  type ApplyPassSearchState,
  type JobResult,
} from "@/components/chat/JobSearchPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isValidJob(value: unknown): value is JobResult {
  if (!value || typeof value !== "object") return false;
  const job = value as JobResult;
  return isNonEmptyString(job.id) && isNonEmptyString(job.title) && isNonEmptyString(job.company);
}

function normalizeSearchState(value: unknown): ApplyPassSearchState | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ApplyPassSearchState>;
  const jobs = Array.isArray(raw.jobs) ? raw.jobs.filter(isValidJob) : [];
  if (jobs.length === 0) return null;
  if (!isNonEmptyString(raw.resumeText)) return null;

  return {
    jobs: jobs.slice(0, 10),
    resumeText: raw.resumeText,
    preferredResumeId: typeof raw.preferredResumeId === "string" ? raw.preferredResumeId : null,
    searchMarkdown: typeof raw.searchMarkdown === "string" ? raw.searchMarkdown : "",
    filters: raw.filters || {
      jobType: "all",
      experienceLevel: "all",
      workLocation: "all",
      datePosted: "24h",
      salaryRange: "all",
    },
    searchedAt: typeof raw.searchedAt === "string" ? raw.searchedAt : new Date().toISOString(),
  };
}

function readSessionState(): ApplyPassSearchState | null {
  try {
    const raw = sessionStorage.getItem(APPLYPASS_LATEST_SEARCH_KEY);
    if (!raw) return null;
    return normalizeSearchState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export default function ApplyPassPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { isPremium, loading: subLoading } = useSubscription();
  const [searchState, setSearchState] = useState<ApplyPassSearchState | null>(() => {
    return normalizeSearchState(location.state) || readSessionState();
  });

  useEffect(() => {
    const fromRoute = normalizeSearchState(location.state);
    if (!fromRoute) return;
    setSearchState(fromRoute);
    try {
      sessionStorage.setItem(APPLYPASS_LATEST_SEARCH_KEY, JSON.stringify(fromRoute));
    } catch {
      // Ignore storage write failures.
    }
  }, [location.state]);

  const searchedAtLabel = useMemo(() => {
    if (!searchState?.searchedAt) return "";
    const parsed = new Date(searchState.searchedAt);
    if (Number.isNaN(parsed.getTime())) return "";
    return parsed.toLocaleString();
  }, [searchState?.searchedAt]);

  // Premium gate for ApplyPass
  if (!subLoading && !isPremium) {
    return (
      <div className="h-[calc(100vh-68px)] overflow-y-auto">
        <div className="max-w-5xl mx-auto p-4 sm:p-6 space-y-4">
          <Card className="border-2 border-amber-200 bg-amber-50">
            <CardHeader className="space-y-4">
              <div className="flex items-center gap-2">
                <Crown className="w-6 h-6 text-amber-600" />
                <CardTitle className="text-2xl text-amber-900">Premium Feature</CardTitle>
              </div>
              <CardDescription className="text-amber-800 text-base">
                Auto-Apply automatically submits applications to matched jobs on your behalf.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="bg-white rounded-lg p-4 space-y-3">
                <p className="font-semibold text-sm text-gray-700">What you get:</p>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    AI-optimized applications
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    Apply to 50+ jobs per day
                  </li>
                  <li className="flex items-center gap-2 text-sm text-gray-700">
                    <CheckCircle2 className="w-4 h-4 text-green-600 flex-shrink-0" />
                    Smart targeting based on your profile
                  </li>
                </ul>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Link to="/pricing" className="flex-1">
                  <Button className="w-full bg-amber-600 hover:bg-amber-700 text-white" size="lg">
                    <Crown className="w-4 h-4 mr-2" />
                    Upgrade to Premium — $120/mo
                  </Button>
                </Link>
              </div>

              <p className="text-sm text-gray-600 text-center">
                Currently on Free plan · Manual apply is always available
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-68px)] overflow-y-auto">
      <div className="max-w-[1500px] mx-auto p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-semibold">ApplyPass</h1>
            <p className="text-sm text-muted-foreground">
              Left pane: matched jobs. Right pane: built-in application browser + AI autofill.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/job-search")}>
              <Search className="w-4 h-4 mr-1" />
              New Job Search
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const latest = readSessionState();
                if (latest) {
                  setSearchState(latest);
                }
              }}
            >
              <RefreshCw className="w-4 h-4 mr-1" />
              Reload Latest Jobs
            </Button>
          </div>
        </div>

        {searchState ? (
          <>
            <Card>
              <CardContent className="pt-4">
                <p className="text-sm text-muted-foreground">
                  Loaded {searchState.jobs.length} jobs {searchedAtLabel ? `from ${searchedAtLabel}` : ""}.
                </p>
              </CardContent>
            </Card>
            <ApplyPassWorkspace
              jobs={searchState.jobs}
              resumeText={searchState.resumeText}
              preferredResumeId={searchState.preferredResumeId}
            />
          </>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>No Jobs Loaded Yet</CardTitle>
              <CardDescription>
                Start from Job Search, upload your resume, and click Find Matching Jobs. You will be redirected here automatically.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button onClick={() => navigate("/job-search")}>
                <ArrowLeft className="w-4 h-4 mr-1" />
                Go to Job Search
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
