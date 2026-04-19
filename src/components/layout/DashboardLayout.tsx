import { ReactNode, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useSubscription } from "@/hooks/useSubscription";
import { signOut } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/common/NavLink";
import {
  LayoutDashboard, Video, Upload, Radio, PhoneCall, BarChart3,
  Calendar, Settings, User, LogOut, Plus, Moon, Sun, Menu, Clock,
} from "lucide-react";
import { useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { isTierAtLeast, type SubscriptionTier } from "@/lib/subscription";

const sidebarLinks = [
  { label: "Dashboard", to: "/dashboard", icon: LayoutDashboard },
  { label: "Meetings", to: "/dashboard/meetings", icon: Video },
  { label: "Upload", to: "/dashboard/upload", icon: Upload },
  { label: "Instant Meeting", to: "/dashboard/instant", icon: Radio },
  { label: "Schedule", to: "/dashboard/schedule", icon: Calendar },
  { label: "Upcoming Meetings", to: "/dashboard/upcoming", icon: Clock },
  { label: "Join Meeting", to: "/dashboard/join", icon: PhoneCall },
  { label: "Analytics", to: "/dashboard/analytics", icon: BarChart3, minimumTier: "business" as SubscriptionTier },
  { label: "Calendar", to: "/dashboard/calendar", icon: Calendar, minimumTier: "business" as SubscriptionTier },
  { label: "Settings", to: "/dashboard/settings", icon: Settings },
  
];

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const { data: profile } = useProfile();
  const { tier } = useSubscription();
  const navigate = useNavigate();
  const [dark, setDark] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate("/login");
  }, [user, loading, navigate]);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  if (loading) {
    return (
      <div className="dark min-h-screen bg-background flex items-center justify-center">
        <Skeleton className="w-12 h-12 rounded-full" />
      </div>
    );
  }

  if (!user) return null;

  const visibleLinks = sidebarLinks.filter((link) => {
    if (!link.minimumTier) return true;
    return isTierAtLeast(tier, link.minimumTier);
  });

  const handleLogout = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className={`${dark ? "dark" : ""} h-screen overflow-hidden bg-background text-foreground flex`}>
      {/* Sidebar overlay mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-background/80 z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar — fixed, never scrolls with page */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-60 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform duration-200 ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}>
        <div className="h-16 flex items-center px-5 border-b border-sidebar-border shrink-0">
          <Link to="/" className="text-lg font-bold gradient-text">🎙️ WrapUp</Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/dashboard"}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
              activeClassName="bg-sidebar-accent text-sidebar-accent-foreground font-medium"
            >
              <link.icon className="h-4 w-4" />
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2 shrink-0">
          {/* Profile card */}
          <Link
            to="/dashboard/profile"
            className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-sidebar-accent transition-colors"
          >
            <div className="w-9 h-9 rounded-full overflow-hidden gradient-bg flex items-center justify-center shrink-0">
              {profile?.avatar_url ? (
                <img src={profile.avatar_url} alt="Avatar" className="w-full h-full object-cover" />
              ) : (
                <span className="text-xs font-bold text-primary-foreground">
                  {(profile?.full_name || user?.email || "U").slice(0, 2).toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-sidebar-foreground truncate">{profile?.full_name || "User"}</p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </Link>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors w-full"
          >
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </aside>

      {/* Main — offset by sidebar width, scrolls independently */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60 h-screen overflow-hidden">
        {/* Top nav */}
        <header className="h-28 border-b border-border flex items-center justify-between px-4 lg:px-6 bg-card/50 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3">
            <button className="lg:hidden text-foreground" onClick={() => setSidebarOpen(true)}>
              <Menu className="h-5 w-5" />
            </button>
            <div>
              <p className="text-2xl font-bold leading-tight">Dashboard</p>
              <p className="text-base text-muted-foreground mt-0.5">
                {tier === "enterprise" ? "Enterprise command center" : tier === "business" ? "Business workspace" : tier === "plus" ? "Plus workspace" : "Free workspace"} for{" "}
                {profile?.full_name || user.email?.split("@")[0] || "there"} 👋
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost" size="icon"
              onClick={() => setDark(!dark)}
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button size="sm" className="gradient-bg text-primary-foreground font-semibold" onClick={() => navigate("/dashboard/meetings?new=true")}>
              <Plus className="h-4 w-4 mr-1" /> New Meeting
            </Button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-3 lg:p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
