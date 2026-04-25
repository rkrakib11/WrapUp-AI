import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Info, Mic, Upload, X, Loader2, Check, CloudUpload, CheckCircle2, XCircle, AlertTriangle, Zap, Crown, Rocket } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMeetings } from "@/hooks/useMeetings";
import { useSubscription } from "@/hooks/useSubscription";
import { startSessionProcessing } from "@/lib/session-processing";
import { isLiveStreamingConfigured } from "@/lib/backend-url";
import { LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { SubscriptionTier } from "@/lib/subscription";

// ─── plan limits ─────────────────────────────────────────────────────────────

interface PlanLimits {
  sessionsPerDay: number | null;
  maxFileSizeMB: number | null;
  maxDurationMin: number | null;
  label: string;
  color: string;
  icon: React.ReactNode;
}

const PLAN_LIMITS: Record<SubscriptionTier, PlanLimits> = {
  free:       { sessionsPerDay: 3,   maxFileSizeMB: 100,  maxDurationMin: 30,  label: "Free",       color: "#10B981", icon: null },
  plus:       { sessionsPerDay: 20,  maxFileSizeMB: 500,  maxDurationMin: 120, label: "Plus",       color: "#6C3FE6", icon: null },
  business:   { sessionsPerDay: 50,  maxFileSizeMB: 2000, maxDurationMin: 480, label: "Business",   color: "#F59E0B", icon: null },
  enterprise: { sessionsPerDay: null, maxFileSizeMB: null, maxDurationMin: null, label: "Enterprise", color: "#EC4899", icon: null },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const ACCEPTED_MEDIA_MIME = "audio/*,video/*";
const COMMON_MEDIA_EXTENSIONS = new Set([
  "mp3","wav","mp4","webm","m4a","aac","flac","ogg","oga","opus",
  "wma","mov","avi","mkv","m4v","3gp","3g2","amr","aiff","au","ts",
]);

function isAudioOrVideoFile(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return Boolean(ext && COMMON_MEDIA_EXTENSIONS.has(ext));
}

function defaultMeetingName(): string {
  const now = new Date();
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  return `Meeting — ${date} at ${time}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = String((error as { message: unknown }).message ?? "");
    if (msg.toLowerCase().includes("failed to fetch"))
      return "File may be uploaded, but backend is unreachable. Start backend on port 8002 and try again.";
    if (msg.toLowerCase().includes("maximum allowed size"))
      return "Upload rejected by storage size limit.";
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function getTimeUntilMidnight(): string {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  const diffMs = midnight.getTime() - now.getTime();
  const h = Math.floor(diffMs / (1000 * 60 * 60));
  const m = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}m`;
}

function getAudioDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    audio.src = url;
    audio.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(audio.duration); };
    audio.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

// ─── real mic waveform (canvas + Web Audio API) ───────────────────────────────

function RealMicWaveform({ stream }: { stream: MediaStream | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!stream || !canvas) return;

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    const BAR_COUNT = 16;
    const canvasCtx = canvas.getContext("2d")!;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      analyser.getByteFrequencyData(dataArray);
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

      const totalWidth = canvas.width;
      const barWidth = Math.floor((totalWidth / BAR_COUNT) * 0.55);
      const gap = Math.floor((totalWidth / BAR_COUNT) * 0.45);

      for (let i = 0; i < BAR_COUNT; i++) {
        const idx = Math.floor((i / BAR_COUNT) * bufferLength * 0.6);
        const value = dataArray[idx] / 255;
        const barHeight = Math.max(3, value * canvas.height);
        const x = i * (barWidth + gap);
        const y = (canvas.height - barHeight) / 2;
        const alpha = 0.45 + value * 0.55;
        canvasCtx.fillStyle = `rgba(16,185,129,${alpha.toFixed(2)})`;
        canvasCtx.beginPath();
        if (canvasCtx.roundRect) {
          canvasCtx.roundRect(x, y, barWidth, barHeight, 2);
        } else {
          canvasCtx.rect(x, y, barWidth, barHeight);
        }
        canvasCtx.fill();
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
      source.disconnect();
      void audioCtx.close();
    };
  }, [stream]);

  if (!stream) {
    return (
      <div className="flex items-center justify-center gap-[3px] h-6 w-[120px]" aria-hidden>
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className="w-[3px] h-[3px] rounded-full bg-white/20" />
        ))}
      </div>
    );
  }

  return <canvas ref={canvasRef} width={120} height={24} className="w-[120px] h-6" aria-hidden />;
}

