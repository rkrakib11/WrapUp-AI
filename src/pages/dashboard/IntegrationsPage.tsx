import { useMemo, CSSProperties } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, CalendarSync, Lock, Check, Crown, LibraryBig, ShieldCheck,
  MessageSquare, Video, Calendar, Users, BarChart3, Code2, FileText, Headphones,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useMeetings } from "@/hooks/useMeetings";
import { useSubscription } from "@/hooks/useSubscription";
import { useAuth } from "@/hooks/useAuth";
import { usePalette } from "@/components/providers/PaletteProvider";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { isTierAtLeast, type SubscriptionTier } from "@/lib/subscription";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.08, duration: 0.4 } }),
};

interface Integration {
  name: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  minimumTier: SubscriptionTier;
}

const integrations: Integration[] = [
  { name: "Slack", description: "Send meeting summaries and action items to Slack channels", icon: MessageSquare, iconBg: "bg-[#4A154B]/15", iconColor: "text-[#4A154B] dark:text-[#E01E5A]", minimumTier: "plus" },
  { name: "Zoom", description: "Automatically import recordings from Zoom meetings", icon: Video, iconBg: "bg-blue-500/15", iconColor: "text-blue-500", minimumTier: "plus" },
  { name: "Google Calendar", description: "Sync meetings with your Google Calendar for seamless scheduling", icon: Calendar, iconBg: "bg-emerald-500/15", iconColor: "text-emerald-500", minimumTier: "business" },
  { name: "Microsoft Teams", description: "Connect Teams meetings for automatic transcription", icon: Users, iconBg: "bg-indigo-500/15", iconColor: "text-indigo-500", minimumTier: "business" },
  { name: "Notion", description: "Export meeting notes and summaries directly to Notion pages", icon: FileText, iconBg: "bg-gray-500/15", iconColor: "text-foreground", minimumTier: "business" },
  { name: "Salesforce", description: "Log meeting insights and action items to Salesforce CRM", icon: BarChart3, iconBg: "bg-sky-500/15", iconColor: "text-sky-500", minimumTier: "business" },
  { name: "Linear", description: "Create issues from action items directly in Linear", icon: BarChart3, iconBg: "bg-violet-500/15", iconColor: "text-violet-500", minimumTier: "business" },
  { name: "Custom API", description: "Build custom workflows with the WrapUp REST API", icon: Code2, iconBg: "bg-amber-500/15", iconColor: "text-amber-500", minimumTier: "enterprise" },
];

