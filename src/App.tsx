import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleProtectedRoute from "@/components/RoleProtectedRoute";
import { Analytics as VercelAnalytics } from "@vercel/analytics/react";

// Eager-loaded routes (critical path)
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";

// Lazy-loaded routes
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const PrintResume = lazy(() => import("./pages/PrintResume"));
const AppLayout = lazy(() => import("./components/layout/AppLayout"));
const HomePage = lazy(() => import("./pages/HomePage"));
const JobTracker = lazy(() => import("./pages/JobTracker"));
const MockInterviews = lazy(() => import("./pages/MockInterviews"));
const Documents = lazy(() => import("./pages/Documents"));
const ResumeProjects = lazy(() => import("./pages/ResumeProjects"));
const ResumeBuilder = lazy(() => import("./pages/ResumeBuilder"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const JobSearchPage = lazy(() => import("./pages/JobSearchPage"));
const Contacts = lazy(() => import("./pages/Contacts"));
const CoverLettersPage = lazy(() => import("./pages/CoverLettersPage"));
const CoverLetterPage = lazy(() => import("./pages/CoverLetterPage"));
const InterviewPrepPage = lazy(() => import("./pages/InterviewPrepPage"));
const ATSCheckerPage = lazy(() => import("./pages/ATSCheckerPage"));
const AIToolbox = lazy(() => import("./pages/AIToolbox"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Chat = lazy(() => import("./pages/Chat"));
const Profile = lazy(() => import("./pages/Profile"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const ControlCenter = lazy(() => import("./pages/ControlCenter"));
const MarketDominationMap = lazy(() => import("./pages/MarketDominationMap"));
const AdminPortal = lazy(() => import("./pages/AdminPortal"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient();

const SuspenseFallback = () => (
  <LoadingSpinner fullScreen message="Loading..." />
);

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Suspense fallback={<SuspenseFallback />}>
              <Routes>
                {/* Public routes */}
                <Route path="/" element={<Landing />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/print-resume" element={<PrintResume />} />

                {/* Protected app routes with sidebar layout */}
                <Route element={<ProtectedRoute />}>
                  <Route element={<AppLayout />}>
                    <Route path="/home" element={<HomePage />} />
                    <Route path="/jobs" element={<JobsPage />} />
                    <Route path="/job-search" element={<JobSearchPage />} />
                    <Route path="/resume-builder" element={<ResumeProjects />} />
                    <Route path="/resume-builder/:resumeId" element={<ResumeBuilder />} />
                    <Route path="/job-tracker" element={<JobTracker />} />
                    <Route path="/mock-interviews" element={<MockInterviews />} />
                    <Route path="/interview-prep" element={<InterviewPrepPage />} />
                    <Route path="/cover-letter" element={<CoverLetterPage />} />
                    <Route path="/ats-checker" element={<ATSCheckerPage />} />
                    <Route path="/chat" element={<Chat />} />
                    <Route path="/c/:conversationId" element={<Chat />} />
                    <Route path="/dashboard" element={<Dashboard />} />
                    <Route path="/control-center" element={<ControlCenter />} />
                    <Route path="/market-domination-map" element={<MarketDominationMap />} />
                    <Route path="/profile" element={<Profile />} />
                    <Route path="/documents" element={<Documents />} />
                    <Route path="/cover-letters" element={<CoverLettersPage />} />
                    <Route path="/linkedin" element={<Profile />} />
                    <Route path="/contacts" element={<Contacts />} />
                    <Route path="/ai-toolbox" element={<AIToolbox />} />
                    <Route path="/analytics" element={<Analytics />} />
                  </Route>
                </Route>

                {/* Admin-only routes */}
                <Route element={<RoleProtectedRoute allowedRoles={["admin"]} />}>
                  <Route element={<AppLayout />}>
                    <Route path="/admin" element={<AdminPortal />} />
                  </Route>
                </Route>

                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </BrowserRouter>
          <VercelAnalytics />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
