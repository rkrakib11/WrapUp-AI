import {
  BarChart3,
  Info,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Sparkles,
  Speaker,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { BackendStatusDot } from "@/components/instant/BackendStatusDot";
import { WaveformBars } from "@/components/instant/WaveformBars";
import {
  getDesktopCaptureState,
  isDesktopCaptureAvailable,
  setDesktopCaptureMicMuted,
  startDesktopCapture,
  stopDesktopCapture,
  subscribeToDesktopCaptureState,
  type DesktopCaptureStopResult,
  type DesktopCaptureState,
} from "@/lib/desktop-capture";
import { isDesktopApp, openExternalUrl } from "@/lib/app-shell";
import { useBackendRuntimeStatus } from "@/hooks/use-backend-runtime-status";
import { useAuth } from "@/hooks/useAuth";
import { useMeetings } from "@/hooks/useMeetings";
import { useMeetingDetail } from "@/hooks/useMeetingDetail";
import { useActionItems } from "@/hooks/useActionItems";
import { runNextForegroundUpload } from "@/lib/upload-queue";
import { resolveWebSocketUrl } from "@/lib/backend-url";
import { supabase } from "@/integrations/supabase/client";
import { deleteFinalizedCaptureSpool } from "@/lib/finalized-capture-spools";
import { LANGUAGES } from "@/lib/languages";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

type InsightTab = "transcript" | "actions" | "analytics" | "askai" | "notes";

const TABS: { id: InsightTab; label: string }[] = [
  { id: "transcript", label: "Transcript" },
  { id: "actions", label: "Actions" },
  { id: "analytics", label: "Analytics" },
  { id: "askai", label: "Ask AI" },
  { id: "notes", label: "Notes" },
];
const MIN_CAPTURE_UPLOAD_BYTES = 64 * 1024;

type SummaryPayload = {
  executive_summary?: string;
  key_points?: string[];
  action_items?: Array<{ task?: string; owner?: string; deadline?: string; confidence?: number } | string>;
  decisions?: string[];
  follow_ups?: string[];
};
type AnalyticsPayload = {
  language?: string;
  sentiment?: string;
  engagement_score?: number;
  meeting_duration_seconds?: number;
  speaking_time_seconds?: Record<string, number>;
  keyword_frequency?: Array<{ keyword?: string; word?: string; count?: number }>;
};

function parseSummary(raw: unknown): SummaryPayload {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as SummaryPayload;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as SummaryPayload;
  return {};
}

function parseAnalytics(raw: unknown): AnalyticsPayload {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as AnalyticsPayload;
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as AnalyticsPayload;
  return {};
}

function formatDuration(totalSeconds: number): string {
  const value = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = value % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

function deriveProcessingStatus(session: any): {
  status: string;
  message: string;
  progress: number;
} {
  if (!session) return { status: "idle", message: "", progress: 0 };
  const status = String(
    session.processing_status ??
      session.analytics_data?.processing_status?.status ??
      "idle",
  );
  const message = String(
    session.processing_message ??
      session.analytics_data?.processing_status?.message ??
      "",
  );
  const progress = Number(
    session.processing_progress ??
      session.analytics_data?.processing_status?.progress ??
      0,
  );
  return { status, message, progress: Number.isFinite(progress) ? progress : 0 };
}

function formatHms(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function InstantMeetingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const routeState = location.state as { meetingName?: string; language?: string; autoStart?: boolean } | null;
  const queryClient = useQueryClient();
  const [captureState, setCaptureState] = useState<DesktopCaptureState>(() => getDesktopCaptureState());
  const [captureMicrophone, setCaptureMicrophone] = useState(true);
  const [captureSystemAudio, setCaptureSystemAudio] = useState<boolean>(
    () => getDesktopCaptureState().systemAudioSupported,
  );
  const { status: backendRuntimeStatus, retry: retryBackend } = useBackendRuntimeStatus();

  const [isMuted, setIsMuted] = useState(false);
  const [meetingTitle, setMeetingTitle] = useState(routeState?.meetingName ?? "");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [stopping, setStopping] = useState(false);
  const [mounted, setMounted] = useState(false);
  const startRef = useRef<number | null>(null);

  const [activeTab, setActiveTab] = useState<InsightTab>("transcript");
  const localSessionIdRef = useRef<string>(
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now()),
  );
  const [language, setLanguage] = useState(routeState?.language ?? "");
  const [showLanguageReminderCard, setShowLanguageReminderCard] = useState(false);
  const [languageReminderAcknowledged, setLanguageReminderAcknowledged] = useState(Boolean(routeState?.language));
  const [languageOpen, setLanguageOpen] = useState(false);

  const [webRecording, setWebRecording] = useState(false);
  const [webStopping, setWebStopping] = useState(false);
  const [autoStarting, setAutoStarting] = useState(Boolean(routeState?.autoStart && routeState?.language));

  // Live streaming (WebSocket) refs & state for the browser recording path.
  // Desktop capture (Electron) still uses the native spool → batch flow.
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveDoneResolveRef = useRef<((transcript: string) => void) | null>(null);
  const [liveFinals, setLiveFinals] = useState<string[]>([]);
  const [liveInterim, setLiveInterim] = useState<string>("");

  const { user } = useAuth();
  const { createMeeting } = useMeetings();
  const { displayName, initials } = useMemo(() => {
    const raw = (user?.user_metadata?.full_name as string | undefined) ||
      (user?.user_metadata?.name as string | undefined) ||
      user?.email?.split("@")[0] ||
      "You";
    const cleaned = raw.trim() || "You";
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const init = (
      parts.length >= 2
        ? (parts[0][0] ?? "") + (parts[1][0] ?? "")
        : cleaned.slice(0, 2)
    ).toUpperCase() || "YO";
    return { displayName: cleaned, initials: init };
  }, [user]);

  const [pinnedSessionId, setPinnedSessionId] = useState<string | null>(null);
  useEffect(() => {
    if (captureState.sessionId && !pinnedSessionId) {
      setPinnedSessionId(captureState.sessionId);
    }
  }, [captureState.sessionId, pinnedSessionId]);

  const notesKey = `instant-meeting-notes:${pinnedSessionId ?? localSessionIdRef.current}`;

  const [endedMeetingId, setEndedMeetingId] = useState<string | null>(null);
  const { sessionsQuery } = useMeetingDetail(endedMeetingId ?? undefined);
  const { actionItemsQuery } = useActionItems();

  const latestSession: any = sessionsQuery.data?.[0];
  const latestTranscript: string = latestSession?.transcript ?? "";
  const latestSummary: SummaryPayload = useMemo(
    () => parseSummary(latestSession?.summary),
    [latestSession?.summary],
  );
  const latestAnalytics: AnalyticsPayload = useMemo(
    () => parseAnalytics(latestSession?.analytics_data),
    [latestSession?.analytics_data],
  );
  const { status: processingStatus, message: processingMessage, progress: processingProgress } =
    deriveProcessingStatus(latestSession);
  const meetingActions = useMemo(
    () => (actionItemsQuery.data ?? []).filter((a: any) => a.meeting_id === endedMeetingId),
    [actionItemsQuery.data, endedMeetingId],
  );

  useEffect(() => {
    const unsubscribe = subscribeToDesktopCaptureState((state) => {
      setCaptureState(state);
    });
    return () => {
      unsubscribe();
      void stopDesktopCapture();
      teardownLiveStreaming();
    };
  }, []);

  const isBusy = captureState.status === "starting" || captureState.status === "stopping" || webStopping;
  const isRecording = captureState.status === "recording" || webRecording;

  const [hasEntered, setHasEntered] = useState(false);
  useEffect(() => {
    if (isRecording) setHasEntered(true);
  }, [isRecording]);

  const inActiveView = hasEntered;
  const isEnded =
    hasEntered &&
    captureState.status !== "recording" &&
    captureState.status !== "starting" &&
    captureState.status !== "stopping" &&
    !webRecording &&
    !webStopping;

  useEffect(() => {
    if (!isRecording) {
      startRef.current = null;
      return;
    }
    startRef.current = Date.now();
    setElapsedMs(0);
    const id = window.setInterval(() => {
      if (startRef.current != null) {
        setElapsedMs(Date.now() - startRef.current);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  useEffect(() => {
    if (!inActiveView) {
      setMounted(false);
      return;
    }
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [inActiveView]);

  const isMacDesktop =
    typeof navigator !== "undefined" &&
    isDesktopApp() &&
    /mac/i.test(navigator.platform || navigator.userAgent);

  const systemAudioAvailable = isDesktopCaptureAvailable() && captureState.systemAudioSupported;

  const backendOffline = backendRuntimeStatus?.state === "unavailable";

  const startDisabled =
    isBusy || backendOffline || (!captureMicrophone && !captureSystemAudio) || !language;

  const startLabel = useMemo(() => {
    if (backendOffline) return "AI engine offline — retry first";
    if (!captureMicrophone && !captureSystemAudio) return "Enable audio source to start";
    if (!language) return "Select language to start";
    return "Start Capture";
  }, [backendOffline, captureMicrophone, captureSystemAudio, language]);

  const teardownLiveStreaming = () => {
    try {
      liveProcessorRef.current?.disconnect();
    } catch { /* noop */ }
    liveProcessorRef.current = null;
    try {
      liveSourceRef.current?.disconnect();
    } catch { /* noop */ }
    liveSourceRef.current = null;
    const ctx = liveAudioCtxRef.current;
    if (ctx && ctx.state !== "closed") {
      try { void ctx.close(); } catch { /* noop */ }
    }
    liveAudioCtxRef.current = null;
    liveStreamRef.current?.getTracks().forEach((t) => t.stop());
    liveStreamRef.current = null;
    const ws = liveWsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      try { ws.close(); } catch { /* noop */ }
    }
    liveWsRef.current = null;
  };

  const startWebRecording = async () => {
    if (!language) {
      toast.error("Select the spoken language before recording.");
      setAutoStarting(false);
      return;
    }
    let stream: MediaStream | null = null;
    let ctx: AudioContext | null = null;
    let targetMeetingId: string | null = null;

    try {
      // 1) Pre-create the meeting + session so we have an ID to open the WS
      //    against. Uses the same Supabase path the upload flow uses.
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Authentication session missing.");

      const targetMeeting = await createMeeting.mutateAsync({
        title: meetingTitle.trim() || `Meeting — ${new Date().toLocaleString()}`,
        source: "live",
      });
      targetMeetingId = targetMeeting.id;

      const { data: createdSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({ meeting_id: targetMeetingId, language_detected: language })
        .select("id")
        .single();
      if (sessionError) throw sessionError;
      const sessionId: string = createdSession.id;

      // 2) Open the WebSocket BEFORE starting the mic — if the server is
      //    unreachable we surface that error before touching the user's mic.
      const wsUrl =
        `${resolveWebSocketUrl(`/ws/live-transcription/${sessionId}`)}` +
        `?lang=${encodeURIComponent(language)}` +
        `&token=${encodeURIComponent(accessToken)}`;
      const ws = new WebSocket(wsUrl);
      ws.binaryType = "arraybuffer";
      liveWsRef.current = ws;

      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error("WebSocket connect timed out")), 10_000);
        ws.onopen = () => { window.clearTimeout(timeout); resolve(); };
        ws.onerror = () => { window.clearTimeout(timeout); reject(new Error("WebSocket failed to open")); };
      });

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(typeof evt.data === "string" ? evt.data : "");
          if (msg.type === "transcript") {
            const text = (msg.text as string | undefined)?.trim() ?? "";
            if (msg.is_final) {
              if (text) setLiveFinals((prev) => [...prev, text]);
              setLiveInterim("");
            } else {
              setLiveInterim(text);
            }
          } else if (msg.type === "warning") {
            toast.warning(msg.message ?? "Live transcription degraded.");
          } else if (msg.type === "error") {
            toast.error(msg.message ?? "Live transcription error.");
          } else if (msg.type === "done") {
            liveDoneResolveRef.current?.(msg.transcript ?? "");
            liveDoneResolveRef.current = null;
          }
        } catch {
          /* ignore non-JSON frames */
        }
      };

      // 3) Capture mic as 16 kHz mono PCM. AudioContext's sampleRate option
      //    triggers automatic resampling — works on Chrome/Edge/Firefox;
      //    Safari ignores the hint but we convert in the callback anyway.
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, sampleRate: 16_000, echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      liveStreamRef.current = stream;

      const AudioCtx: typeof AudioContext =
        (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new AudioCtx({ sampleRate: 16_000 });
      liveAudioCtxRef.current = ctx;

      const source = ctx.createMediaStreamSource(stream);
      liveSourceRef.current = source;
      // ScriptProcessorNode is deprecated but universally supported and works
      // without needing a separate AudioWorklet module file. Buffer 4096 @
      // 16 kHz = ~256 ms — matches the spec's "every ~250ms" requirement.
      const processor = ctx.createScriptProcessor(4096, 1, 1);
      liveProcessorRef.current = processor;

      processor.onaudioprocess = (ev) => {
        const input = ev.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
          const s = Math.max(-1, Math.min(1, input[i]));
          pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
        }
        if (liveWsRef.current?.readyState === WebSocket.OPEN) {
          liveWsRef.current.send(pcm.buffer);
        }
      };
      source.connect(processor);
      // Destination connection is required for ScriptProcessorNode to run.
      processor.connect(ctx.destination);

      setLiveFinals([]);
      setLiveInterim("");
      setEndedMeetingId(targetMeetingId);
      setWebRecording(true);
      setHasEntered(true);
      setAutoStarting(false);
      toast.success("Live transcription started.");
    } catch (err) {
      console.error("startWebRecording (streaming) failed:", err);
      // Single user-visible message regardless of which step failed; the
      // detailed reason is in the console for debugging. We don't want a
      // standalone "instant" page surface — bounce the user back to New
      // Meeting with a toast and let them retry from there.
      toast.error("WebSocket failed to open");
      teardownLiveStreaming();
      setAutoStarting(false);
      navigate("/dashboard/new-meeting", { replace: true });
    }
  };

  const stopWebRecording = async () => {
    const ws = liveWsRef.current;
    if (!ws) {
      teardownLiveStreaming();
      setWebRecording(false);
      return;
    }

    setWebStopping(true);
    setStopping(true);
    try {
      // Stop pushing audio first so the final Deepgram flush catches no
      // stale frames, then ask the server to finalise.
      try {
        liveProcessorRef.current?.disconnect();
      } catch { /* noop */ }

      const donePromise = new Promise<string>((resolve) => {
        liveDoneResolveRef.current = resolve;
        window.setTimeout(() => {
          if (liveDoneResolveRef.current) {
            liveDoneResolveRef.current("");
            liveDoneResolveRef.current = null;
          }
        }, 20_000);
      });

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stop" }));
      }

      await donePromise;
      await queryClient.invalidateQueries({ queryKey: ["meetings"] });
      toast.success("Recording finished. Processing summary & analytics.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to finalize recording.");
    } finally {
      teardownLiveStreaming();
      setWebRecording(false);
      setWebStopping(false);
      setStopping(false);
    }
  };

  // Auto-start when navigated from NewMeetingPage with autoStart flag.
  // If we land here without autoStart + language, this page has nothing to
  // show — silently redirect back to New Meeting. Direct navigation to
  // /dashboard/instant is no longer a supported user surface.
  useEffect(() => {
    if (!routeState?.autoStart || !routeState?.language) {
      navigate("/dashboard/new-meeting", { replace: true });
      return;
    }
    if (isDesktopCaptureAvailable()) {
      startDesktopCapture({ captureMicrophone: true, captureSystemAudio: false, language: routeState.language })
        .then(() => {
          setIsMuted(false);
          setDesktopCaptureMicMuted(false);
          setAutoStarting(false);
          toast.success("Recording started.");
        })
        .catch(() => {
          toast.error("WebSocket failed to open");
          setAutoStarting(false);
          navigate("/dashboard/new-meeting", { replace: true });
        });
    } else {
      void startWebRecording();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStartCapture = async () => {
    if (!isDesktopCaptureAvailable()) {
      await startWebRecording();
      return;
    }
    if (captureMicrophone && !captureSystemAudio && systemAudioAvailable) {
      toast.error("Enable System audio before starting. Mic-only capture usually misses other speakers.");
      return;
    }
    if (captureMicrophone && !captureSystemAudio && !systemAudioAvailable) {
      toast.warning("System audio capture is unavailable on this platform. Transcript quality may be low.");
    }
    try {
      await startDesktopCapture({ captureMicrophone, captureSystemAudio, language });
      setIsMuted(false);
      setDesktopCaptureMicMuted(false);
      toast.success("Recording started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start capture.");
    }
  };

  const handleStopCapture = async (): Promise<DesktopCaptureStopResult | null> => {
    try {
      return await stopDesktopCapture();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop capture.");
      return null;
    }
  };

  const handleRetryBackendStartup = async () => {
    try {
      const status = await retryBackend();
      if (!status) return;
      if (status.state === "ready") {
        toast.success("AI engine is ready.");
      } else if (status.state === "starting") {
        toast("AI engine is starting…");
      } else {
        toast.error("AI engine is still offline.");
      }
    } catch {
      toast.error("Failed to restart the AI engine.");
    }
  };

  const handleOpenMacMicrophoneSettings = async () => {
    try {
      await openExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone");
    } catch {
      toast.error("Failed to open macOS Microphone settings.");
    }
  };

  const handleOpenMacScreenRecordingSettings = async () => {
    try {
      await openExternalUrl("x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture");
    } catch {
      toast.error("Failed to open macOS Screen Recording settings.");
    }
  };

  const onStopAndSummarize = async () => {
    if (!language) {
      toast.error("Please select the audio language before ending the meeting.");
      setLanguageOpen(true);
      return;
    }

    setStopping(true);
    try {
      const stopResult = await handleStopCapture();
      if (!stopResult?.spooled) {
        toast.error("No recording found to upload.");
        return;
      }
      if (stopResult.size < MIN_CAPTURE_UPLOAD_BYTES) {
        if (stopResult.sessionId) {
          await deleteFinalizedCaptureSpool(stopResult.sessionId).catch(() => undefined);
        }
        toast.error("Captured audio is too short or silent. Record a longer meeting with clear audio.");
        return;
      }

      const resolvedTitle = meetingTitle.trim() || (() => {
        const now = new Date();
        const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const time = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
        return `Meeting — ${date} at ${time}`;
      })();

      const uploadResult = await runNextForegroundUpload({
        language,
        meetingTitle: resolvedTitle,
        source: "recorded",
      });

      if (uploadResult.outcome === "uploaded" || uploadResult.outcome === "uploaded_processing_not_started") {
        if (uploadResult.meetingId) {
          setEndedMeetingId(uploadResult.meetingId);
          const { error: titleUpdateError } = await supabase
            .from("meetings")
            .update({ title: resolvedTitle })
            .eq("id", uploadResult.meetingId);
          if (titleUpdateError) {
            console.warn("Failed to update meeting title from renderer", titleUpdateError);
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["meetings"] });
        if (uploadResult.outcome === "uploaded") {
          toast.success("Meeting uploaded. Processing started.");
        } else {
          toast("Uploaded, but processing didn't start automatically.");
        }
      } else if (uploadResult.outcome === "failed") {
        toast.error(uploadResult.error ?? "Failed to upload meeting.");
      } else if (uploadResult.outcome === "no_ready_item") {
        toast.error("No recording found to upload.");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to finalize meeting.");
    } finally {
      setStopping(false);
    }
  };

  const onLeave = () => {
    if (isEnded) {
      navigate(endedMeetingId ? `/dashboard/meetings/${endedMeetingId}` : "/dashboard/meetings");
      return;
    }
    if (webRecording) {
      void stopWebRecording();
      return;
    }
    void onStopAndSummarize();
  };

  if (inActiveView) {
    return (
      <>
        {showLanguageReminderCard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
            <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-400 bg-white dark:bg-gray-900 shadow-2xl shadow-amber-200/30 dark:shadow-amber-900/40 p-6 flex flex-col gap-4">
              <div className="flex gap-3 items-start">
                <Info className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">
                    Language matters for accuracy
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                    Select the exact language spoken in your recording. A wrong selection can make transcript, summary, and action items inaccurate.
                  </p>
                </div>
              </div>
              <button
                className="self-end text-sm font-semibold px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
                onClick={() => {
                  setShowLanguageReminderCard(false);
                  setLanguageReminderAcknowledged(true);
                  setLanguageOpen(true);
                }}
              >
                OK, got it
              </button>
            </div>
          </div>
        )}

        <div
          className={cn(
            "flex flex-col h-[calc(100vh-160px)] gap-4 transition-all duration-300",
            mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2",
          )}
        >
          {stopping && (
            <div className="glass rounded-xl px-4 py-3 flex items-center gap-3 text-sm">
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span>Processing your meeting… summary will be ready in a moment</span>
            </div>
          )}

          {/* ─── Top bar ─── */}
          <div className="flex items-center gap-4 bg-[#141828] border border-white/[0.08] rounded-xl px-4 py-2.5">
            <input
              value={meetingTitle}
              onChange={(e) => setMeetingTitle(e.target.value)}
              placeholder="Meeting name…"
              className="flex-1 min-w-0 bg-transparent border border-transparent hover:border-white/[0.08] focus:border-white/[0.12] rounded-md px-2 py-1 text-[15px] text-foreground placeholder:text-muted-foreground outline-none transition-colors"
            />
            <div className="flex items-center gap-2 shrink-0 font-mono text-sm">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  isEnded ? "bg-muted-foreground" : "bg-[#EF4444] animate-pulse",
                )}
                aria-hidden
              />
              <span className="tabular-nums">{formatHms(elapsedMs)}</span>
              {isEnded && (
                <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">Ended</span>
              )}
            </div>
            <Button
              size="sm"
              className="shrink-0 bg-[#EF4444] hover:bg-[#EF4444]/90 text-white"
              onClick={onLeave}
              disabled={stopping || captureState.status === "stopping"}
            >
              <PhoneOff className="mr-1.5 h-4 w-4" /> Leave
            </Button>
          </div>

          {/* ─── Main grid 60/40 ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 flex-1 min-h-0">
            {/* LEFT column */}
            <div className="flex flex-col gap-4 min-h-0">
              {/* Self-video tile */}
              <div className="relative bg-[#141828] border border-white/[0.08] rounded-xl overflow-hidden flex-[65] min-h-[300px]">
                <div className="w-full h-full flex items-center justify-center">
                  <div className="h-24 w-24 rounded-full bg-[#6C3FE6] flex items-center justify-center text-3xl font-semibold text-white">
                    {initials}
                  </div>
                </div>

              {/* Name pill */}
              <div className="absolute left-3 bottom-3 px-2.5 py-1 rounded-md bg-black/60 backdrop-blur text-xs text-white">
                {displayName}
              </div>

              {/* REC / Ended badge */}
              {isEnded ? (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur text-[10px] font-semibold uppercase tracking-wider text-white">
                  Ended
                </div>
              ) : (
                <div className="absolute right-3 top-3 flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#EF4444]/90 text-[10px] font-semibold uppercase tracking-wider text-white">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" aria-hidden /> REC
                </div>
              )}

              {/* Control bar */}
              <div className="absolute left-1/2 -translate-x-1/2 bottom-14 flex items-center gap-3">
                <ControlBtn
                  active={!isMuted}
                  onIcon={Mic}
                  offIcon={MicOff}
                  onClick={() => {
                    setIsMuted((previouslyMuted) => {
                      const nextMuted = !previouslyMuted;
                      setDesktopCaptureMicMuted(nextMuted);
                      return nextMuted;
                    });
                  }}
                  ariaLabel={isMuted ? "Unmute microphone" : "Mute microphone"}
                />
                <ControlBtn
                  active={false}
                  onIcon={PhoneOff}
                  offIcon={PhoneOff}
                  onClick={onLeave}
                  alwaysDanger
                  ariaLabel="Leave"
                />
              </div>

              {/* Waveform strip */}
              <WaveformBars
                count={20}
                className="absolute left-1/2 -translate-x-1/2 bottom-3 w-[60%] h-6"
                barClassName="w-[3px] animate-waveform-tall"
              />
            </div>

            {/* Meeting insights */}
            <div className="grid grid-cols-1 gap-3 flex-[35] min-h-0">
              <InsightsPanel elapsedMs={elapsedMs} isRecording={isRecording} />
            </div>
          </div>

          {/* RIGHT sidebar */}
          <div className="flex flex-col gap-4 min-h-0">
            {/* AI Summary card */}
            <AISummaryCard
              summary={latestSummary}
              processingStatus={processingStatus}
              processingProgress={processingProgress}
              processingMessage={processingMessage}
              isEnded={isEnded}
              hasMeetingId={Boolean(endedMeetingId)}
            />

            {/* Tab row + language selector */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] pb-1">
              <div className="flex items-center gap-1" role="tablist">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={activeTab === t.id}
                    className={cn(
                      "px-3 py-2 text-[12px] transition-colors relative",
                      activeTab === t.id ? "text-white" : "text-muted-foreground hover:text-foreground",
                    )}
                    onClick={() => setActiveTab(t.id)}
                  >
                    {t.label}
                    {activeTab === t.id && (
                      <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#6C3FE6]" aria-hidden />
                    )}
                  </button>
                ))}
              </div>
              <div className="w-[220px] shrink-0">
                <Select
                  value={language}
                  onValueChange={(value) => {
                    setLanguage(value);
                    setLanguageOpen(false);
                  }}
                  open={languageOpen}
                  onOpenChange={(open) => {
                    if (open && !languageReminderAcknowledged) {
                      setShowLanguageReminderCard(true);
                    } else {
                      setLanguageOpen(open);
                    }
                  }}
                >
                  <SelectTrigger className="h-8 text-xs border-2 border-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.4)] hover:border-amber-400 hover:bg-amber-500/10 hover:text-amber-700 hover:shadow-[0_0_12px_3px_rgba(251,191,36,0.7)] focus:shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
                    <SelectValue placeholder="Language *" />
                  </SelectTrigger>
                  <SelectContent>
                    {LANGUAGES.map((item) => (
                      <SelectItem
                        key={item.code}
                        value={item.code}
                        className="focus:bg-amber-500/15 focus:text-amber-800 dark:focus:text-amber-300"
                      >
                        {item.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tab content */}
            <div className="flex-1 min-h-0 bg-[#141828] border border-white/[0.08] rounded-xl p-4 overflow-y-auto">
              {activeTab === "transcript" && webRecording && (
                <LiveTranscriptPanel
                  finals={liveFinals}
                  interim={liveInterim}
                  language={language}
                />
              )}
              {activeTab === "transcript" && !webRecording && (
                <TranscriptTabContent
                  transcript={latestTranscript}
                  processingStatus={processingStatus}
                  processingProgress={processingProgress}
                  processingMessage={processingMessage}
                  isEnded={isEnded}
                  hasMeetingId={Boolean(endedMeetingId)}
                />
              )}
              {activeTab === "actions" && (
                <ActionsTabContent
                  summary={latestSummary}
                  actionItems={meetingActions}
                  processingStatus={processingStatus}
                  isEnded={isEnded}
                  hasMeetingId={Boolean(endedMeetingId)}
                />
              )}
              {activeTab === "analytics" && (
                <AnalyticsTabContent
                  analytics={latestAnalytics}
                  processingStatus={processingStatus}
                  isEnded={isEnded}
                />
              )}
              {activeTab === "askai" && <AskAITabContent />}
              {activeTab === "notes" && <NotesTabContent storageKey={notesKey} />}
            </div>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Auto-starting loading state — shown briefly while capture initializes
  if (autoStarting) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Starting recording…</p>
      </div>
    );
  }

  // No standalone surface for /dashboard/instant. If we're not in the
  // active view and not auto-starting, the auto-start effect above already
  // navigated us away — render nothing while React processes that.
  return null;
}

interface ControlBtnProps {
  active: boolean;
  onIcon: LucideIcon;
  offIcon: LucideIcon;
  onClick: () => void;
  alwaysDanger?: boolean;
  ariaLabel: string;
}

function ControlBtn({ active, onIcon: OnIcon, offIcon: OffIcon, onClick, alwaysDanger, ariaLabel }: ControlBtnProps) {
  const Icon = active ? OnIcon : OffIcon;
  const danger = alwaysDanger || !active;
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(
        "h-11 w-11 rounded-full flex items-center justify-center border transition-colors",
        danger
          ? "bg-[#EF4444] hover:bg-[#EF4444]/90 border-transparent text-white"
          : "bg-[#141828]/80 hover:bg-[#141828] border-white/[0.1] text-white backdrop-blur",
      )}
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

function InsightsPanel({ elapsedMs, isRecording }: { elapsedMs: number; isRecording: boolean }) {
  const [progress, setProgress] = useState({ discussion: 0, decisions: 0, actions: 0 });
  useEffect(() => {
    if (!isRecording) {
      return;
    }

    const id = window.setInterval(() => {
      setProgress((p) => ({
        discussion: Math.min(100, p.discussion + Math.round(Math.random() * 6 + 2)),
        decisions: Math.min(100, p.decisions + Math.round(Math.random() * 3)),
        actions: Math.min(100, p.actions + Math.round(Math.random() * 4)),
      }));
    }, 30000);
    return () => window.clearInterval(id);
  }, [isRecording]);

  const rows = [
    { label: "Discussion", value: progress.discussion },
    { label: "Decisions", value: progress.decisions },
    { label: "Action Items", value: progress.actions },
  ];

  return (
    <div className="bg-[#141828] border border-white/[0.08] rounded-xl p-4 flex flex-col min-h-0">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="h-4 w-4 text-[#6C3FE6]" />
        <h3 className="text-sm font-semibold">Meeting Insights</h3>
      </div>
      <div className="flex-1 min-h-0 space-y-3">
        {rows.map((r) => (
          <div key={r.label} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">{r.label}</span>
              <span className="tabular-nums text-muted-foreground">{r.value}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#6C3FE6] transition-[width] duration-500"
                style={{ width: `${r.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Duration</span>
        <span className="tabular-nums font-mono">{formatHms(elapsedMs)}</span>
      </div>
    </div>
  );
}

function AISummaryCard({
  summary,
  processingStatus,
  processingProgress,
  processingMessage,
  isEnded,
  hasMeetingId,
}: {
  summary: SummaryPayload;
  processingStatus: string;
  processingProgress: number;
  processingMessage: string;
  isEnded: boolean;
  hasMeetingId: boolean;
}) {
  const exec = summary.executive_summary?.trim();
  const body = (() => {
    if (exec) return <p className="text-xs text-foreground/90 whitespace-pre-wrap">{exec}</p>;
    if (!isEnded) {
      return (
        <p className="text-xs italic text-muted-foreground">
          Your meeting summary will appear here automatically when you end the meeting…
        </p>
      );
    }
    if (!hasMeetingId) {
      return (
        <p className="text-xs italic text-muted-foreground">
          Finalizing upload…
        </p>
      );
    }
    if (processingStatus === "failed") {
      return (
        <p className="text-xs italic text-destructive">
          Summary generation failed. Open the meeting page to retry.
        </p>
      );
    }
    return (
      <div className="space-y-1.5">
        <p className="text-xs italic text-muted-foreground">
          {processingMessage || "Generating summary…"}
        </p>
        {processingProgress > 0 && (
          <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full rounded-full bg-[#6C3FE6] transition-[width] duration-500"
              style={{ width: `${Math.min(100, processingProgress)}%` }}
            />
          </div>
        )}
      </div>
    );
  })();

  return (
    <div className="bg-[#141828] border border-white/[0.08] rounded-xl overflow-hidden max-h-[240px] flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-[#6C3FE6]/15 border-b border-white/[0.08] shrink-0">
        <Sparkles className="h-4 w-4 text-[#6C3FE6]" />
        <h2 className="text-sm font-semibold">AI Summary</h2>
      </div>
      <div className="px-4 py-4 overflow-y-auto">{body}</div>
    </div>
  );
}

function LiveTranscriptPanel({
  finals,
  interim,
  language,
}: {
  finals: string[];
  interim: string;
  language: string;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
        <span>Live transcription</span>
        {language && <span className="text-muted-foreground/70">• {language.toUpperCase()}</span>}
      </div>
      <div className="leading-relaxed text-foreground/90">
        {finals.length === 0 && !interim && (
          <span className="italic text-muted-foreground">
            Listening… start speaking and the transcript will appear here in real time.
          </span>
        )}
        {finals.map((segment, idx) => (
          <span key={idx}>
            {segment}
            {idx < finals.length - 1 ? " " : ""}
          </span>
        ))}
        {interim && (
          <>
            {finals.length > 0 ? " " : ""}
            <span className="italic text-muted-foreground">{interim}</span>
          </>
        )}
        <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
      </div>
    </div>
  );
}

function TranscriptTabContent({
  transcript,
  processingStatus,
  processingProgress,
  processingMessage,
  isEnded,
  hasMeetingId,
}: {
  transcript: string;
  processingStatus: string;
  processingProgress: number;
  processingMessage: string;
  isEnded: boolean;
  hasMeetingId: boolean;
}) {
  if (transcript) {
    const lines = transcript.split("\n").filter((l) => l.trim().length > 0);
    return (
      <div className="h-full text-xs space-y-2">
        {lines.map((line, idx) => {
          const match = line.match(/^\[(\d{2}:\d{2})(?:-\d{2}:\d{2})?\]\s+([^:]+):\s*(.*)$/);
          if (!match) {
            return (
              <p key={idx} className="text-foreground/90 whitespace-pre-wrap">{line}</p>
            );
          }
          const [, time, speaker, text] = match;
          return (
            <p key={idx} className="text-foreground/90 whitespace-pre-wrap">
              <span className="text-muted-foreground">[{time}] </span>
              <span className="font-medium">{speaker}:</span>{" "}
              <span>{text}</span>
            </p>
          );
        })}
      </div>
    );
  }

  if (!isEnded) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xs italic text-muted-foreground px-4">
          Listening… transcript will appear after processing
        </p>
        <WaveformBars count={5} className="h-8" barClassName="w-[4px]" />
      </div>
    );
  }

  if (!hasMeetingId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <p className="text-xs italic text-muted-foreground px-4">Finalizing upload…</p>
      </div>
    );
  }

  if (processingStatus === "failed") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs italic text-destructive px-4">Transcription failed.</p>
        <p className="text-[11px] text-muted-foreground px-4">
          Open the meeting page to retry.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <p className="text-xs italic text-muted-foreground px-4">
        {processingMessage || "Transcribing…"}
      </p>
      {processingProgress > 0 && (
        <div className="w-40 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full bg-[#6C3FE6] transition-[width] duration-500"
            style={{ width: `${Math.min(100, processingProgress)}%` }}
          />
        </div>
      )}
    </div>
  );
}

function ActionsTabContent({
  summary,
  actionItems,
  processingStatus,
  isEnded,
  hasMeetingId,
}: {
  summary: SummaryPayload;
  actionItems: any[];
  processingStatus: string;
  isEnded: boolean;
  hasMeetingId: boolean;
}) {
  const summaryActions = Array.isArray(summary.action_items) ? summary.action_items : [];
  const hasActionItems = actionItems.length > 0 || summaryActions.length > 0;

  if (hasActionItems) {
    return (
      <div className="h-full text-xs space-y-2">
        {actionItems.map((a) => (
          <div key={a.id} className="flex items-start gap-2 p-2 rounded-md bg-white/[0.03]">
            <span
              className={cn(
                "mt-0.5 h-3.5 w-3.5 rounded-[4px] border shrink-0",
                a.is_completed
                  ? "bg-[#10B981] border-[#10B981]"
                  : "border-white/[0.2]",
              )}
              aria-hidden
            />
            <span
              className={cn(
                "flex-1 min-w-0 break-words",
                a.is_completed && "line-through text-muted-foreground",
              )}
            >
              {a.title}
            </span>
          </div>
        ))}
        {actionItems.length === 0 &&
          summaryActions.map((a, i) => {
            const label =
              typeof a === "string"
                ? a
                : [a.task, a.owner ? `— ${a.owner}` : "", a.deadline ? `(${a.deadline})` : ""]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "Action item";
            return (
              <div key={i} className="flex items-start gap-2 p-2 rounded-md bg-white/[0.03]">
                <span
                  className="mt-0.5 h-3.5 w-3.5 rounded-[4px] border border-white/[0.2] shrink-0"
                  aria-hidden
                />
                <span className="flex-1 min-w-0 break-words">{label}</span>
              </div>
            );
          })}
      </div>
    );
  }

  if (!isEnded || !hasMeetingId) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xs italic text-muted-foreground px-4">
          Action items will be extracted automatically after your meeting ends…
        </p>
        <div className="w-full max-w-[200px] space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-[4px] border border-white/[0.1]" aria-hidden />
              <span className="flex-1 h-2 rounded-full bg-white/[0.06]" aria-hidden />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (processingStatus === "failed") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs italic text-destructive px-4">Processing failed.</p>
      </div>
    );
  }

  if (processingStatus === "completed") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs italic text-muted-foreground px-4">
          No action items found for this meeting.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <p className="text-xs italic text-muted-foreground px-4">Extracting action items…</p>
    </div>
  );
}

function AnalyticsTabContent({
  analytics,
  processingStatus,
  isEnded,
}: {
  analytics: AnalyticsPayload;
  processingStatus: string;
  isEnded: boolean;
}) {
  const speaking = analytics.speaking_time_seconds && typeof analytics.speaking_time_seconds === "object"
    ? Object.entries(analytics.speaking_time_seconds)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
    : [];
  const keywords = Array.isArray(analytics.keyword_frequency)
    ? analytics.keyword_frequency
        .map((entry) => ({
          label: String(entry.keyword ?? entry.word ?? "").trim(),
          count: Number(entry.count ?? 0),
        }))
        .filter((entry) => entry.label.length > 0)
        .slice(0, 8)
    : [];
  const hasAnalytics =
    typeof analytics.engagement_score === "number" ||
    typeof analytics.sentiment === "string" ||
    typeof analytics.meeting_duration_seconds === "number" ||
    speaking.length > 0 ||
    keywords.length > 0;

  if (hasAnalytics) {
    return (
      <div className="h-full text-xs space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md bg-white/[0.03] p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Sentiment</p>
            <p className="text-sm font-medium capitalize">{analytics.sentiment ?? "unknown"}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Engagement</p>
            <p className="text-sm font-medium">
              {typeof analytics.engagement_score === "number" ? `${Math.round(analytics.engagement_score)}%` : "n/a"}
            </p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Language</p>
            <p className="text-sm font-medium uppercase">{analytics.language ?? "und"}</p>
          </div>
          <div className="rounded-md bg-white/[0.03] p-2">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Duration</p>
            <p className="text-sm font-medium">
              {typeof analytics.meeting_duration_seconds === "number"
                ? formatDuration(analytics.meeting_duration_seconds)
                : "n/a"}
            </p>
          </div>
        </div>

        {speaking.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Speaker Time</p>
            <div className="space-y-1.5">
              {speaking.map(([speaker, seconds]) => (
                <div key={speaker} className="flex items-center justify-between rounded-md bg-white/[0.03] px-2 py-1.5">
                  <span className="truncate pr-2">{speaker}</span>
                  <span className="tabular-nums text-muted-foreground">{formatDuration(seconds)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {keywords.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Top Keywords</p>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((entry, index) => (
                <span
                  key={`${entry.label}-${index}`}
                  className="rounded-full border border-white/[0.1] px-2 py-0.5 text-[11px] text-muted-foreground"
                >
                  {entry.label} {entry.count > 0 ? `(${entry.count})` : ""}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (!isEnded) {
    const heights = [40, 72, 28, 60, 88];
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 text-center">
        <p className="text-xs italic text-muted-foreground px-4">
          Analytics will be ready after processing completes…
        </p>
        <div className="flex items-end gap-2 h-24">
          {heights.map((h, i) => (
            <div
              key={i}
              className="w-5 rounded-t bg-white/[0.06]"
              style={{ height: `${h}%` }}
              aria-hidden
            />
          ))}
        </div>
      </div>
    );
  }

  if (processingStatus === "failed") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs italic text-destructive px-4">Processing failed.</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
      <Loader2 className="h-4 w-4 animate-spin text-primary" />
      <p className="text-xs italic text-muted-foreground px-4">Analyzing meeting…</p>
    </div>
  );
}

function AskAITabContent() {
  const [value, setValue] = useState("");
  const chips = [
    "What were the key decisions?",
    "List all action items",
    "Who spoke the most?",
  ];
  return (
    <div className="h-full flex flex-col gap-3">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ask anything about this meeting…"
        className="w-full bg-transparent border border-white/[0.08] focus:border-white/[0.16] rounded-md px-3 py-2 text-xs outline-none"
      />
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setValue(c)}
            className="px-2.5 py-1 rounded-full border border-white/[0.1] text-[11px] text-muted-foreground hover:text-foreground hover:border-white/[0.2] transition-colors"
          >
            {c}
          </button>
        ))}
      </div>
    </div>
  );
}

function NotesTabContent({ storageKey }: { storageKey: string }) {
  const [value, setValue] = useState("");
  const hydratedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (hydratedKeyRef.current === storageKey) return;
    try {
      const stored = window.localStorage.getItem(storageKey);
      setValue(stored ?? "");
    } catch {
      setValue("");
    }
    hydratedKeyRef.current = storageKey;
  }, [storageKey]);

  useEffect(() => {
    if (hydratedKeyRef.current !== storageKey) return;
    const id = window.setTimeout(() => {
      try {
        window.localStorage.setItem(storageKey, value);
      } catch {
        /* ignore quota errors */
      }
    }, 500);
    return () => window.clearTimeout(id);
  }, [value, storageKey]);

  return (
    <textarea
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder="Type your notes here…"
      className="w-full h-full min-h-[180px] bg-transparent border border-white/[0.08] focus:border-white/[0.16] rounded-md p-3 text-xs outline-none resize-none"
    />
  );
}
