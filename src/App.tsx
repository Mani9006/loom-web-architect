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
import { EnvBanner } from "@/components/EnvBanner";

import LandingPage from "./product/marketing/LandingPage";
import AuthPage from "./product/marketing/AuthPage";
import { PrivacyPage, TermsPage } from "./product/marketing/LegalPages";

const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrintResume = lazy(() => import("./pages/PrintResume"));
const ProductShell = lazy(() => import("./product/shell/ProductShell"));
const HomePage = lazy(() => import("./product/pages/HomePage"));
const MatchesPage = lazy(() => import("./product/pages/MatchesPage"));
const ApplicationsPage = lazy(() => import("./product/pages/ApplicationsPage"));
const ApplicationDetailPage = lazy(() => import("./product/pages/ApplicationDetailPage"));
const InboxPage = lazy(() => import("./product/pages/InboxPage"));
const PipelinePage = lazy(() => import("./product/pages/PipelinePage"));
const HandsOffPage = lazy(() => import("./product/pages/HandsOffPage"));
const ResumePage = lazy(() => import("./product/pages/ResumePage"));
const PeoplePage = lazy(() => import("./product/pages/PeoplePage"));
const NotesPage = lazy(() => import("./product/pages/NotesPage"));
const SettingsPage = lazy(() => import("./product/pages/SettingsPage"));
const HowItWorksPage = lazy(() => import("./product/marketing/HowItWorksPage"));
const PlansPage = lazy(() => import("./product/marketing/PlansPage"));
const FaqPage = lazy(() => import("./product/marketing/FaqPage"));
const NotFoundPage = lazy(() => import("./product/marketing/NotFoundPage"));
const ControlCenter = lazy(() => import("./pages/ControlCenter"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const FeatureFlagsAdmin = lazy(() => import("./pages/FeatureFlagsAdmin"));
const MarketDominationMap = lazy(() => import("./pages/MarketDominationMap"));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage"));

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
  <LoadingSpinner fullScreen message="Loading ResumePreps…" />
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SubscriptionProvider>
          <TooltipProvider>
            <Toaster />
            <Sonner />
            <BrowserRouter>
              <RouteAnalyticsTracker />
              <GlobalAuthRedirect />
              <EnvBanner />
              <Suspense fallback={<SuspenseFallback />}>
                <Routes>
                  <Route path="/" element={<LandingPage />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/reset-password" element={<ResetPassword />} />
                  <Route path="/print-resume" element={<PrintResume />} />
                  <Route path="/privacy" element={<PrivacyPage />} />
                  <Route path="/terms" element={<TermsPage />} />
                  <Route path="/how-it-works" element={<HowItWorksPage />} />
                  <Route path="/plans" element={<PlansPage />} />
                  <Route path="/faq" element={<FaqPage />} />
                  <Route path="/pricing" element={<Navigate to="/plans" replace />} />

                  <Route element={<ProtectedRoute />}>
                    <Route element={<ProductShell />}>
                      <Route path="/home" element={<HomePage />} />
                      <Route path="/matches" element={<MatchesPage />} />
                      <Route path="/applications" element={<ApplicationsPage />} />
                      <Route path="/applications/:id" element={<ApplicationDetailPage />} />
                      <Route path="/inbox" element={<InboxPage />} />
                      <Route path="/pipeline" element={<PipelinePage />} />
                      <Route path="/hands-off" element={<HandsOffPage />} />
                      <Route path="/resume" element={<ResumePage />} />
                      <Route path="/people" element={<PeoplePage />} />
                      <Route path="/notes" element={<NotesPage />} />
                      <Route path="/settings" element={<SettingsPage />} />
                      <Route path="/feedback" element={<FeedbackPage />} />
                      <Route
                        path="/admin"
                        element={<OwnerProtectedRoute><AdminPortal /></OwnerProtectedRoute>}
                      />
                      <Route
                        path="/admin/flags"
                        element={<OwnerProtectedRoute><FeatureFlagsAdmin /></OwnerProtectedRoute>}
                      />
                      <Route
                        path="/control-center"
                        element={<OwnerProtectedRoute><ControlCenter /></OwnerProtectedRoute>}
                      />
                      <Route
                        path="/market-domination-map"
                        element={<OwnerProtectedRoute><MarketDominationMap /></OwnerProtectedRoute>}
                      />

                      <Route path="/job-search" element={<Navigate to="/matches" replace />} />
                      <Route path="/job-tracker" element={<Navigate to="/pipeline" replace />} />
                      <Route path="/agent" element={<Navigate to="/hands-off" replace />} />
                      <Route path="/auto-apply" element={<Navigate to="/hands-off" replace />} />
                      <Route path="/applypass" element={<Navigate to="/hands-off" replace />} />
                      <Route path="/resume-builder" element={<Navigate to="/resume" replace />} />
                      <Route path="/resume-builder/:resumeId" element={<Navigate to="/resume" replace />} />
                      <Route path="/profile" element={<Navigate to="/resume" replace />} />
                      <Route path="/profile-setup" element={<Navigate to="/resume" replace />} />
                      <Route path="/career-ops/preferences" element={<Navigate to="/hands-off" replace />} />
                      <Route path="/chat" element={<Navigate to="/home?assistant=1" replace />} />
                      <Route path="/c/:conversationId" element={<Navigate to="/home?assistant=1" replace />} />
                      <Route path="/dashboard" element={<Navigate to="/home" replace />} />
                      <Route path="/my-collection" element={<Navigate to="/pipeline" replace />} />
                      <Route path="/ats-checker" element={<Navigate to="/resume" replace />} />
                      <Route path="/cover-letters" element={<Navigate to="/resume" replace />} />
                      <Route path="/documents" element={<Navigate to="/resume" replace />} />
                      <Route path="/ai-toolbox" element={<Navigate to="/home?assistant=1" replace />} />
                      <Route path="/analytics" element={<Navigate to="/pipeline" replace />} />
                      <Route path="/docs" element={<Navigate to="/how-it-works" replace />} />
                      <Route path="/interview-prep" element={<Navigate to="/notes" replace />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<NotFoundPage />} />
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

export default App;
