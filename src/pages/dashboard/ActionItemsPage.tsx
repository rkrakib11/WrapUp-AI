import { useMemo, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, ListTodo, CheckCircle2, Circle, TrendingUp, BarChart3 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import { useActionItems } from "@/hooks/useActionItems";
import { useMeetings } from "@/hooks/useMeetings";
import { useSubscription } from "@/hooks/useSubscription";
import { usePalette } from "@/components/providers/PaletteProvider";
import { PremiumGate } from "@/components/dashboard/PremiumGate";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

const trendChartConfig: ChartConfig = {
  created: { label: "Created", color: "hsl(var(--primary))" },
  completed: { label: "Completed", color: "hsl(142, 71%, 45%)" },
};

export default function ActionItemsPage() {
  const { actionItemsQuery, toggleActionItem } = useActionItems();
  const { meetingsQuery } = useMeetings();
  const { tier } = useSubscription();
  const { colors } = usePalette();

  const actionItems = actionItemsQuery.data ?? [];
  const meetings = meetingsQuery.data ?? [];

  const meetingMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of meetings) map.set(m.id, m.title);
    return map;
  }, [meetings]);

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const pending = useMemo(() => actionItems.filter((a) => !a.is_completed), [actionItems]);
  const completed = useMemo(() => actionItems.filter((a) => a.is_completed), [actionItems]);
  const completedThisWeek = useMemo(
    () => completed.filter((a) => new Date(a.updated_at) >= weekAgo),
    [completed, weekAgo],
  );
  const completionRate = actionItems.length > 0 ? Math.round((completed.length / actionItems.length) * 100) : 0;

  // Trend data: last 4 weeks
  const trendData = useMemo(() => {
    const weeks: { week: string; created: number; completed: number }[] = [];
    for (let i = 3; i >= 0; i--) {
      const start = new Date(now.getTime() - (i + 1) * 7 * 24 * 60 * 60 * 1000);
      const end = new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000);
      const label = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const createdCount = actionItems.filter((a) => {
        const d = new Date(a.created_at);
        return d >= start && d < end;
      }).length;
      const completedCount = actionItems.filter((a) => {
        if (!a.is_completed) return false;
        const d = new Date(a.updated_at);
        return d >= start && d < end;
      }).length;
      weeks.push({ week: label, created: createdCount, completed: completedCount });
    }
    return weeks;
  }, [actionItems]);

  // By-meeting breakdown
  const byMeeting = useMemo(() => {
    const map = new Map<string, { total: number; pending: number }>();
    for (const a of actionItems) {
      const existing = map.get(a.meeting_id) || { total: 0, pending: 0 };
      existing.total++;
      if (!a.is_completed) existing.pending++;
      map.set(a.meeting_id, existing);
    }
    return Array.from(map.entries())
      .map(([id, counts]) => ({ id, title: meetingMap.get(id) || "Unknown Meeting", ...counts }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [actionItems, meetingMap]);

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
  };

  const statCards = [
    { label: "Pending", value: pending.length.toString(), sub: "Tasks to complete", icon: ListTodo, iconBg: "bg-amber-500/15", iconColor: "text-amber-500" },
    { label: "Completed This Week", value: completedThisWeek.length.toString(), sub: "Tasks done recently", icon: CheckCircle2, iconBg: "bg-emerald-500/15", iconColor: "text-emerald-500" },
    { label: "Completion Rate", value: `${completionRate}%`, sub: "Overall progress", icon: TrendingUp, iconBg: "bg-blue-500/15", iconColor: "text-blue-500" },
    { label: "Total Items", value: actionItems.length.toString(), sub: "All time", icon: BarChart3, iconBg: "bg-violet-500/15", iconColor: "text-violet-500" },
  ];

  const renderItem = (item: typeof actionItems[0]) => (
    <div
      key={item.id}
      className="flex items-start gap-3 p-4 border-b border-border last:border-b-0 hover:bg-accent/30 transition-colors"
    >
      <Checkbox
        checked={item.is_completed}
        onCheckedChange={(checked) =>
          toggleActionItem.mutate({ id: item.id, is_completed: checked === true })
        }
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
          {item.title}
        </p>
        <div className="flex items-center gap-3 mt-1">
          {item.meeting_id && (
            <Link
              to={`/dashboard/meetings/${item.meeting_id}`}
              className="text-xs text-primary hover:underline truncate"
            >
              {meetingMap.get(item.meeting_id) || "View meeting"}
            </Link>
          )}
          <span className="text-xs text-muted-foreground">
            {new Date(item.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
          </span>
        </div>
      </div>
      {item.is_completed ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
      ) : (
        <Circle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">Action Items</h1>
      </div>

      {/* Summary Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
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

      {/* Tabs: Pending / Completed / All */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4} className="rounded-xl overflow-hidden" style={cardStyle}>
        <Tabs defaultValue="pending">
          <div className="px-5 pt-5">
            <TabsList>
              <TabsTrigger value="pending">Pending ({pending.length})</TabsTrigger>
              <TabsTrigger value="completed">Completed ({completed.length})</TabsTrigger>
              <TabsTrigger value="all">All ({actionItems.length})</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="pending" className="mt-0">
            {pending.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No pending action items. Great work!</div>
            ) : (
              pending.map(renderItem)
            )}
          </TabsContent>
          <TabsContent value="completed" className="mt-0">
            {completed.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No completed items yet.</div>
            ) : (
              completed.map(renderItem)
            )}
          </TabsContent>
          <TabsContent value="all" className="mt-0">
            {actionItems.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No action items yet. They'll appear here once generated from your meetings.</div>
            ) : (
              actionItems.map(renderItem)
            )}
          </TabsContent>
        </Tabs>
      </motion.div>

      {/* Completion Trend (Plus+) */}
      <PremiumGate tier={tier} minimumTier="plus" featureName="Completion Trends">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={5} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">Completion Trend (Last 4 Weeks)</h2>
          <ChartContainer config={trendChartConfig} className="h-[220px] w-full">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tickLine={false} axisLine={false} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="created" fill="var(--color-created)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="completed" fill="var(--color-completed)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        </motion.div>
      </PremiumGate>

      {/* By-Meeting Breakdown (Business+) */}
      <PremiumGate tier={tier} minimumTier="business" featureName="Meeting Breakdown">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={6} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">Action Items by Meeting</h2>
          {byMeeting.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
          ) : (
            <div className="space-y-3">
              {byMeeting.map((m) => (
                <Link key={m.id} to={`/dashboard/meetings/${m.id}`} className="flex items-center justify-between p-3 rounded-lg hover:bg-accent/30 transition-colors">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.pending} pending of {m.total} total</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-emerald-500 transition-all"
                        style={{ width: `${m.total > 0 ? ((m.total - m.pending) / m.total) * 100 : 0}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">
                      {m.total > 0 ? Math.round(((m.total - m.pending) / m.total) * 100) : 0}%
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </motion.div>
      </PremiumGate>
    </div>
  );
}
