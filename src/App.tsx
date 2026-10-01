import { Suspense } from "react";
import { lazyWithReload as lazy } from "@/lib/lazy-with-retry";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SubscriptionProvider } from "@/components/SubscriptionGate";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import ProtectedRoute from "@/components/ProtectedRoute";
import OwnerProtectedRoute from "@/components/OwnerProtectedRoute";
import RouteAnalyticsTracker from "@/components/RouteAnalyticsTracker";
import GlobalAuthRedirect from "@/components/GlobalAuthRedirect";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";
import RPIconSprite from "@/components/shared/RPIconSprite";
import { EnvBanner } from "@/components/EnvBanner";

// Eager-loaded routes (critical path)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
// Public legal pages, eager so Google OAuth reviewers (and users) always get
// a fast, working document at /privacy and /terms.
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";

// Lazy-loaded routes
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrintResume = lazy(() => import("./pages/PrintResume"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const HomePage = lazy(() => import("./pages/HomePage"));
const JobTracker = lazy(() => import("./pages/JobTracker"));
const Documents = lazy(() => import("./pages/Documents"));
const ResumeProjects = lazy(() => import("./pages/ResumeProjects"));
const ResumeBuilderV2 = lazy(() => import("./pages/ResumeBuilderV2"));
const JobSearchPage = lazy(() => import("./pages/JobSearchPage"));
// Legacy application routes redirect into the consolidated Agent workspace.
const CoverLettersPage = lazy(() => import("./pages/CoverLettersPage"));
const ATSCheckerPage = lazy(() => import("./pages/ATSCheckerPage"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const InboxPage = lazy(() => import("./pages/InboxPage"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const ControlCenter = lazy(() => import("./pages/ControlCenter"));
const MarketDominationMap = lazy(() => import("./pages/MarketDominationMap"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const AgentPage = lazy(() => import("./pages/AgentPage"));
const MatchesPage = lazy(() => import("./pages/MatchesPage"));
const ApplicationReviewPage = lazy(() => import("./pages/ApplicationReviewPage"));
const ApplicationsBoardPage = lazy(() => import("./pages/ApplicationsBoardPage"));
const CareerOpsPreferencesPage = lazy(() => import("./pages/CareerOpsPreferencesPage"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));
const DocsPage = lazy(() => import("./pages/DocsPage"));
const ProfileSetupPage = lazy(() => import("./pages/ProfileSetupPage"));
const PricingPage = lazy(() => import("./pages/PricingPage"));
const NotFound = lazy(() => import("./pages/NotFound"));
const MyCollectionPage = lazy(() => import("@/pages/MyCollection/MyCollectionPage"));
const SessionPage = lazy(() => import("@/pages/MyCollection/SessionPage"));
const FeatureFlagsAdmin = lazy(() => import("./pages/FeatureFlagsAdmin"));

// Disable refetch-on-window-focus globally. Users were seeing pages flicker
// to loading states every time they switched away and came back; the data
// hadn't gone stale, the cache was just being invalidated by the default
// behavior. Pages that genuinely need fresh-on-focus can opt in per-query.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: 60_000,
    },
  },
});

const SuspenseFallback = () => (
  <LoadingSpinner fullScreen message="Loading..." />
);

const App = () => {
  return (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
        <TooltipProvider>
          <RPIconSprite />
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <RouteAnalyticsTracker />
            <GlobalAuthRedirect />
            <EnvBanner />
            <Suspense fallback={<SuspenseFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/print-resume" element={<PrintResume />} />
                <Route path="/privacy" element={<PrivacyPolicy />} />
                <Route path="/terms" element={<TermsOfService />} />

                {/* Protected app routes with sidebar layout */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/home" element={<HomePage />} />
                    <Route path="/my-collection" element={<MyCollectionPage />} />
                    <Route path="/my-collection/:sessionId" element={<SessionPage />} />
                    <Route path="/job-search" element={<JobSearchPage />} />
                    <Route path="/applypass" element={<Navigate to="/agent" replace />} />
                    <Route path="/resume-builder" element={<ResumeProjects />} />
                    {/* v2 is the only editor. The v1 editor was removed; old
                        /resume-builder/legacy links land on the resume list. */}
                    <Route path="/resume-builder/v2" element={<ResumeBuilderV2 />} />
                    <Route path="/resume-builder/v2/:resumeId" element={<ResumeBuilderV2 />} />
                    <Route path="/resume-builder/legacy" element={<Navigate to="/resume-builder" replace />} />
                    <Route path="/resume-builder/legacy/:resumeId" element={<Navigate to="/resume-builder" replace />} />
                    <Route path="/resume-builder/:resumeId" element={<ResumeBuilderV2 />} />
                    <Route path="/ats-checker" element={<ATSCheckerPage />} />
                    <Route path="/job-tracker" element={<JobTracker />} />
                    <Route path="/inbox" element={<InboxPage />} />
                    <Route path="/matches" element={<MatchesPage />} />
                    <Route path="/applications" element={<ApplicationsBoardPage />} />
                    <Route path="/applications/:id" element={<ApplicationReviewPage />} />
                    <Route path="/career-ops/preferences" element={<CareerOpsPreferencesPage />} />
                    <Route path="/feedback" element={<FeedbackPage />} />
                    <Route path="/docs" element={<DocsPage />} />
                    <Route path="/auto-apply" element={<Navigate to="/agent" replace />} />
                    <Route path="/agent" element={<AgentPage />} />
                    <Route path="/profile-setup" element={<ProfileSetupPage />} />
                    <Route path="/pricing" element={<PricingPage />} />
                    <Route path="/interview-prep" element={<Navigate to="/agent" replace />} />
                    <Route path="/cover-letters" element={<CoverLettersPage />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/c/:conversationId" element={<Chat />} />
                    <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                    <Route
                      path="/control-center"
                      element={
                        <OwnerProtectedRoute>
                          <ControlCenter />
                        </OwnerProtectedRoute>
                      }
                    />
                    <Route
                      path="/market-domination-map"
                      element={
                        <OwnerProtectedRoute>
                          <MarketDominationMap />
                        </OwnerProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin"
                      element={
                        <OwnerProtectedRoute>
                          <AdminPortal />
                        </OwnerProtectedRoute>
                      }
                    />
                    <Route
                      path="/admin/flags"
                      element={
                        <OwnerProtectedRoute>
                          <FeatureFlagsAdmin />
                        </OwnerProtectedRoute>
                      }
                    />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/ai-toolbox" element={<Navigate to="/home" replace />} />
                    <Route path="/analytics" element={<Analytics />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <VercelAnalytics />
        </TooltipProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
  );
};

export default App;