export default function IntegrationsPage() {
  const { user } = useAuth();
  const { meetingsQuery } = useMeetings();
  const { tier, features } = useSubscription();
  const { colors } = usePalette();
  const meetings = meetingsQuery.data ?? [];

  // Sessions data for shared libraries stats (business tier)
  const sessionsQuery = useQuery({
    queryKey: ["integration-sessions-stats", user?.id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .not("transcript", "is", null);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user && tier === "business",
  });

  const transcriptCount = sessionsQuery.data ?? 0;

  const cardStyle: CSSProperties = {
    backgroundColor: colors.cardBg,
    border: `1px solid ${colors.cardBorder}33`,
  };

  // Determine page mode
  const pageTitle = tier === "enterprise" ? "SSO / SAML" : tier === "business" ? "Shared Libraries" : "Integrations";
  const PageIcon = tier === "enterprise" ? ShieldCheck : tier === "business" ? LibraryBig : CalendarSync;

  const integrationLevel = features.customIntegrationsApi
    ? "Enterprise"
    : features.premiumIntegrations
    ? "Premium"
    : features.basicIntegrations
    ? "Basic"
    : "None";

  // Enterprise security features
  const enterpriseFeatures = [
    { label: "SSO / SAML Authentication", enabled: features.ssoSaml },
    { label: "SCIM User Provisioning", enabled: features.scimProvisioning },
    { label: "Advanced Security Controls", enabled: features.advancedSecurityControls },
    { label: "Zero Data Retention with LLM", enabled: features.zeroDataRetention },
    { label: "Private AI Deployment", enabled: features.privateAiDeployment },
    { label: "Dedicated Success Manager", enabled: features.dedicatedSuccessManager },
    { label: "SLA Guarantee", enabled: features.slaGuarantee },
  ];

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
            tier === "enterprise" ? "bg-sky-500/15" : tier === "business" ? "bg-rose-500/15" : "bg-cyan-500/15"
          }`}>
            <PageIcon className={`h-6 w-6 ${
              tier === "enterprise" ? "text-sky-500" : tier === "business" ? "text-rose-500" : "text-cyan-500"
            }`} />
          </div>
          <div>
            {tier === "enterprise" ? (
              <>
                <h2 className="text-lg font-semibold">Identity Federation</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  SSO/SAML authentication is enabled for your organization. Manage user access with enterprise-grade identity controls.
                </p>
              </>
            ) : tier === "business" ? (
              <>
                <h2 className="text-lg font-semibold">Shared Meeting Libraries</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Build a team knowledge base from meeting transcripts, summaries, and action items. Share insights across your organization.
                </p>
              </>
            ) : (
              <>
                <h2 className="text-lg font-semibold">Integration Level: {integrationLevel}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {features.basicIntegrations
                    ? "Connect your favorite tools to supercharge your meeting workflow."
                    : "Upgrade to Plus to connect Slack, Zoom, and more with your meetings."}
                </p>
              </>
            )}
          </div>
        </div>
      </motion.div>

      {/* Enterprise: Security & Identity Features */}
      {tier === "enterprise" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1} className="rounded-xl p-5" style={cardStyle}>
          <h2 className="text-sm font-semibold mb-4">Enterprise Security & Support</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            {enterpriseFeatures.map((f) => (
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

      {/* Business: Library Stats */}
      {tier === "business" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={1}>
          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">Total Meetings</p>
              <p className="text-3xl font-bold">{meetings.length}</p>
              <p className="text-xs text-muted-foreground mt-1">In your library</p>
            </div>
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">Transcribed</p>
              <p className="text-3xl font-bold">{transcriptCount}</p>
              <p className="text-xs text-muted-foreground mt-1">Searchable transcripts</p>
            </div>
            <div className="rounded-xl p-5" style={cardStyle}>
              <p className="text-xs text-muted-foreground font-medium mb-1">Export</p>
              <div className="flex items-center gap-2 mt-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${features.pdfTextExport ? "bg-emerald-500/20" : "bg-muted"}`}>
                  <Check className={`h-3.5 w-3.5 ${features.pdfTextExport ? "text-emerald-500" : "text-muted-foreground"}`} />
                </div>
                <span className="text-sm">PDF & Text Export</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Integrations Grid */}
      <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={2} className="rounded-xl p-5" style={cardStyle}>
        <h2 className="text-sm font-semibold mb-4">Available Integrations</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {integrations.map((integration) => {
            const available = isTierAtLeast(tier, integration.minimumTier);
            return (
              <div
                key={integration.name}
                className={`flex items-start gap-3 p-4 rounded-xl border transition-colors ${
                  available ? "border-border bg-muted/20 hover:bg-muted/40" : "border-border/50 opacity-60"
                }`}
              >
                <div className={`w-10 h-10 rounded-lg ${integration.iconBg} flex items-center justify-center shrink-0`}>
                  <integration.icon className={`h-5 w-5 ${integration.iconColor}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{integration.name}</p>
                    {available ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Available
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border flex items-center gap-1">
                        <Lock className="h-2.5 w-2.5" />
                        {integration.minimumTier[0].toUpperCase() + integration.minimumTier.slice(1)}+
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{integration.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Upgrade CTA (free users) */}
      {tier === "free" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="rounded-xl p-6 border border-primary/20 bg-primary/5">
          <div className="flex items-start gap-3">
            <CalendarSync className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold mb-1">Connect Your Tools</h3>
              <p className="text-sm text-muted-foreground">
                Upgrade to Plus to connect Slack and Zoom. Upgrade to Business for Google Calendar, Microsoft Teams, Notion, and more.
              </p>
              <Button asChild size="sm" className="mt-3 gradient-bg text-primary-foreground">
                <Link to="/dashboard/pricing"><Crown className="h-3.5 w-3.5 mr-1" /> View Plans</Link>
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Enterprise: SLA Card */}
      {tier === "enterprise" && (
        <motion.div initial="hidden" animate="visible" variants={fadeUp} custom={3} className="rounded-xl p-5" style={cardStyle}>
          <div className="flex items-start gap-3">
            <Headphones className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold mb-1">Dedicated Support</h3>
              <p className="text-sm text-muted-foreground">
                Your enterprise plan includes a dedicated success manager and SLA guarantee. Contact your success manager for priority assistance with integrations setup.
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
