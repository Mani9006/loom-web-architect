import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";
import Chat from "./pages/Chat";
import Auth from "./pages/Auth";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import NotFound from "./pages/NotFound";
import PrintResume from "./pages/PrintResume";
import AppLayout from "./components/layout/AppLayout";
import HomePage from "./pages/HomePage";
import JobTracker from "./pages/JobTracker";
import MockInterviews from "./pages/MockInterviews";
import Documents from "./pages/Documents";
import ResumeBuilder from "./pages/ResumeBuilder";
import JobsPage from "./pages/JobsPage";
import Contacts from "./pages/Contacts";
import CoverLettersPage from "./pages/CoverLettersPage";
import AIToolbox from "./pages/AIToolbox";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/print-resume" element={<PrintResume />} />

          {/* App routes with sidebar layout */}
          <Route element={<AppLayout />}>
            <Route path="/home" element={<HomePage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/resume-builder" element={<ResumeBuilder />} />
            <Route path="/job-tracker" element={<JobTracker />} />
            <Route path="/mock-interviews" element={<MockInterviews />} />
            <Route path="/chat" element={<Chat />} />
            <Route path="/c/:conversationId" element={<Chat />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/documents" element={<Documents />} />
            <Route path="/cover-letters" element={<CoverLettersPage />} />
            <Route path="/linkedin" element={<Profile />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/ai-toolbox" element={<AIToolbox />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
