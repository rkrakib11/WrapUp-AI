import { useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, HashRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PaletteProvider } from "@/components/PaletteProvider";
import LiveChatbot from "@/components/LiveChatbot";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import Index from "./pages/Index";
import FeaturesPage from "./pages/FeaturesPage";
import PricingPage from "./pages/PricingPage";
import BlogPage from "./pages/BlogPage";
import BlogPostPage from "./pages/BlogPostPage";
import FAQsPage from "./pages/FAQsPage";
import NotFound from "./pages/NotFound";
import SignUp from "./pages/SignUp";
import Login from "./pages/Login";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import HowItWorksPage from "./pages/HowItWorksPage";
import HelpCenterPage from "./pages/HelpCenterPage";
import AboutUsPage from "./pages/AboutUsPage";
import ContactPage from "./pages/ContactPage";
import TermsOfServicePage from "./pages/TermsOfServicePage";
import PrivacyPolicyPage from "./pages/PrivacyPolicyPage";
import SharedMeetingPage from "./pages/SharedMeetingPage";
import DashboardLayout from "./components/layout/DashboardLayout";
import DashboardHome from "./pages/dashboard/DashboardHome";
import MeetingsPage from "./pages/dashboard/MeetingsPage";
import UpcomingMeetingsPage from "./pages/dashboard/UpcomingMeetingsPage";
import MeetingDetailPage from "./pages/dashboard/MeetingDetailPage";
import UploadPage from "./pages/dashboard/UploadPage";
import JoinMeetingPage from "./pages/dashboard/JoinMeetingPage";
import InstantMeetingPage from "./pages/dashboard/InstantMeetingPage";
import ScheduleMeetingPage from "./pages/dashboard/ScheduleMeetingPage";
import CalendarPage from "./pages/dashboard/CalendarPage";
import AnalyticsPage from "./pages/dashboard/AnalyticsPage";
import SettingsPage from "./pages/dashboard/SettingsPage";
import ProfilePage from "./pages/dashboard/ProfilePage";
import DashboardPricingPage from "./pages/dashboard/DashboardPricingPage";
import WeeklyMeetingsPage from "./pages/dashboard/WeeklyMeetingsPage";
import ActionItemsPage from "./pages/dashboard/ActionItemsPage";
import EngagementPage from "./pages/dashboard/EngagementPage";
import TranscriptHistoryPage from "./pages/dashboard/TranscriptHistoryPage";
import IntegrationsPage from "./pages/dashboard/IntegrationsPage";

const queryClient = new QueryClient();
const Router = typeof window !== "undefined" && window.location.protocol === "file:" ? HashRouter : BrowserRouter;

function ChatbotGuard() {
  const { pathname } = useLocation();
  const hidden =
    pathname.startsWith("/dashboard") ||
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/pricing";
  if (hidden) return null;
  return <LiveChatbot />;
}

