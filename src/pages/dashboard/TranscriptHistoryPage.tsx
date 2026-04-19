import { useMemo, useState, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, FileText, Search, ShieldCheck, Users, Check, Crown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMeetings } from "@/hooks/useMeetings";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { usePalette } from "@/components/providers/PaletteProvider";
import { PremiumGate } from "@/components/dashboard/PremiumGate";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

export default function TranscriptHistoryPage() {
  const { user } = useAuth();
  const { meetingsQuery } = useMeetings();
  const { tier, features } = useSubscription();
  const { colors } = usePalette();
  const meetings = meetingsQuery.data ?? [];
  const [search, setSearch] = useState("");

  // Fetch sessions with transcripts
  const sessionsQuery = useQuery({
    queryKey: ["transcript-sessions", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sessions")
        .select("id, meeting_id, created_at, transcript")
        .not("transcript", "is", null)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const sessions = sessionsQuery.data ?? [];

  const meetingMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of meetings) map.set(m.id, m.title);
    return map;
  }, [meetings]);

  // Filter sessions by retention window
  const retentionDays = features.transcriptHistoryDays;
  const filteredSessions = useMemo(() => {
    let list = sessions;
    if (retentionDays !== null) {
      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
      list = list.filter((s) => new Date(s.created_at) >= cutoff);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => {
        const title = meetingMap.get(s.meeting_id) || "";
        const transcript = typeof s.transcript === "string" ? s.transcript : "";
        return title.toLowerCase().includes(q) || transcript.toLowerCase().includes(q);
      });
    }
    return list;
  }, [sessions, retentionDays, search, meetingMap]);

  // Expiring soon (within 2 days of retention limit)
  const expiringSoon = useMemo(() => {
    if (!retentionDays) return [];
    const warningCutoff = new Date(Date.now() - (retentionDays - 2) * 24 * 60 * 60 * 1000);
    const retentionCutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    return sessions.filter((s) => {
      const d = new Date(s.created_at);
      return d >= retentionCutoff && d <= warningCutoff;
    });
  }, [sessions, retentionDays]);

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
  };

  // Enterprise security features checklist
  const securityFeatures = [
    { label: "SSO / SAML Authentication", enabled: features.ssoSaml },
    { label: "SCIM User Provisioning", enabled: features.scimProvisioning },
    { label: "Advanced Security Controls", enabled: features.advancedSecurityControls },
    { label: "Zero Data Retention with LLM", enabled: features.zeroDataRetention },
    { label: "Private AI Deployment", enabled: features.privateAiDeployment },
    { label: "Audit Log", enabled: features.auditLog },
    { label: "SLA Guarantee", enabled: features.slaGuarantee },
  ];

  // Determine page title and header based on tier
  const pageTitle = tier === "enterprise" ? "Audit Events" : tier === "business" ? "Team Workspaces" : "Transcript History";
  const pageIcon = tier === "enterprise" ? ShieldCheck : tier === "business" ? Users : Clock;
  const PageIcon = pageIcon;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/dashboard" className="text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold">{pageTitle}</h1>
      </div>

      {/* Tier-specific header card */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={0} className="rounded-xl p-6" style={cardStyle}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
            tier === "enterprise" ? "bg-sky-500/15" : tier === "business" ? "bg-indigo-500/15" : "bg-blue-500/15"
          }`}>
            <PageIcon className={`h-6 w-6 ${
              tier === "enterprise" ? "text-sky-500" : tier === "business" ? "text-indigo-500" : "text-blue-500"
            }`} />
          </div>
          <div>
            {tier === "enterprise" ? (
              <>
                <h2 className="text-lg font-semibold">Audit & Compliance</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Enterprise audit logging is active. All transcript access and modifications are tracked for compliance.
                </p>
              </>
            ) : tier === "business" ? (
              <>
                <h2 className="text-lg font-semibold">Team Workspaces</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Collaborative workspace features are enabled. Share transcripts and meeting knowledge across your team.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">
                  {retentionDays ? `${retentionDays}-Day Retention Window` : "Unlimited Retention"}
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {retentionDays
                    ? `Your transcripts are retained for ${retentionDays} days. Upgrade for longer retention.`
                    : "All your transcripts are stored indefinitely."}
                </p>
                {retentionDays !== null && (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>{filteredSessions.length} transcripts available</span>
                      <span>{retentionDays}-day window</span>
                    </div>
                    <Progress value={filteredSessions.length > 0 ? Math.min(100, (filteredSessions.length / Math.max(1, sessions.length)) * 100) : 0} className="h-1.5" />
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Enterprise: Security Feature Checklist */}
      {tier === "enterprise" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">Security Features</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {securityFeatures.map((f) => (
              <div key={f.label} className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/30">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${f.enabled ? "bg-emerald-500/20" : "bg-muted"}`}>
                  <Check className={`h-3.5 w-3.5 ${f.enabled ? "text-emerald-500" : "text-muted-foreground"}`} />
                </div>
                <span className="text-sm">{f.label}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Business: Team Activity Summary */}
      {tier === "business" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Meetings</p>
              <p className="text-3xl font-bold">{meetings.length}</p>
            </div>
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">With Transcripts</p>
              <p className="text-3xl font-bold">{sessions.length}</p>
            </div>
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">Coverage</p>
              <p className="text-3xl font-bold">
                {meetings.length > 0 ? Math.round((new Set(sessions.map(s => s.meeting_id)).size / meetings.length) * 100) : 0}%
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Expiring Soon Warning (free/plus) */}
      {retentionDays !== null && expiringSoon.length > 0 && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="rounded-xl p-4 border border-amber-500/30 bg-amber-500/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
                {expiringSoon.length} transcript{expiringSoon.length !== 1 ? "s" : ""} expiring within 2 days
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">Upgrade your plan for longer retention.</p>
            </div>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link to="/dashboard/pricing"><Crown className="h-3.5 w-3.5 mr-1" /> Upgrade</Link>
            </Button>
          </div>
        </motion.div>
      )}

      {/* Search (Plus+) */}
      <PremiumGate tier={tier} minimumTier="plus" featureName="Transcript Search">
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search transcripts by meeting name or content..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
        </motion.div>
      </PremiumGate>

      {/* Transcript Timeline */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={4} className="rounded-xl overflow-hidden" style={cardStyle}>
        <div className="p-5 pb-3">
          <h2 className="text-sm font-semibold">Transcripts ({filteredSessions.length})</h2>
        </div>
        {sessionsQuery.isLoading ? (
          <div className="p-6 text-center text-muted-foreground text-sm">Loading transcripts...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground text-sm">
            {search ? "No transcripts match your search." : "No transcripts found. Upload a recording to generate one."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filteredSessions.map((s) => {
              const transcript = typeof s.transcript === "string" ? s.transcript : "";
              const preview = transcript.slice(0, 120) + (transcript.length > 120 ? "..." : "");
              return (
                <Link
                  key={s.id}
                  to={`/dashboard/meetings/${s.meeting_id}`}
                  className="flex items-start gap-3 p-4 hover:bg-accent/30 transition-colors"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {meetingMap.get(s.meeting_id) || "Untitled Meeting"}
                    </p>
                    {preview && (
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{preview}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(s.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
