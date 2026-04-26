import {
  AlertTriangle,
  BarChart3,
  Info,
  Loader2,
  Mic,
  Pause,
  Play,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
  const [isPaused, setIsPaused] = useState(false);

  // Live streaming (WebSocket) refs & state for the browser recording path.
  // Desktop capture (Electron) still uses the native spool → batch flow.
  const liveWsRef = useRef<WebSocket | null>(null);
  const liveAudioCtxRef = useRef<AudioContext | null>(null);
  const liveProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const liveWorkletRef = useRef<AudioWorkletNode | null>(null);
  const liveSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const liveStreamRef = useRef<MediaStream | null>(null);
  const liveDoneResolveRef = useRef<((transcript: string) => void) | null>(null);
  const [liveFinals, setLiveFinals] = useState<{ speaker: number | null; text: string }[]>([]);
  const [liveInterim, setLiveInterim] = useState<string>("");
  // Stream + AudioContext exposed to the InputLevelMeter so it can build
  // its own AnalyserNode without re-using the worklet's source node.
  const [liveStream, setLiveStream] = useState<MediaStream | null>(null);
  const [liveAudioCtx, setLiveAudioCtx] = useState<AudioContext | null>(null);
  // Pause bookkeeping: pauseStartRef holds the Date.now() at which the
  // current pause began (null when not paused). pausedAccumRef accumulates
  // total paused milliseconds so the elapsed timer subtracts pause time.
  // pausedTotalMs mirrors pausedAccumRef but as state so the InsightsPanel
  // re-renders the "Paused" row when a pause completes.
  const pauseStartRef = useRef<number | null>(null);
  const pausedAccumRef = useRef<number>(0);
  const [pausedTotalMs, setPausedTotalMs] = useState(0);

  // Audio device picker (Feature 1). Empty `selectedDeviceId` means the
  // browser's default mic. Labels appear only after the first successful
  // getUserMedia call (browser privacy: no permission → no labels).
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  // Silence warning (Feature 3). lastVoiceTsRef is updated on every
  // requestAnimationFrame tick by InputLevelMeter via the `onLevel`
  // callback — refs avoid 60Hz React re-renders. A 1Hz interval reads
  // the ref and toggles silenceWarning state when the gap exceeds 10s.
  const lastVoiceTsRef = useRef<number>(Date.now());
  const [silenceWarning, setSilenceWarning] = useState(false);
  // Reflects what the browser actually agreed to do for auto-gain-control
  // on this stream. Surfaced in the Live Transcript panel so the user can
  // verify the constraint took effect without opening DevTools.
  const [micAgcEnabled, setMicAgcEnabled] = useState<boolean | null>(null);

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

  // ── Audio device picker effect ──
  // Enumerate audio inputs on mount + whenever hardware changes. Labels
  // are empty until mic permission is granted, so we also re-enumerate
  // after the first successful getUserMedia call (handled in
  // startWebRecording). The `devicechange` listener keeps the list fresh
  // when the user plugs/unplugs hardware mid-session.
  const refreshAudioDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setAudioDevices(devices.filter((d) => d.kind === "audioinput"));
    } catch {
      /* ignore enumeration errors */
    }
  }, []);

  useEffect(() => {
    void refreshAudioDevices();
    const handler = () => { void refreshAudioDevices(); };
    navigator.mediaDevices?.addEventListener?.("devicechange", handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.("devicechange", handler);
    };
  }, [refreshAudioDevices]);

  // ── Silence detection effect ──
  // The InputLevelMeter calls handleMeterLevel on every frame with a
  // post-sqrt level in [0,1]. We only count a frame as "voice" when the
  // level crosses the floor — 0.10 is well above ambient noise on
  // typical mics but easily reached by normal speech. Refs avoid 60Hz
  // React re-renders. A 1Hz interval reads the ref and flips
  // silenceWarning when the gap exceeds 8 seconds. Pausing resets the
  // clock so resuming doesn't immediately fire a stale warning.
  const handleMeterLevel = useCallback((level: number) => {
    if (level > 0.10) {
      lastVoiceTsRef.current = Date.now();
    }
  }, []);

  useEffect(() => {
    if (!webRecording || isPaused) {
      setSilenceWarning(false);
      lastVoiceTsRef.current = Date.now();
      return;
    }
    lastVoiceTsRef.current = Date.now();
    const id = window.setInterval(() => {
      const since = Date.now() - lastVoiceTsRef.current;
      setSilenceWarning(since > 8_000);
    }, 1000);
    return () => window.clearInterval(id);
  }, [webRecording, isPaused]);

  // Live stats derived from finalized speech segments — surfaced under
  // the input meter so the user has at-a-glance context (how many
  // distinct speakers, how many words so far) without checking the
  // transcript pane.
  const speakerCount = useMemo(() => {
    const set = new Set<number>();
    for (const f of liveFinals) {
      if (f.speaker !== null) set.add(f.speaker);
    }
    return set.size;
  }, [liveFinals]);
  const wordCount = useMemo(() => {
    return liveFinals.reduce(
      (n, f) => n + f.text.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
  }, [liveFinals]);

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
      // Don't reset pausedTotalMs here — the user just clicked Stop and
      // the ended-state Insights panel needs to display the final value.
      // We reset it only when STARTING a new recording (below).
      startRef.current = null;
      pauseStartRef.current = null;
      return;
    }
    startRef.current = Date.now();
    pausedAccumRef.current = 0;
    pauseStartRef.current = null;
    setElapsedMs(0);
    setPausedTotalMs(0);
    const id = window.setInterval(() => {
      if (startRef.current === null) return;
      // While paused, freeze the displayed value — pauseStartRef is set
      // when the pause began, and resumeRecording() will fold the elapsed
      // pause into pausedAccumRef before we tick again.
      if (pauseStartRef.current !== null) return;
      setElapsedMs(Date.now() - startRef.current - pausedAccumRef.current);
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
      liveWorkletRef.current?.disconnect();
    } catch { /* noop */ }
    liveWorkletRef.current = null;
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
    setLiveStream(null);
    setLiveAudioCtx(null);
    setIsPaused(false);
    pauseStartRef.current = null;
    pausedAccumRef.current = 0;
    // Intentionally NOT clearing pausedTotalMs — InsightsPanel renders
    // it after Stop. It gets reset when a fresh recording starts.
    setSilenceWarning(false);
    lastVoiceTsRef.current = Date.now();
  };

  const pauseRecording = () => {
    if (!webRecording || isPaused) return;
    // Stop sending PCM to Deepgram by disconnecting the source node from
    // the worklet/processor. Also flip `track.enabled = false` so the
    // browser stops processing the mic for privacy.
    try { liveSourceRef.current?.disconnect(); } catch { /* noop */ }
    liveStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = false; });
    pauseStartRef.current = Date.now();
    setIsPaused(true);
  };

  const resumeRecording = () => {
    if (!webRecording || !isPaused) return;
    liveStreamRef.current?.getAudioTracks().forEach((t) => { t.enabled = true; });
    const source = liveSourceRef.current;
    const worklet = liveWorkletRef.current;
    const processor = liveProcessorRef.current;
    if (source) {
      if (worklet) {
        try { source.connect(worklet); } catch { /* noop */ }
      } else if (processor) {
        try { source.connect(processor); } catch { /* noop */ }
      }
    }
    if (pauseStartRef.current !== null) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    // Publish the new total so the InsightsPanel re-renders with the
    // updated "Paused" duration row.
    setPausedTotalMs(pausedAccumRef.current);
    setIsPaused(false);
  };

  // Switch microphones — works before AND during recording. Before:
  // just stores the choice; the next startWebRecording() picks it up.
  // During: gets a fresh stream from the new device, swaps it into
  // place, reconnects the source to the existing worklet/processor.
  // The WebSocket stays open across the swap so live transcription
  // continues without a Deepgram reconnect.
  const changeAudioDevice = async (deviceId: string) => {
    const previousId = selectedDeviceId;
    setSelectedDeviceId(deviceId);
    if (!webRecording || !liveAudioCtxRef.current) return;
    const ctx = liveAudioCtxRef.current;
    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16_000,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          deviceId: { exact: deviceId },
        },
        video: false,
      });
      // Disconnect the old source from worklet/processor.
      try { liveSourceRef.current?.disconnect(); } catch { /* noop */ }
      // Stop the old stream's tracks so the browser releases the old mic.
      liveStreamRef.current?.getTracks().forEach((t) => t.stop());
      liveStreamRef.current = newStream;
      setLiveStream(newStream);
      // Build a new MediaStreamSource on the same AudioContext, then
      // re-wire to whichever processor was already in place.
      const newSource = ctx.createMediaStreamSource(newStream);
      liveSourceRef.current = newSource;
      const worklet = liveWorkletRef.current;
      const processor = liveProcessorRef.current;
      if (worklet) {
        newSource.connect(worklet);
      } else if (processor) {
        newSource.connect(processor);
      }
      // Re-honour pause state: if the user paused before swapping, keep
      // the new track muted to avoid leaking audio while "paused".
      if (isPaused) {
        newStream.getAudioTracks().forEach((t) => { t.enabled = false; });
      }
      toast.success("Switched microphone");
    } catch (err) {
      // Failed swap: revert the picker to the prior choice so the UI
      // doesn't lie about which device is active.
      setSelectedDeviceId(previousId);
      toast.error(
        err instanceof Error
          ? `Failed to switch microphone: ${err.message}`
          : "Failed to switch microphone",
      );
    }
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
            const speaker = typeof msg.speaker === "number" ? msg.speaker : null;
            if (msg.is_final) {
              if (text) {
                setLiveFinals((prev) => [...prev, { speaker, text }]);
              }
              setLiveInterim("");
            } else {
              setLiveInterim(text);
            }
          } else if (msg.type === "warning") {
            toast.warning(msg.message ?? "Live transcription degraded.");
          } else if (msg.type === "info") {
            // Server is telling us live transcript is unavailable for this
            // language but the recording is still being captured.
            toast(msg.message ?? "Live transcript unavailable.");
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
      //
      //    ALL three WebRTC processors are disabled — `autoGainControl` is
      //    the obvious one (it's what was dragging the macOS hardware input
      //    level down while the user spoke), but on Chromium `echoCancellation`
      //    and `noiseSuppression` internally re-enable AGC even when
      //    autoGainControl is set to false, so we have to turn the whole
      //    WebRTC processing chain off and rely on Deepgram for cleanup.
      //    Vendor-prefixed `googAutoGainControl` is honoured by older
      //    Chromium builds and is included for safety.
      const audioConstraints: MediaTrackConstraints & Record<string, unknown> = {
        channelCount: 1,
        sampleRate: 16_000,
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        // Chromium-only vendor-prefixed flags — not in the TS dom lib but
        // older Chromium builds honour them, so keep them set for safety.
        googAutoGainControl: false,
        googAutoGainControl2: false,
        googEchoCancellation: false,
        googNoiseSuppression: false,
        googHighpassFilter: false,
        // Honour the user's mic-picker selection if any. `exact` makes
        // the call fail (rather than silently falling back) if the chosen
        // device is no longer present — gives us a clean error path.
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
      };
      stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints,
        video: false,
      });
      liveStreamRef.current = stream;
      setLiveStream(stream);
      // Permission is now granted, so device labels are populated. Refresh
      // the picker list so users see real names instead of empty strings.
      void refreshAudioDevices();

      // Read what the browser actually agreed to. If the track came back
      // with autoGainControl still true, surface that in the UI — that's
      // what was dragging the macOS hardware input level down.
      try {
        const track = stream.getAudioTracks()[0];
        const settings = track?.getSettings?.() as MediaTrackSettings | undefined;
        const agc = settings?.autoGainControl;
        setMicAgcEnabled(typeof agc === "boolean" ? agc : null);
        if (agc === true) {
          // Some Chromium builds ignore autoGainControl:false on first
          // get. Try again at runtime — rare but worth one shot.
          try {
            await track?.applyConstraints?.({ autoGainControl: false } as MediaTrackConstraints);
            const after = track?.getSettings?.()?.autoGainControl;
            setMicAgcEnabled(typeof after === "boolean" ? after : null);
          } catch { /* ignore */ }
        }
      } catch { /* ignore */ }

      const AudioCtx: typeof AudioContext =
        (window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext);
      ctx = new AudioCtx({ sampleRate: 16_000 });
      liveAudioCtxRef.current = ctx;
      setLiveAudioCtx(ctx);

      const source = ctx.createMediaStreamSource(stream);
      liveSourceRef.current = source;

      // Prefer AudioWorklet (audio thread, immune to React re-render starvation
      // → no dropped frames). Fall back to ScriptProcessorNode on browsers
      // that don't expose audioWorklet (rare in 2026).
      const sendPcmBuffer = (buf: ArrayBuffer) => {
        if (liveWsRef.current?.readyState === WebSocket.OPEN) {
          liveWsRef.current.send(buf);
        }
      };

      let usingWorklet = false;
      try {
        if (ctx.audioWorklet) {
          await ctx.audioWorklet.addModule("/pcm-recorder-worklet.js");
          const worklet = new AudioWorkletNode(ctx, "pcm-recorder");
          worklet.port.onmessage = (ev: MessageEvent<ArrayBuffer>) => {
            sendPcmBuffer(ev.data);
          };
          liveWorkletRef.current = worklet;
          source.connect(worklet);
          // No destination connection needed for AudioWorklet.
          usingWorklet = true;
        }
      } catch (workletErr) {
        console.warn("[live] AudioWorklet failed, falling back to ScriptProcessor:", workletErr);
      }

      if (!usingWorklet) {
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        liveProcessorRef.current = processor;
        processor.onaudioprocess = (ev) => {
          const input = ev.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            const s = Math.max(-1, Math.min(1, input[i]));
            pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
          }
          sendPcmBuffer(pcm.buffer);
        };
        source.connect(processor);
        processor.connect(ctx.destination);
      }

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
    // If the user clicks Stop while paused, fold the in-flight pause
    // duration into the accumulator first, so the final pausedTotalMs
    // reflects the full paused time including the trailing pause.
    if (pauseStartRef.current !== null) {
      pausedAccumRef.current += Date.now() - pauseStartRef.current;
      pauseStartRef.current = null;
    }
    setPausedTotalMs(pausedAccumRef.current);

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
  //
  // Both web and Electron now go through the WebSocket / getUserMedia path
  // so live transcription works identically on both. The native
  // desktop-capture spool flow is intentionally skipped — it's mic+system
  // batch-only, doesn't drive live transcript. Re-add later as an opt-in.
  useEffect(() => {
    if (!routeState?.autoStart || !routeState?.language) {
      navigate("/dashboard/new-meeting", { replace: true });
      return;
    }
    void startWebRecording();
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

          {/* ─── Main grid 60/40 ─── */}
          <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-4 flex-1 min-h-0">
            {/* LEFT column */}
            <div className="flex flex-col gap-4 min-h-0">
              {/* Top bar — meeting name + timer (no Leave button) */}
              <div className="flex items-center gap-3 bg-[#141828] border border-white/[0.08] rounded-xl px-4 py-2.5">
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
                      isEnded
                        ? "bg-muted-foreground"
                        : isPaused
                          ? "bg-amber-400"
                          : "bg-[#EF4444] animate-pulse",
                    )}
                    aria-hidden
                  />
                  <span className="tabular-nums">{formatHms(elapsedMs)}</span>
                  {isEnded && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground">Ended</span>
                  )}
                  {!isEnded && isPaused && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-400">Paused</span>
                  )}
                </div>
              </div>

              {/* Compact monitor — device picker + level meter + 2 controls + stats */}
              <div className="bg-[#141828] border border-white/[0.08] rounded-xl px-4 py-4 flex flex-col gap-3">
                {/* Device picker (Feature 1) — compact pill on the
                    left, not full width. Show only when at least one
                    labelled device is known. Hidden in ended state. */}
                {audioDevices.length > 0 && !isEnded && (
                  <div className="flex items-center gap-2 text-xs">
                    <Mic className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => { void changeAudioDevice(e.target.value); }}
                      className="max-w-[220px] truncate bg-transparent border border-white/[0.08] hover:border-white/[0.16] focus:border-white/[0.2] rounded-md px-2 py-1 text-xs text-foreground outline-none transition-colors"
                      aria-label="Select microphone"
                    >
                      <option value="">Default microphone</option>
                      {audioDevices.map((d, idx) => (
                        <option key={d.deviceId || idx} value={d.deviceId}>
                          {d.label || `Microphone ${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <InputLevelMeter
                  stream={liveStream}
                  audioCtx={liveAudioCtx}
                  paused={isPaused || isEnded}
                  onLevel={handleMeterLevel}
                />

                {/* Silence warning (Feature 3) */}
                {silenceWarning && webRecording && !isPaused && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-px" />
                    <div className="flex-1 leading-relaxed">
                      We're not hearing you for the last 10s. Check your mic, or pick a different input above.
                    </div>
                  </div>
                )}

                {!isEnded ? (
                  <div className="flex items-center justify-center gap-6">
                    {/* Pause / Resume */}
                    <button
                      type="button"
                      aria-label={isPaused ? "Resume recording" : "Pause recording"}
                      onClick={isPaused ? resumeRecording : pauseRecording}
                      disabled={!webRecording || stopping}
                      className="h-12 w-12 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.1] text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPaused ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
                    </button>

                    {/* Stop */}
                    <button
                      type="button"
                      aria-label="Stop recording"
                      onClick={onLeave}
                      disabled={stopping || captureState.status === "stopping"}
                      className="h-14 w-14 rounded-full flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.12] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <span className="h-5 w-5 rounded-[6px] bg-[#EF4444]" aria-hidden />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                    Recording ended
                  </div>
                )}

                {/* Live stats — speakers, words, status */}
                <div className="flex items-center justify-center gap-6 text-[11px] text-muted-foreground">
                  <span>
                    Speakers:{" "}
                    <span className="font-medium tabular-nums text-foreground">
                      {speakerCount > 0 ? speakerCount : "—"}
                    </span>
                  </span>
                  <span>
                    Words:{" "}
                    <span className="font-medium tabular-nums text-foreground">{wordCount}</span>
                  </span>
                  <span>
                    Lang:{" "}
                    <span className="font-medium uppercase text-foreground">
                      {language || "—"}
                    </span>
                  </span>
                </div>
              </div>

              {/* Meeting insights */}
              <div className="grid grid-cols-1 gap-3 flex-1 min-h-0">
                <InsightsPanel
                  elapsedMs={elapsedMs}
                  isRecording={isRecording}
                  pausedMs={pausedTotalMs}
                />
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
                    // Mid-recording language change confirmation (Feature 4).
                    // The WS already opened with the original `lang`, so the
                    // current Deepgram session won't switch — only the next
                    // recording will use the new value. Make that explicit
                    // before the user changes anything.
                    if (webRecording && value !== language) {
                      const ok = window.confirm(
                        "Changing language won't affect this recording's transcript. " +
                          "The new selection only applies to your next session. Continue?",
                      );
                      if (!ok) {
                        setLanguageOpen(false);
                        return;
                      }
                    }
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
              {activeTab === "transcript" && liveFinals.length > 0 && (
                <LiveTranscriptPanel
                  finals={liveFinals}
                  interim={liveInterim}
                  language={language}
                  micAgcEnabled={micAgcEnabled}
                  isEnded={!webRecording}
                />
              )}
              {activeTab === "transcript" && liveFinals.length === 0 && (
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

// Real-time mic input level visualization. Renders a row of bars whose
// heights track the microphone amplitude over time. Uses an AnalyserNode
// off the live AudioContext + a canvas in a requestAnimationFrame loop
// so we don't trigger React re-renders 60 times per second.
function InputLevelMeter({
  stream,
  audioCtx,
  paused,
  onLevel,
}: {
  stream: MediaStream | null;
  audioCtx: AudioContext | null;
  paused: boolean;
  onLevel?: (level: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const levelsRef = useRef<number[]>([]);
  const pausedRef = useRef<boolean>(paused);
  const onLevelRef = useRef<typeof onLevel>(onLevel);
  const BAR_COUNT = 60;

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => {
    onLevelRef.current = onLevel;
  }, [onLevel]);

  useEffect(() => {
    levelsRef.current = Array(BAR_COUNT).fill(0);
    if (!stream || !audioCtx) return;

    let source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let data: Uint8Array | null = null;
    try {
      source = audioCtx.createMediaStreamSource(stream);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      data = new Uint8Array(analyser.frequencyBinCount);
    } catch {
      return;
    }

    const tick = () => {
      const canvas = canvasRef.current;
      if (!canvas || !analyser || !data) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      let level = 0;
      if (!pausedRef.current) {
        analyser.getByteFrequencyData(data);
        // Voice band only — skip the lowest 2 bins (DC/hum) and cap at
        // bin 30 (~1 kHz on a 16 kHz stream is about where speech
        // information density peaks). Use the PEAK across the band, not
        // the average — average smears speech into ambient noise and
        // makes silence look identical to talking. Then apply a sqrt
        // perceptual curve so quiet voices still show as visible bars
        // while loud speech doesn't immediately clip.
        let peak = 0;
        for (let i = 2; i < 30 && i < data.length; i++) {
          if (data[i] > peak) peak = data[i];
        }
        level = Math.sqrt(peak / 255);
      }
      // Notify parent of the current frame level (for silence detection).
      // Refs avoid re-binding the rAF loop when the parent's callback
      // identity changes.
      onLevelRef.current?.(level);
      levelsRef.current = [...levelsRef.current.slice(1), level];

      const dpr = window.devicePixelRatio || 1;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const targetW = Math.floor(cssW * dpr);
      const targetH = Math.floor(cssH * dpr);
      if (canvas.width !== targetW) canvas.width = targetW;
      if (canvas.height !== targetH) canvas.height = targetH;

      const c = canvas.getContext("2d");
      if (!c) {
        rafRef.current = requestAnimationFrame(tick);
        return;
      }
      c.clearRect(0, 0, canvas.width, canvas.height);

      const barW = 3 * dpr;
      const gap = 3 * dpr;
      const totalW = (barW + gap) * BAR_COUNT - gap;
      const startX = (canvas.width - totalW) / 2;
      const centerY = canvas.height / 2;
      const maxBarH = canvas.height - 4 * dpr;
      const minBarH = 2 * dpr;

      c.fillStyle = pausedRef.current ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.65)";
      for (let i = 0; i < BAR_COUNT; i++) {
        const lvl = levelsRef.current[i];
        const h = Math.max(minBarH, lvl * maxBarH);
        const x = startX + i * (barW + gap);
        const y = centerY - h / 2;
        c.fillRect(x, y, barW, h);
      }

      // "Now" indicator (Feature 2) — a thin red vertical line at the
      // right edge of the bar field, mirroring iOS Voice Memos. Anchors
      // the live moment as the bars scroll past.
      if (!pausedRef.current) {
        const indicatorX = startX + (BAR_COUNT - 1) * (barW + gap) + barW / 2 - dpr;
        c.fillStyle = "rgb(239, 68, 68)";
        c.fillRect(indicatorX, 0, 2 * dpr, canvas.height);
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      try { source?.disconnect(); } catch { /* noop */ }
      try { analyser?.disconnect(); } catch { /* noop */ }
    };
  }, [stream, audioCtx]);

  return <canvas ref={canvasRef} className="w-full h-12" aria-hidden />;
}

function InsightsPanel({
  elapsedMs,
  isRecording,
  pausedMs,
}: {
  elapsedMs: number;
  isRecording: boolean;
  pausedMs: number;
}) {
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
        <span>Recorded</span>
        <span className="tabular-nums font-mono">{formatHms(elapsedMs)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Paused</span>
        <span className="tabular-nums font-mono">{formatHms(pausedMs)}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Total</span>
        <span className="tabular-nums font-mono">{formatHms(elapsedMs + pausedMs)}</span>
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
  micAgcEnabled,
  isEnded = false,
}: {
  finals: { speaker: number | null; text: string }[];
  interim: string;
  language: string;
  micAgcEnabled: boolean | null;
  isEnded?: boolean;
}) {
  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground flex-wrap">
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            isEnded ? "bg-muted-foreground" : "animate-pulse bg-red-500",
          )}
        />
        <span>{isEnded ? "Recording ended" : "Live transcription"}</span>
        {language && <span className="text-muted-foreground/70">• {language.toUpperCase()}</span>}
        {micAgcEnabled === false && (
          <span
            className="rounded-md bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-400 border border-emerald-500/30"
            title="Browser is not auto-adjusting your input level."
          >
            AGC OFF
          </span>
        )}
        {micAgcEnabled === true && (
          <span
            className="rounded-md bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/30"
            title="Browser still applies auto-gain on this stream."
          >
            AGC ON
          </span>
        )}
      </div>
      {micAgcEnabled === false && (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          If your macOS Sound input level still drops while you talk, that&apos;s
          macOS itself adjusting the slider, not the app. Open
          <span className="font-medium"> System Settings → Sound → Input</span> and
          uncheck <span className="font-medium">&quot;Ambient noise reduction&quot;</span> if it&apos;s
          shown for your microphone.
        </p>
      )}
      <div className="leading-relaxed text-foreground/90 space-y-2">
        {finals.length === 0 && !interim && (
          <div className="italic text-muted-foreground">
            Listening… start speaking and the transcript will appear here in real time.
          </div>
        )}
        {finals.map((segment, idx) => {
          // Speaker labels are 1-indexed in the UI even though Deepgram
          // returns 0-indexed integers. "Speaker 1" reads more naturally.
          const label =
            segment.speaker !== null ? `Speaker ${segment.speaker + 1}` : null;
          return (
            <div key={idx} className="flex gap-2">
              {label && (
                <span className="shrink-0 font-semibold text-primary/80">
                  {label}:
                </span>
              )}
              <span>{segment.text}</span>
            </div>
          );
        })}
        {interim && !isEnded && (
          <div className="italic text-muted-foreground">
            {interim}
            <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
          </div>
        )}
        {!interim && finals.length > 0 && !isEnded && (
          <span className="ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-foreground/60 align-middle" />
        )}
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
      <div className="h-full flex flex-col items-center justify-center gap-3 text-center">
        <p className="text-xs italic text-muted-foreground px-4">
          Listening… transcript will appear after processing
        </p>
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