// ─── language warning modal ───────────────────────────────────────────────────

function LangWarningModal({ onConfirm }: { onConfirm: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/50">
      <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-400/60 bg-[#141828] shadow-2xl shadow-amber-900/30 p-6 flex flex-col gap-4">
        <div className="flex gap-3 items-start">
          <Info className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-sm font-semibold text-amber-300 mb-1">Language matters for accuracy</p>
            <p className="text-sm text-amber-400/80 leading-relaxed">
              Select the exact language spoken in your recording. A wrong selection can make transcript, summary, and action items inaccurate.
            </p>
          </div>
        </div>
        <button
          className="self-end text-sm font-semibold px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
          onClick={onConfirm}
        >
          OK, got it
        </button>
      </div>
    </div>
  );
}

// ─── per-tier usage banner ────────────────────────────────────────────────────

function UsageBanner({
  tier,
  sessionsToday,
  resetsIn,
}: {
  tier: SubscriptionTier;
  sessionsToday: number;
  resetsIn: string;
}) {
  const navigate = useNavigate();
  const limits = PLAN_LIMITS[tier];
  const sessionLimit = limits.sessionsPerDay;
  const isUnlimited = sessionLimit === null;
  const isAtLimit = !isUnlimited && sessionsToday >= sessionLimit!;

  // Enterprise — always unlimited
  if (tier === "enterprise") {
    return (
      <div className="rounded-xl border border-[#EC4899]/20 bg-[#141828] px-5 py-4 flex items-center gap-3">
        <Crown className="h-5 w-5 text-[#EC4899] shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Enterprise Plan — Unlimited Recording</p>
          <p className="text-xs text-muted-foreground mt-0.5">No daily limits. Unlimited file size and duration.</p>
        </div>
      </div>
    );
  }

  // Business — high limits
  if (tier === "business") {
    if (isAtLimit) {
      return (
        <div className="rounded-xl border border-[#F59E0B]/40 bg-[#141828] px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-[#F59E0B] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">Daily Limit Reached</p>
              <p className="text-xs text-muted-foreground mt-1">
                You've used all {sessionLimit} Business sessions today. Resets in <span className="text-white font-medium">{resetsIn}</span>.
              </p>
              <Button size="sm" className="mt-3 bg-[#EC4899] hover:bg-[#EC4899]/90 text-white text-xs" onClick={() => navigate("/dashboard/pricing")}>
                <Crown className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Enterprise
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-[#F59E0B]/20 bg-[#141828] px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Rocket className="h-4 w-4 text-[#F59E0B]" />
          <p className="text-xs font-semibold text-[#F59E0B] uppercase tracking-wider">Business Plan</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
          <span>Max file: <span className="text-white">2 GB</span></span>
          <span>Max duration: <span className="text-white">8 hours</span></span>
          <span>Sessions today: <span className="text-white">{sessionsToday}/{sessionLimit}</span></span>
          <span>Resets in: <span className="text-white">{resetsIn}</span></span>
        </div>
      </div>
    );
  }

  // Plus — medium limits
  if (tier === "plus") {
    if (isAtLimit) {
      return (
        <div className="rounded-xl border border-destructive/40 bg-[#141828] px-5 py-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-white">⚠️ Daily Limit Reached</p>
              <p className="text-xs text-muted-foreground mt-1">
                You've used all {sessionLimit} Plus sessions today. Resets in <span className="text-white font-medium">{resetsIn}</span>.
              </p>
              <Button size="sm" className="mt-3 bg-[#F59E0B] hover:bg-[#F59E0B]/90 text-black text-xs font-semibold" onClick={() => navigate("/dashboard/pricing")}>
                <Rocket className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Business
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="rounded-xl border border-[#6C3FE6]/20 bg-[#141828] px-5 py-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[#6C3FE6]" />
          <p className="text-xs font-semibold text-[#6C3FE6] uppercase tracking-wider">Plus Plan</p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground">
          <span>Max file: <span className="text-white">500 MB</span></span>
          <span>Max duration: <span className="text-white">2 hours</span></span>
          <span>Sessions today: <span className="text-white">{sessionsToday}/{sessionLimit}</span></span>
          <span>Resets in: <span className="text-white">{resetsIn}</span></span>
        </div>
      </div>
    );
  }

  // Free — strict limits
  if (isAtLimit) {
    return (
      <div className="rounded-xl border border-destructive/40 bg-[#141828] px-5 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white">⚠️ Daily Limit Reached</p>
            <p className="text-xs text-muted-foreground mt-1">
              You've used all {sessionLimit} free sessions today. Resets in{" "}
              <span className="text-white font-medium">{resetsIn}</span>.
            </p>
            <Button size="sm" className="mt-3 bg-[#6C3FE6] hover:bg-[#6C3FE6]/90 text-white text-xs" onClick={() => navigate("/dashboard/pricing")}>
              <Zap className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Plus
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-white/[0.06] bg-[#141828] px-5 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="h-2 w-2 rounded-full bg-[#10B981] shadow-[0_0_6px_2px_rgba(16,185,129,0.5)]" />
        <p className="text-xs font-semibold text-[#10B981] uppercase tracking-wider">Free Plan</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-muted-foreground mb-3">
        <span>📁 Upload Meeting Recording</span>
        <span>Max file: <span className="text-white">100 MB</span></span>
        <span>Max duration: <span className="text-white">30 minutes</span></span>
        <span>Sessions today: <span className="text-white">{sessionsToday}/{sessionLimit} used</span></span>
        <span>Resets in: <span className="text-white">{resetsIn}</span></span>
      </div>
      <Button size="sm" variant="outline" className="border-[#6C3FE6]/50 text-[#6C3FE6] hover:bg-[#6C3FE6]/10 text-xs" onClick={() => navigate("/dashboard/pricing")}>
        <Zap className="mr-1.5 h-3.5 w-3.5" /> Upgrade to Plus →
      </Button>
    </div>
  );
}

// ─── main page ───────────────────────────────────────────────────────────────

export default function NewMeetingPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tier } = useSubscription();
  const { meetingsQuery, createMeeting } = useMeetings();
  const meetings = meetingsQuery.data ?? [];

  // live "resets in" countdown (updates every 60s)
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);
  const resetsIn = useMemo(() => getTimeUntilMidnight(), [tick]); // eslint-disable-line react-hooks/exhaustive-deps

  // today's session count from Supabase
  const { data: sessionsToday = 0 } = useQuery({
    queryKey: ["sessions-today", user?.id],
    queryFn: async () => {
      if (!user?.id) return 0;
      const now = new Date();
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const { count, error } = await supabase
        .from("sessions")
        .select("id, meetings!inner(user_id)", { count: "exact", head: true })
        .eq("meetings.user_id", user.id)
        .gte("created_at", startOfToday.toISOString());
      if (error) return 0;
      return count ?? 0;
    },
    enabled: !!user,
    refetchInterval: 60_000,
  });

  const limits = PLAN_LIMITS[tier];
  const isAtDailyLimit = limits.sessionsPerDay !== null && sessionsToday >= limits.sessionsPerDay;

  // ── Record section ────────────────────────────────────────────────────────
  const [recordExpanded, setRecordExpanded] = useState(false);
  const [recordMeetingName, setRecordMeetingName] = useState("");
  const [recordLanguage, setRecordLanguage] = useState("");
  const [micStatus, setMicStatus] = useState<"idle" | "ok" | "denied">("idle");
  const [showRecordLangModal, setShowRecordLangModal] = useState(false);
  const [recordLangAck, setRecordLangAck] = useState(false);
  const [recordLangOpen, setRecordLangOpen] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    if (!recordExpanded) {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
      setMicStream(null);
      setMicStatus("idle");
      return;
    }
    if (!recordMeetingName) setRecordMeetingName(defaultMeetingName());
    setMicStatus("idle");
    navigator.mediaDevices
      ?.getUserMedia({ audio: true, video: false })
      .then((stream) => {
        micStreamRef.current = stream;
        setMicStream(stream);
        setMicStatus("ok");
      })
      .catch(() => {
        setMicStatus("denied");
      });
  }, [recordExpanded]); // eslint-disable-line react-hooks/exhaustive-deps

  // cleanup on unmount
  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleBeginRecording = () => {
    // Production Vercel without a Cloudflare-Tunnel hostname can't open a
    // WebSocket to Oracle (mixed-content + no TLS terminator). Detect that
    // up front and steer the user to the upload flow instead of letting
    // them navigate, fail mid-flight, and bounce back with an error toast.
    if (!isLiveStreamingConfigured()) {
      toast.error(
        "Live recording isn't available on production yet. Please upload a file below, or use the desktop app for live recording.",
      );
      return;
    }
    micStreamRef.current?.getTracks().forEach((t) => t.stop());
    micStreamRef.current = null;
    setMicStream(null);
    navigate("/dashboard/instant", {
      state: { meetingName: recordMeetingName, language: recordLanguage, autoStart: true },
    });
  };

  // ── Import card ───────────────────────────────────────────────────────────
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMeetingName, setImportMeetingName] = useState("");
  const [importLanguage, setImportLanguage] = useState("");
  const [importMeetingId, setImportMeetingId] = useState("");
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const [showImportLangModal, setShowImportLangModal] = useState(false);
  const [importLangAck, setImportLangAck] = useState(false);
  const [importLangOpen, setImportLangOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback((f: File) => {
    if (!isAudioOrVideoFile(f)) { toast.error("Please select an audio or video file."); return; }
    // frontend file size check
    const maxMB = limits.maxFileSizeMB;
    if (maxMB !== null && f.size > maxMB * 1024 * 1024) {
      toast.error(`File too large. Your ${tier} plan allows up to ${maxMB} MB per upload.`);
      return;
    }
    setImportFile(f);
    setImportMeetingName(defaultMeetingName());
    setUploaded(false);
  }, [limits.maxFileSizeMB, tier]);

  const handleUpload = async () => {
    if (!importFile || !user || !importLanguage) return;
    if (isAtDailyLimit) {
      toast.error("Daily session limit reached. Please upgrade or wait for reset.");
      return;
    }

    // frontend duration check
    const maxMin = limits.maxDurationMin;
    if (maxMin !== null) {
      const duration = await getAudioDuration(importFile);
      if (duration !== null && duration > maxMin * 60) {
        toast.error(`Recording too long. Your ${tier} plan allows up to ${maxMin} minutes. This file is ${Math.ceil(duration / 60)} minutes.`);
        return;
      }
    }

    setUploading(true);
    try {
      let targetMeetingId = importMeetingId;
      if (!targetMeetingId || targetMeetingId === "new") {
        const meeting = await createMeeting.mutateAsync({
          title: importMeetingName.trim() || importFile.name.replace(/\.[^.]+$/, ""),
          source: "uploaded",
        });
        targetMeetingId = meeting.id;
      }

      const filePath = `${user.id}/${targetMeetingId}/${Date.now()}-${importFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("meeting-files")
        .upload(filePath, importFile);
      if (uploadError) throw uploadError;

      const audioStorageRef = `meeting-files/${filePath}`;
      const { data: createdSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({ meeting_id: targetMeetingId, audio_file_url: audioStorageRef, language_detected: importLanguage })
        .select("id")
        .single();
      if (sessionError) throw sessionError;

      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Authentication session missing. Please log in again.");

      try {
        await startSessionProcessing(createdSession.id, accessToken);
      } catch {
        setUploaded(true);
        toast.warning("File uploaded, but processing could not start. Backend may be offline.");
        setTimeout(() => navigate(`/dashboard/meetings/${targetMeetingId}`), 2000);
        return;
      }

      setUploaded(true);
      toast.success("File uploaded and processing started.");
      setTimeout(() => navigate(`/dashboard/meetings/${targetMeetingId}`), 1500);
    } catch (err) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  // ─── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* language warning modals */}
      {showRecordLangModal && (
        <LangWarningModal
          onConfirm={() => {
            setShowRecordLangModal(false);
            setRecordLangAck(true);
            setRecordLangOpen(true);
          }}
        />
      )}
      {showImportLangModal && (
        <LangWarningModal
          onConfirm={() => {
            setShowImportLangModal(false);
            setImportLangAck(true);
            setImportLangOpen(true);
          }}
        />
      )}

      {/* page header */}
      <div>
        <h1 className="text-2xl font-bold">New Meeting</h1>
        <p className="text-sm text-muted-foreground mt-1">Start recording now or import an existing file</p>
      </div>

      {/* ── Per-tier Usage Banner ── */}
      <UsageBanner tier={tier} sessionsToday={sessionsToday} resetsIn={resetsIn} />

      {/* ── Cards grid ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

        {/* ── RECORD SECTION ── */}
        <div className="relative group/record">
          {/* hover glow layer */}
          <div className="absolute -inset-[3px] rounded-[14px] bg-[#10B981]/[0.12] opacity-0 group-hover/record:opacity-100 blur-xl transition-opacity duration-300 pointer-events-none" />
          <div
            className={cn(
              "relative rounded-xl border bg-[#141828] transition-all duration-300",
              recordExpanded
                ? "border-[#10B981]/60"
                : "border-[#10B981]/20 hover:border-[#10B981]/50 hover:shadow-[0_0_32px_4px_rgba(16,185,129,0.10)]",
            )}
          >
            {/* collapsed: pulsing mic */}
            {!recordExpanded && (
              <div className="flex flex-col items-center gap-4 py-10 px-6">
                <button
                  onClick={() => setRecordExpanded(true)}
                  aria-label="Set up recording"
                  className="relative h-24 w-24 flex items-center justify-center group focus:outline-none"
                >
                  <span className="absolute inset-0 rounded-full border-2 border-[#10B981]/70 animate-pulse-ring" aria-hidden />
                  <span className="absolute inset-0 rounded-full border-2 border-[#10B981]/50 animate-pulse-ring" style={{ animationDelay: "750ms" }} aria-hidden />
                  <div className="h-16 w-16 rounded-full bg-[#10B981] flex items-center justify-center group-hover:scale-105 transition-transform shadow-[0_0_28px_8px_rgba(16,185,129,0.25)]">
                    <Mic className="h-8 w-8 text-white" aria-hidden />
                  </div>
                </button>
                <div className="text-center space-y-1">
                  <p className="text-base font-semibold text-foreground">Record Meeting</p>
                  <p className="text-xs text-muted-foreground">Click the mic to set up recording</p>
                </div>
              </div>
            )}

            {/* expanded: mini-header */}
            {recordExpanded && (
              <div className="flex flex-col items-center gap-1.5 pt-7 pb-2">
                <div className="h-12 w-12 rounded-full bg-[#10B981] flex items-center justify-center shadow-[0_0_20px_4px_rgba(16,185,129,0.3)]">
                  <Mic className="h-6 w-6 text-white" aria-hidden />
                </div>
                <p className="text-sm font-semibold text-foreground">Record Meeting</p>
              </div>
            )}

            {/* expanded fields */}
            <div className={cn("overflow-hidden transition-all duration-300", recordExpanded ? "max-h-[700px] opacity-100" : "max-h-0 opacity-0")}>
              <div className="px-6 pb-6 space-y-4 border-t border-white/[0.06] pt-4 mt-2">
                {/* meeting name */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Meeting Name</Label>
                  <Input
                    value={recordMeetingName}
                    onChange={(e) => setRecordMeetingName(e.target.value)}
                    placeholder="Enter meeting name…"
                    className="bg-[#0d1117] border-white/[0.08] focus:border-[#10B981]/50"
                  />
                </div>

                {/* language */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Audio Language <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={recordLanguage}
                    onValueChange={(v) => { setRecordLanguage(v); setRecordLangOpen(false); }}
                    open={recordLangOpen}
                    onOpenChange={(open) => {
                      if (open && !recordLangAck) {
                        setShowRecordLangModal(true);
                      } else {
                        setRecordLangOpen(open);
                      }
                    }}
                  >
                    <SelectTrigger className="border-2 border-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.35)] hover:border-amber-400 hover:bg-amber-500/10 focus:shadow-[0_0_12px_3px_rgba(245,158,11,0.5)] bg-[#0d1117]">
                      <SelectValue placeholder="Select language to continue" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code} className="focus:bg-amber-500/15 focus:text-amber-800 dark:focus:text-amber-300">
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* real mic waveform */}
                <div className="flex flex-col items-center gap-2 py-2">
                  <RealMicWaveform stream={micStream} />
                  <div className="flex items-center gap-1.5 text-xs">
                    {micStatus === "idle" && <span className="text-muted-foreground">Checking microphone…</span>}
                    {micStatus === "ok" && (
                      <>
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#10B981]" aria-hidden />
                        <span className="text-[#10B981]">Microphone active</span>
                      </>
                    )}
                    {micStatus === "denied" && (
                      <>
                        <XCircle className="h-3.5 w-3.5 text-destructive" aria-hidden />
                        <span className="text-destructive">Microphone not found — check browser permissions</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground" onClick={() => setRecordExpanded(false)}>
                    Cancel
                  </Button>
                  <Button
                    className="flex-1 bg-[#10B981] hover:bg-[#10B981]/90 text-white font-semibold"
                    disabled={!recordLanguage || micStatus === "denied" || isAtDailyLimit}
                    onClick={handleBeginRecording}
                  >
                    <Mic className="mr-2 h-4 w-4" aria-hidden /> Start Recording
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── IMPORT CARD ── */}
        <div className="relative group/import">
          {/* hover glow layer — warm cyan-to-sky luxury */}
          <div className="absolute -inset-[3px] rounded-[14px] opacity-0 group-hover/import:opacity-100 blur-xl transition-opacity duration-300 pointer-events-none"
            style={{ background: "radial-gradient(ellipse at center, rgba(14,165,233,0.18) 0%, rgba(6,182,212,0.10) 60%, transparent 100%)" }}
          />
          <div
            className={cn(
              "relative rounded-xl border bg-[#141828] transition-all duration-300",
              isDragOver
                ? "border-[#0EA5E9] shadow-[0_0_24px_4px_rgba(14,165,233,0.30)]"
                : importFile
                ? "border-[#0EA5E9]/60"
                : "border-[#06B6D4]/25 hover:border-[#0EA5E9]/55 hover:shadow-[0_0_32px_4px_rgba(14,165,233,0.12)]",
            )}
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragOver(false); }}
            onDrop={(e) => {
              e.preventDefault(); setIsDragOver(false);
              const f = e.dataTransfer.files[0];
              if (f) handleFile(f);
            }}
          >
            {isDragOver && (
              <div className="absolute inset-0 z-10 rounded-xl flex items-center justify-center pointer-events-none"
                style={{ background: "rgba(14,165,233,0.08)" }}
              >
                <p className="font-semibold text-sm" style={{ color: "#0EA5E9" }}>Drop your file here</p>
              </div>
            )}

            <div className="flex flex-col items-center gap-4 p-8 pb-6">
              {/* icon with luxury cyan-sky gradient ring */}
              <div className="relative h-16 w-16">
                <div className="absolute inset-0 rounded-2xl blur-md opacity-60"
                  style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.5) 0%, rgba(14,165,233,0.5) 50%, rgba(56,189,248,0.5) 100%)" }}
                />
                <div className="relative h-16 w-16 rounded-2xl flex items-center justify-center"
                  style={{ background: "linear-gradient(135deg, rgba(6,182,212,0.20) 0%, rgba(14,165,233,0.18) 50%, rgba(56,189,248,0.14) 100%)", border: "1px solid rgba(14,165,233,0.25)" }}
                >
                  <CloudUpload className="h-8 w-8" style={{ color: "#38BDF8" }} aria-hidden />
                </div>
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-lg font-semibold">Import Recording</h2>
                <p className="text-sm text-muted-foreground">Upload any audio or video file from your device</p>
              </div>
              {!importFile && (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={ACCEPTED_MEDIA_MIME}
                    className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
                  />
                  <Button
                    variant="outline"
                    className="w-full font-semibold transition-all duration-200"
                    style={{ borderColor: "rgba(14,165,233,0.50)", color: "#38BDF8", background: "transparent" }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(14,165,233,0.10)"; e.currentTarget.style.borderColor = "rgba(14,165,233,0.80)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "rgba(14,165,233,0.50)"; }}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="mr-2 h-4 w-4" aria-hidden /> Browse File
                  </Button>
                </>
              )}
            </div>

            <div className={cn("overflow-hidden transition-all duration-300", importFile ? "max-h-[800px] opacity-100" : "max-h-0 opacity-0")}>
              <div className="px-6 pb-6 space-y-4 border-t border-white/[0.06] pt-4">
                {importFile && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1117]"
                    style={{ border: "1px solid rgba(14,165,233,0.35)" }}
                  >
                    <Upload className="h-3.5 w-3.5 shrink-0" style={{ color: "#38BDF8" }} aria-hidden />
                    <span className="flex-1 min-w-0 text-xs truncate">{importFile.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">{formatBytes(importFile.size)}</span>
                    <button
                      className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
                      onClick={() => { setImportFile(null); setUploaded(false); }}
                      aria-label="Remove file"
                    >
                      <X className="h-3.5 w-3.5" aria-hidden />
                    </button>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Meeting Name</Label>
                  <Input
                    value={importMeetingName}
                    onChange={(e) => setImportMeetingName(e.target.value)}
                    placeholder="Enter meeting name…"
                    className="bg-[#0d1117] border-white/[0.08] focus:border-[#0EA5E9]/50"
                  />
                </div>

                {/* language with modal-first flow */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">
                    Audio Language <span className="text-destructive">*</span>
                  </Label>
                  <Select
                    value={importLanguage}
                    onValueChange={(v) => { setImportLanguage(v); setImportLangOpen(false); }}
                    open={importLangOpen}
                    onOpenChange={(open) => {
                      if (open && !importLangAck) {
                        setShowImportLangModal(true);
                      } else {
                        setImportLangOpen(open);
                      }
                    }}
                  >
                    <SelectTrigger className="border-2 border-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.35)] hover:border-amber-400 hover:bg-amber-500/10 focus:shadow-[0_0_12px_3px_rgba(245,158,11,0.5)] bg-[#0d1117]">
                      <SelectValue placeholder="Select language to continue" />
                    </SelectTrigger>
                    <SelectContent>
                      {LANGUAGES.map((l) => (
                        <SelectItem key={l.code} value={l.code} className="focus:bg-amber-500/15 focus:text-amber-800 dark:focus:text-amber-300">
                          {l.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Attach to existing meeting (optional)</Label>
                  <Select value={importMeetingId} onValueChange={setImportMeetingId}>
                    <SelectTrigger className="bg-[#0d1117] border-white/[0.08]">
                      <SelectValue placeholder="Create new meeting" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">Create new meeting</SelectItem>
                      {meetings.map((m) => (
                        <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  className="w-full text-white font-semibold transition-all duration-200"
                  style={{ background: "linear-gradient(135deg, #06B6D4 0%, #0EA5E9 50%, #38BDF8 100%)", boxShadow: "0 0 18px 2px rgba(14,165,233,0.30)" }}
                  onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.90"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
                  disabled={!importLanguage || uploading || uploaded || isAtDailyLimit}
                  onClick={() => void handleUpload()}
                >
                  {uploading ? (
                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> Processing…</>
                  ) : uploaded ? (
                    <><Check className="mr-2 h-4 w-4" aria-hidden /> Uploaded! Redirecting…</>
                  ) : (
                    <><Upload className="mr-2 h-4 w-4" aria-hidden /> Upload & Process</>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
