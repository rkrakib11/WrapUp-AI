import { useMemo, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Sparkles, Crown, Activity, ListTodo, FileText } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import { useMeetings } from "@/hooks/useMeetings";
import { useActionItems } from "@/hooks/useActionItems";
import { useSubscription } from "@/hooks/useSubscription";
import { usePalette } from "@/components/providers/PaletteProvider";
import { PremiumGate } from "@/components/dashboard/PremiumGate";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Button } from "@/components/ui/button";
import { groupMeetingsByDay, groupMeetingsByWeek } from "@/lib/dashboard-utils";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

const activityChartConfig: ChartConfig = {
  count: { label: "Meetings", color: "hsl(var(--primary))" },
};

const trendChartConfig: ChartConfig = {
  count: { label: "Meetings", color: "hsl(142, 71%, 45%)" },
};

export default function EngagementPage() {
  const { meetingsQuery } = useMeetings();
  const { actionItemsQuery } = useActionItems();
  const { tier } = useSubscription();
  const { colors } = usePalette();
  const meetings = meetingsQuery.data ?? [];
  const actionItems = actionItemsQuery.data ?? [];
  const now = new Date();

  // Engagement score (same logic as DashboardHome)
  const engagement = useMemo(() => {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thisWeekCount = meetings.filter((m) => new Date(m.created_at) >= weekAgo).length;
    const lastWeekCount = meetings.filter((m) => {
      const d = new Date(m.created_at);
      return d >= twoWeeksAgo && d < weekAgo;
    }).length;
    const pct = lastWeekCount > 0
      ? Math.round(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100)
      : thisWeekCount > 0 ? 100 : 0;
    const score = Math.min(100, Math.round((thisWeekCount / 10) * 100));
    return { score, change: pct, thisWeek: thisWeekCount, lastWeek: lastWeekCount };
  }, [meetings]);

  // 14-day activity
  const dailyData = useMemo(() => groupMeetingsByDay(meetings, 14), [meetings]);

  // 8-week trend
  const weeklyData = useMemo(() => groupMeetingsByWeek(meetings, 8), [meetings]);

  // Business+ breakdown metrics
  const breakdownMetrics = useMemo(() => {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thisWeekMeetings = meetings.filter((m) => new Date(m.created_at) >= weekAgo);
    const thisWeekActions = actionItems.filter((a) => new Date(a.created_at) >= weekAgo);

    const avgDuration = thisWeekMeetings.length > 0
      ? Math.round(thisWeekMeetings.reduce((sum, m) => sum + ((m as any).duration_minutes || 0), 0) / thisWeekMeetings.length)
      : 0;

    const actionsPerMeeting = thisWeekMeetings.length > 0
      ? (thisWeekActions.length / thisWeekMeetings.length).toFixed(1)
      : "0";

    return { avgDuration, actionsPerMeeting, meetingsThisWeek: thisWeekMeetings.length };
  }, [meetings, actionItems]);

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
  };

  const scoreColor = engagement.score >= 70 ? "text-emerald-500" : engagement.score >= 40 ? "text-amber-500" : "text-red-500";
  const scoreBg = engagement.score >= 70 ? "bg-emerald-500" : engagement.score >= 40 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Engagement Analytics</h1>
      </div>

      {/* Large Engagement Score */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="rounded-xl p-8 text-center" style={cardStyle}>
        <div className="inline-flex items-center justify-center w-32 h-32 rounded-full border-4 border-border relative mb-4">
          <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 128 128">
            <circle cx="64" cy="64" r="56" fill="none" strokeWidth="8" className="stroke-muted" />
            <circle
              cx="64" cy="64" r="56" fill="none" strokeWidth="8"
              className={scoreBg.replace("bg-", "stroke-")}
              strokeDasharray={`${(engagement.score / 100) * 352} 352`}
              strokeLinecap="round"
            />
          </svg>
          <span className={`text-4xl font-bold ${scoreColor}`}>{engagement.score}%</span>
        </div>
        <h2 className="text-lg font-semibold mb-1">Engagement Score</h2>
        <p className={`text-sm ${engagement.change >= 0 ? "text-emerald-500" : "text-red-500"}`}>
          {engagement.change >= 0 ? "↗" : "↘"} {engagement.change >= 0 ? "+" : ""}{engagement.change}% from last week
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {engagement.thisWeek} meetings this week vs {engagement.lastWeek} last week. Target: 10 meetings/week.
        </p>
      </motion.div>

      {/* Stats Row */}
      <div className="grid sm:grid-cols-3 gap-4">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium">This Week</span>
            <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center">
              <Activity className="h-4 w-4 text-primary" />
            </div>
          </div>
          <p className="text-3xl font-bold mb-1">{engagement.thisWeek}</p>
          <p className="text-xs text-muted-foreground">Meetings recorded</p>
        </motion.div>
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium">Last Week</span>
            <div className="w-9 h-9 rounded-full bg-blue-500/15 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-blue-500" />
            </div>
          </div>
          <p className="text-3xl font-bold mb-1">{engagement.lastWeek}</p>
          <p className="text-xs text-muted-foreground">Meetings recorded</p>
        </motion.div>
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground font-medium">Target Progress</span>
            <div className="w-9 h-9 rounded-full bg-emerald-500/15 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-emerald-500" />
            </div>
          </div>
          <p className="text-3xl font-bold mb-1">{engagement.thisWeek}/10</p>
          <p className="text-xs text-muted-foreground">Weekly goal</p>
        </motion.div>
      </div>

      {/* 14-Day Activity Chart */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4} className="rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-semibold mb-4">Activity (Last 14 Days)</h2>
        <ChartContainer config={activityChartConfig} className="h-[220px] w-full">
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </motion.div>

      {/* 8-Week Frequency Trend (Plus+) */}
      <PremiumGate tier={tier} minimumTier="plus" featureName="Frequency Trends">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={5} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">8-Week Frequency Trend</h2>
          <ChartContainer config={trendChartConfig} className="h-[200px] w-full">
            <LineChart data={weeklyData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Line type="monotone" dataKey="count" stroke="var(--color-count)" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ChartContainer>
        </motion.div>
      </PremiumGate>

      {/* Engagement Breakdown (Business+) */}
      <PremiumGate tier={tier} minimumTier="business" featureName="Engagement Breakdown">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={6} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">Engagement Breakdown</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Activity className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">Avg. Meeting Duration</span>
              </div>
              <p className="text-2xl font-bold">{breakdownMetrics.avgDuration > 0 ? `${breakdownMetrics.avgDuration}m` : "—"}</p>
              <p className="text-xs text-muted-foreground mt-1">This week's average</p>
            </div>
            <div className="rounded-lg bg-muted/30 p-4">
              <div className="flex items-center gap-2 mb-2">
                <ListTodo className="h-4 w-4 text-amber-500" />
                <span className="text-xs font-semibold">Actions per Meeting</span>
              </div>
              <p className="text-2xl font-bold">{breakdownMetrics.actionsPerMeeting}</p>
              <p className="text-xs text-muted-foreground mt-1">Avg. action items generated</p>
            </div>
          </div>
        </motion.div>
      </PremiumGate>

      {/* Tips Card (Free users) */}
      {tier === "free" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={7} className="rounded-xl p-6 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <Sparkles className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold mb-1">Boost Your Engagement</h3>
              <ul className="text-sm text-muted-foreground space-y-1.5">
                <li>Record more meetings to increase your engagement score</li>
                <li>Use action items to track follow-ups from every meeting</li>
                <li>Upgrade to Plus for weekly trend insights and deeper analytics</li>
              </ul>
              <Button asChild size="sm" className="mt-3 gradient-bg text-primary-foreground">
                <Link to="/dashboard/pricing"><Crown className="h-3.5 w-3.5 mr-1" /> Upgrade Plan</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
