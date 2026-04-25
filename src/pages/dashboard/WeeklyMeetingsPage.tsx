import { useMemo, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, Clock, TrendingUp, Video } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line } from "recharts";
import { useMeetings } from "@/hooks/useMeetings";
import { useSubscription } from "@/hooks/useSubscription";
import { usePalette } from "@/components/providers/PaletteProvider";
import { PremiumGate } from "@/components/dashboard/PremiumGate";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { getThisWeekMeetings, groupMeetingsByDay, groupMeetingsByWeek, getMonthlyUsage } from "@/lib/dashboard-utils";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

const dailyChartConfig: ChartConfig = {
  count: { label: "Meetings", color: "hsl(var(--primary))" },
};

const weeklyChartConfig: ChartConfig = {
  count: { label: "Meetings", color: "hsl(var(--primary))" },
};

export default function WeeklyMeetingsPage() {
  const { meetingsQuery } = useMeetings();
  const { tier, features } = useSubscription();
  const { colors } = usePalette();
  const meetings = meetingsQuery.data ?? [];

  const thisWeek = useMemo(() => getThisWeekMeetings(meetings), [meetings]);
  const dailyData = useMemo(() => groupMeetingsByDay(meetings, 7), [meetings]);
  const weeklyData = useMemo(() => groupMeetingsByWeek(meetings, 4), [meetings]);
  const monthlyUsage = useMemo(() => getMonthlyUsage(meetings), [meetings]);

  const totalDuration = useMemo(
    () => thisWeek.reduce((sum, m) => sum + ((m as any).duration_minutes || 0), 0),
    [thisWeek],
  );
  const dailyAvg = (thisWeek.length / 7).toFixed(1);

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
  };

  const meetingLimit = features.meetingsPerMonth;
  const limitPct = meetingLimit ? Math.min(100, Math.round((monthlyUsage / meetingLimit) * 100)) : 0;

  const statCards = [
    { label: "This Week", value: thisWeek.length.toString(), sub: "Meetings recorded", icon: Calendar, iconBg: "bg-primary/15", iconColor: "text-primary" },
    { label: "Total Duration", value: totalDuration > 0 ? `${totalDuration}m` : "—", sub: "Minutes in meetings", icon: Clock, iconBg: "bg-blue-500/15", iconColor: "text-blue-500" },
    { label: "Daily Average", value: dailyAvg, sub: "Meetings per day", icon: TrendingUp, iconBg: "bg-emerald-500/15", iconColor: "text-emerald-500" },
  ];

  const displayMeetings = tier === "free" ? thisWeek.slice(0, 5) : thisWeek;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Weekly Meetings</h1>
      </div>

      {/* Summary Stats */}
      <div className="grid sm:grid-cols-3 gap-4">
        {statCards.map((card, i) => (
          <motion.div key={card.label} initial="hidden" animate="visible" variants={fadeUp} custom={i} className="rounded-xl p-5" style={cardStyle}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground font-medium">{card.label}</span>
              <div className={`w-9 h-9 rounded-full ${card.iconBg} flex items-center justify-center`}>
                <card.icon className={`h-4 w-4 ${card.iconColor}`} />
              </div>
            </div>
            <p className="text-3xl font-bold mb-1">{card.value}</p>
            <p className="text-xs text-muted-foreground">{card.sub}</p>
          </motion.div>
        ))}
      </div>

      {/* Daily Breakdown Chart */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-semibold mb-4">Daily Breakdown (Last 7 Days)</h2>
        <ChartContainer config={dailyChartConfig} className="h-[220px] w-full">
          <BarChart data={dailyData}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </motion.div>

      {/* 4-Week Trend (Plus+) */}
      <PremiumGate tier={tier} minimumTier="plus" featureName="Weekly Trend">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">4-Week Trend</h2>
          <ChartContainer config={weeklyChartConfig} className="h-[200px] w-full">
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

      {/* Monthly Limit Progress (Free/Plus) */}
      {meetingLimit !== null && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={5} className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-semibold">Monthly Usage</h2>
            <span className="text-xs text-muted-foreground">{monthlyUsage} / {meetingLimit} meetings</span>
          </div>
          <Progress value={limitPct} className="h-2" />
          <p className="text-xs text-muted-foreground mt-2">
            {Math.max(0, meetingLimit - monthlyUsage)} meetings remaining this month
          </p>
        </motion.div>
      )}

      {/* Meetings Table */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={6} className="rounded-xl overflow-hidden" style={cardStyle}>
        <div className="p-5 pb-0">
          <h2 className="text-sm font-semibold mb-3">This Week's Meetings</h2>
        </div>
        {displayMeetings.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            No meetings recorded this week. <Link to="/dashboard/upload" className="text-primary hover:underline">Upload a recording</Link> or <Link to="/dashboard/new-meeting" className="text-primary hover:underline">start a new meeting</Link>.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Duration</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {displayMeetings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell>
                    <Link to={`/dashboard/meetings/${m.id}`} className="text-sm font-medium hover:text-primary transition-colors flex items-center gap-2">
                      <Video className="h-3.5 w-3.5 text-muted-foreground" />
                      {m.title}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {new Date(m.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {(m as any).duration_minutes ? `${(m as any).duration_minutes}m` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {tier === "free" && thisWeek.length > 5 && (
          <div className="p-4 text-center border-t border-border">
            <p className="text-xs text-muted-foreground">Showing 5 of {thisWeek.length} meetings. <Link to="/dashboard/pricing" className="text-primary hover:underline">Upgrade</Link> to see all.</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