function DesktopAuthCallbackHandler() {
  const navigate = useNavigate();
  const lastHandledUrlRef = useRef<string | null>(null);

  useEffect(() => {
    if (!window.electronApp?.onAuthCallback || !window.electronApp.consumePendingAuthCallback) {
      return;
    }

    let active = true;

    const handleAuthCallback = async (callbackUrl: string | null) => {
      if (!active || !callbackUrl || lastHandledUrlRef.current === callbackUrl) {
        return;
      }

      lastHandledUrlRef.current = callbackUrl;
      void window.electronApp?.consumePendingAuthCallback();

      try {
        const url = new URL(callbackUrl);

        if (url.protocol !== "wrapup:" || url.hostname !== "auth" || url.pathname !== "/callback") {
          throw new Error("Received an unexpected authentication callback.");
        }

        const errorDescription = url.searchParams.get("error_description");
        const errorCode = url.searchParams.get("error_code");
        const error = url.searchParams.get("error");

        if (error || errorDescription) {
          throw new Error(errorDescription ?? errorCode ?? error ?? "OAuth sign-in could not be completed.");
        }

        const code = url.searchParams.get("code");

        if (!code) {
          throw new Error("OAuth sign-in could not be completed because no auth code was returned.");
        }

        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

        if (exchangeError) {
          throw exchangeError;
        }

        navigate("/dashboard", { replace: true });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "OAuth sign-in could not be completed.");
      }
    };

    const unsubscribe = window.electronApp.onAuthCallback((callbackUrl) => {
      void handleAuthCallback(callbackUrl);
    });

    void window.electronApp.consumePendingAuthCallback().then((callbackUrl) => {
      void handleAuthCallback(callbackUrl);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [navigate]);

  return null;
}

const App = () => (
  <ThemeProvider>
    <PaletteProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <Router>
        <DesktopAuthCallbackHandler />
        <ChatbotGuard />
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/features" element={<FeaturesPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/blog/:category" element={<BlogPage />} />
          <Route path="/blog/post/:id" element={<BlogPostPage />} />
          <Route path="/faqs" element={<FAQsPage />} />
          <Route path="/how-it-works" element={<HowItWorksPage />} />
          <Route path="/help-center" element={<HelpCenterPage />} />
          <Route path="/about" element={<AboutUsPage />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/signup" element={<SignUp />} />
           <Route path="/login" element={<Login />} />
           <Route path="/forgot-password" element={<ForgotPasswordPage />} />
           <Route path="/reset-password" element={<ResetPasswordPage />} />
           <Route path="/terms" element={<TermsOfServicePage />} />
          <Route path="/privacy" element={<PrivacyPolicyPage />} />
          <Route path="/shared/:token" element={<SharedMeetingPage />} />
          <Route path="/dashboard" element={<DashboardLayout><DashboardHome /></DashboardLayout>} />
          <Route path="/dashboard/meetings" element={<DashboardLayout><MeetingsPage /></DashboardLayout>} />
          <Route path="/dashboard/upcoming" element={<DashboardLayout><UpcomingMeetingsPage /></DashboardLayout>} />
          <Route path="/dashboard/meetings/:id" element={<DashboardLayout><MeetingDetailPage /></DashboardLayout>} />
          <Route path="/dashboard/upload" element={<DashboardLayout><UploadPage /></DashboardLayout>} />
          <Route path="/dashboard/join" element={<DashboardLayout><JoinMeetingPage /></DashboardLayout>} />
          <Route path="/dashboard/join/:id" element={<DashboardLayout><JoinMeetingPage /></DashboardLayout>} />
          <Route path="/dashboard/instant" element={<DashboardLayout><InstantMeetingPage /></DashboardLayout>} />
          <Route path="/dashboard/schedule" element={<DashboardLayout><ScheduleMeetingPage /></DashboardLayout>} />
          <Route path="/dashboard/calendar" element={<DashboardLayout><CalendarPage /></DashboardLayout>} />
          <Route path="/dashboard/analytics" element={<DashboardLayout><AnalyticsPage /></DashboardLayout>} />
          <Route path="/dashboard/settings" element={<DashboardLayout><SettingsPage /></DashboardLayout>} />
          <Route path="/dashboard/profile" element={<DashboardLayout><ProfilePage /></DashboardLayout>} />
          <Route path="/dashboard/pricing" element={<DashboardPricingPage />} />
          <Route path="/dashboard/weekly-meetings" element={<DashboardLayout><WeeklyMeetingsPage /></DashboardLayout>} />
          <Route path="/dashboard/action-items" element={<DashboardLayout><ActionItemsPage /></DashboardLayout>} />
          <Route path="/dashboard/engagement" element={<DashboardLayout><EngagementPage /></DashboardLayout>} />
          <Route path="/dashboard/transcript-history" element={<DashboardLayout><TranscriptHistoryPage /></DashboardLayout>} />
          <Route path="/dashboard/integrations" element={<DashboardLayout><IntegrationsPage /></DashboardLayout>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
        </Router>
      </TooltipProvider>
    </QueryClientProvider>
    </PaletteProvider>
  </ThemeProvider>
);

export default App;
