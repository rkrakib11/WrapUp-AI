import { motion } from "framer-motion";
import { Video, ListTodo, TrendingUp, Calendar, Clock, ShieldCheck, Users, LibraryBig, CalendarSync } from "lucide-react";
import { useMeetings } from "@/hooks/useMeetings";
import { useActionItems } from "@/hooks/useActionItems";
import { useSubscription } from "@/hooks/useSubscription";
import { Link } from "react-router-dom";
import OnboardingTour from "@/components/dashboard/OnboardingTour";
import { PlanBadge, MeetingLimitBanner } from "@/components/dashboard/PremiumGate";
import { usePalette } from "@/components/providers/PaletteProvider";
import { CSSProperties, useMemo } from "react";
const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function DashboardHome() {
  const { meetingsQuery } = useMeetings();
  const { actionItemsQuery } = useActionItems();
  const { tier, features } = useSubscription();
  const { colors } = usePalette();
  const meetings = meetingsQuery.data ?? [];
  const actionItems = actionItemsQuery.data ?? [];
  const now = new Date();

  const thisWeek = meetings.filter((m) => {
    const d = new Date(m.created_at);
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return d >= weekAgo;
  });

  const upcomingMeetings = meetings.filter((m) => {
    const sa = (m as any).scheduled_at;
    return sa && new Date(sa) >= now;
  }).sort((a, b) => new Date((a as any).scheduled_at).getTime() - new Date((b as any).scheduled_at).getTime());

  const pendingActions = actionItems.filter((a) => !a.is_completed).length;

  const engagement = useMemo(() => {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thisWeekCount = meetings.filter((m) => new Date(m.created_at) >= weekAgo).length;
    const lastWeekCount = meetings.filter((m) => {
      const d = new Date(m.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;
    const pct = lastWeekCount > 0 ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100) : thisWeekCount > 0 ? 100 : 0;
    // Engagement score: normalize to 0-100 range based on a target of 10 meetings/week
    const score = Math.min(100, Math.round((thisWeekCount / 10) * 100));
    return { score, change: pct };
  }, [meetings]);

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
    transition: "all 0.3s ease",
  };

  const hoverHandlers = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.backgroundColor = colors.cardHoverBg;
      e.currentTarget.style.boxShadow = `0 0 30px -8px ${colors.cardGlow}40`;
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      e.currentTarget.style.backgroundColor = colors.cardBg;
      e.currentTarget.style.boxShadow = "none";
    },
  };

  const engSub = engagement.change >= 0 ? `↗ +${engagement.change}% from last week` : `↘ ${engagement.change}% from last week`;

  const cards = [
    { label: "This Week", value: thisWeek.length.toString(), sub: "Meetings Analyzed", icon: Calendar, iconBg: "bg-primary/15", iconColor: "text-primary", to: "/dashboard/weekly-meetings" },
    { label: "Action Items", value: pendingActions.toString(), sub: "Pending Tasks", icon: ListTodo, iconBg: "bg-amber-500/15", iconColor: "text-amber-500", to: "/dashboard/action-items" },
    { label: "Avg. Engagement", value: `${engagement.score}%`, sub: engSub, icon: TrendingUp, iconBg: "bg-emerald-500/15", iconColor: "text-emerald-500", subColor: engagement.change >= 0 ? "text-emerald-500" : "text-red-500", to: "/dashboard/engagement" },
  ];

  const tierCards = tier === "enterprise"
    ? [
        { label: "Audit Events", value: "Enabled", sub: "Enterprise controls active", icon: ShieldCheck, iconBg: "bg-sky-500/15", iconColor: "text-sky-500", to: "/dashboard/transcript-history" },
        { label: "SSO / SAML", value: "Enabled", sub: "Identity federation ready", icon: Users, iconBg: "bg-violet-500/15", iconColor: "text-violet-500", to: "/dashboard/integrations" },
      ]
    : tier === "business"
    ? [
        { label: "Team Workspaces", value: "On", sub: "Collaborative workspace features", icon: Users, iconBg: "bg-indigo-500/15", iconColor: "text-indigo-500", to: "/dashboard/transcript-history" },
        { label: "Shared Libraries", value: "On", sub: "Cross-team meeting knowledge base", icon: LibraryBig, iconBg: "bg-rose-500/15", iconColor: "text-rose-500", to: "/dashboard/integrations" },
      ]
    : [
        { label: "Transcript History", value: features.transcriptHistoryDays ? `${features.transcriptHistoryDays}d` : "Unlimited", sub: "Retention window", icon: Clock, iconBg: "bg-blue-500/15", iconColor: "text-blue-500", to: "/dashboard/transcript-history" },
        { label: "Integrations", value: features.basicIntegrations ? "Basic" : "None", sub: features.basicIntegrations ? "Slack/Zoom-ready" : "Upgrade to connect tools", icon: CalendarSync, iconBg: "bg-cyan-500/15", iconColor: "text-cyan-500", to: "/dashboard/integrations" },
      ];

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const meetingsThisMonth = meetings.filter((m) => new Date(m.created_at) >= monthStart).length;
  const meetingLimit = features.meetingsPerMonth;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="sr-only">Dashboard</h1>
        <PlanBadge tier={tier} />
      </div>
      <OnboardingTour />

      {meetingLimit !== null && (
        <MeetingLimitBanner used={meetingsThisMonth} limit={meetingLimit} />
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card, i) => (
          <Link key={card.label} to={card.to} className="block">
            <motion.div
              initial="hidden" animate="visible" variants={fadeUp} custom={i}
              className="rounded-xl p-5 cursor-pointer"
              style={cardStyle}
              {...hoverHandlers}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                <div className={`w-9 h-9 rounded-full ${card.iconBg} flex items-center justify-center`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
              </div>
              <p className="text-3xl font-bold mb-1">{card.value}</p>
              <p className={`text-xs ${card.subColor || "text-muted-foreground"}`}>{card.sub}</p>
            </motion.div>
          </Link>
        ))}
        {tierCards.map((card, i) => (
          <Link key={card.label} to={card.to} className="block">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              custom={i + cards.length}
              className="rounded-xl p-5 cursor-pointer"
              style={cardStyle}
              {...hoverHandlers}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
                <div className={`w-9 h-9 rounded-full ${card.iconBg} flex items-center justify-center`}>
                  <card.icon className={`h-4 w-4 ${card.iconColor}`} />
                </div>
              </div>
              <p className="text-3xl font-bold mb-1">{card.value}</p>
              <p className="text-xs text-muted-foreground">{card.sub}</p>
            </motion.div>
          </Link>
        ))}
      </div>

      {/* Upcoming Meetings */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Upcoming Meetings</h2>
          <Link to="/dashboard/upcoming" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        <div className="grid sm:grid-cols-2 gap-4 mt-3">
          {upcomingMeetings.length === 0 ? (
            <div className="rounded-xl p-6 text-center text-muted-foreground text-sm sm:col-span-2" style={cardStyle}>
              No upcoming meetings scheduled. <Link to="/dashboard/schedule" className="text-primary hover:underline">Schedule one</Link>
            </div>
          ) : (
            upcomingMeetings.slice(0, 4).map((m) => {
              const sa = new Date((m as any).scheduled_at);
              return (
                <Link key={m.id} to={`/dashboard/meetings/${m.id}`} className="rounded-xl p-4 block" style={cardStyle} {...hoverHandlers}>
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-sm">{m.title}</p>
                    <span className="text-[10px] font-medium px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/20">Upcoming</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{sa.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{sa.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </div>

      {/* Recent meetings */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Recent Meetings</h2>
          <Link to="/dashboard/meetings" className="text-sm text-primary hover:underline">View all</Link>
        </div>
        {meetingsQuery.isLoading ? (
          <div className="rounded-xl p-6 text-center text-muted-foreground text-sm" style={cardStyle}>Loading...</div>
        ) : meetings.length === 0 ? (
          <div className="rounded-xl p-6 text-center text-muted-foreground text-sm" style={cardStyle}>
            No meetings yet. Create your first meeting to get started!
          </div>
        ) : (
          <div className="rounded-xl divide-y divide-border" style={cardStyle}>
            {meetings.slice(0, 5).map((m) => (
              <Link key={m.id} to={`/dashboard/meetings/${m.id}`} className="flex items-center justify-between p-4 hover:bg-accent/50 transition-colors first:rounded-t-xl last:rounded-b-xl">
                <div>
                  <p className="font-medium text-sm">{m.title}</p>
                  <p className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleDateString()}</p>
                </div>
                <Video className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
