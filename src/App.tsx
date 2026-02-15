import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";

// Public pages (no auth required)
import Auth from "@/pages/Auth";
import ResetPassword from "@/pages/ResetPassword";
import Landing from "@/pages/Landing";
import PrintResume from "@/pages/PrintResume";
import NotFound from "@/pages/NotFound";

// Protected pages (rendered inside AppLayout)
import HomePage from "@/pages/HomePage";
import Dashboard from "@/pages/Dashboard";
import Chat from "@/pages/Chat";
import ResumeBuilder from "@/pages/ResumeBuilder";
import JobSearchPage from "@/pages/JobSearchPage";
import CoverLetterPage from "@/pages/CoverLetterPage";
import CoverLettersPage from "@/pages/CoverLettersPage";
import ATSCheckerPage from "@/pages/ATSCheckerPage";
import JobTracker from "@/pages/JobTracker";
import InterviewPrepPage from "@/pages/InterviewPrepPage";
import MockInterviews from "@/pages/MockInterviews";
import Analytics from "@/pages/Analytics";
import Documents from "@/pages/Documents";
import Contacts from "@/pages/Contacts";
import AIToolbox from "@/pages/AIToolbox";
import Profile from "@/pages/Profile";
import JobsPage from "@/pages/JobsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes (no auth, no sidebar) */}
            <Route path="/auth" element={<Auth />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/landing" element={<Landing />} />
            <Route path="/print-resume" element={<PrintResume />} />

            {/* Protected routes inside AppLayout (sidebar + header) */}
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/" element={<HomePage />} />
                <Route path="/home" element={<HomePage />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/chat" element={<Chat />} />
                <Route path="/c/:conversationId" element={<Chat />} />
                <Route path="/resume-builder" element={<ResumeBuilder />} />
                <Route path="/job-search" element={<JobSearchPage />} />
                <Route path="/cover-letter" element={<CoverLetterPage />} />
                <Route path="/cover-letters" element={<CoverLettersPage />} />
                <Route path="/ats-checker" element={<ATSCheckerPage />} />
                <Route path="/job-tracker" element={<JobTracker />} />
                <Route path="/interview-prep" element={<InterviewPrepPage />} />
                <Route path="/mock-interviews" element={<MockInterviews />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/documents" element={<Documents />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/ai-toolbox" element={<AIToolbox />} />
                <Route path="/profile" element={<Profile />} />
                <Route path="/jobs" element={<JobsPage />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
