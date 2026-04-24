import { useState, useRef, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, ListTodo, BarChart3, Bot, StickyNote, Users, Download, Share2, Mail, Plus, Trash2, CheckCircle2, Circle, Pencil, ArrowRightCircle, Upload, Loader2, Info } from "lucide-react";
import { BackendRuntimeNotice } from "@/components/common/BackendRuntimeNotice";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES } from "@/lib/languages";
import { useMeetingDetail } from "@/hooks/useMeetingDetail";
import { useActionItems } from "@/hooks/useActionItems";
import { useBackendRuntimeStatus } from "@/hooks/use-backend-runtime-status";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { buildPublicAppUrl, getPublicAppBaseUrl, hasConfiguredPublicAppUrl, openExternalUrl } from "@/lib/app-shell";
import { generateMeetingPdf } from "@/lib/meeting-pdf";
import { startSessionProcessing } from "@/lib/session-processing";

type DiarizedSegment = {
  speaker?: string;
  text?: string;
  start?: number;
  end?: number;
};

type SummaryPayload = {
  executive_summary?: string;
  key_points?: string[];
  action_items?: Array<{ task?: string; owner?: string; deadline?: string; confidence?: number }>;
  decisions?: string[];
  follow_ups?: string[];
  speaker_breakdown?: Array<{ speaker?: string; contribution?: string }>;
  mom?: {
    title?: string;
    overview?: string;
    agenda?: string[] | string;
    discussion?: string[] | string;
    decisions?: string[] | string;
    action_items?: string[] | string;
    next_steps?: string[] | string;
  };
  language?: string;
};

import { resolveBackendUrl, getBackendCandidates } from "@/lib/backend-url";

const BACKEND_URL = resolveBackendUrl();
const ACCEPTED_MEDIA_MIME = "audio/*,video/*";
const COMMON_MEDIA_EXTENSIONS = new Set([
  "mp3", "wav", "mp4", "webm", "m4a", "aac", "flac", "ogg", "oga", "opus", "wma",
  "mov", "avi", "mkv", "m4v", "3gp", "3g2", "amr", "aiff", "au", "ts",
]);

function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const rawMessage = String((error as { message: unknown }).message ?? "");
    if (rawMessage.toLowerCase().includes("failed to fetch")) {
      return "Backend is unreachable. Start backend on port 8002 and retry processing.";
    }
    if (rawMessage.toLowerCase().includes("maximum allowed size")) {
      return "Upload rejected by storage size limit. Increase the 'meeting-files' bucket file size limit or your Supabase project storage plan limit.";
    }
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

function isAudioOrVideoFile(file: File): boolean {
  if (file.type.startsWith("audio/") || file.type.startsWith("video/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && COMMON_MEDIA_EXTENSIONS.has(extension));
}

function parseStorageRef(storageRef: string): { bucket: string; path: string } | null {
  if (!storageRef) return null;
  if (storageRef.startsWith("http://") || storageRef.startsWith("https://")) {
    try {
      const url = new URL(storageRef);
      const segments = url.pathname.split("/").filter(Boolean);
      const objectIdx = segments.indexOf("object");
      if (objectIdx >= 0 && segments.length > objectIdx + 2) {
        const bucket = segments[objectIdx + 2];
        const path = segments.slice(objectIdx + 3).join("/");
        if (bucket && path) return { bucket, path };
      }
    } catch {
      return null;
    }
    return null;
  }
  const slashIdx = storageRef.indexOf("/");
  if (slashIdx <= 0 || slashIdx === storageRef.length - 1) return null;
  return {
    bucket: storageRef.slice(0, slashIdx),
    path: storageRef.slice(slashIdx + 1),
  };
}

function formatTime(seconds?: number) {
  if (typeof seconds !== "number" || Number.isNaN(seconds)) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function extractSegments(session: any): DiarizedSegment[] {
  const analytics =
    typeof session?.analytics_data === "string"
      ? (() => {
          try {
            return JSON.parse(session.analytics_data);
          } catch {
            return {};
          }
        })()
      : session?.analytics_data ?? {};

  const fromAnalytics =
    analytics?.transcript_segments ??
    analytics?.transcriptSegments ??
    session?.transcript_segments;

  if (Array.isArray(fromAnalytics)) return fromAnalytics;

  const transcript = typeof session?.transcript === "string" ? session.transcript : "";
  if (transcript) {
    const parsed = parseSegmentsFromTranscript(transcript);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function parseSegmentsFromTranscript(transcript: string): DiarizedSegment[] {
  const lines = transcript
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];

  const segments: DiarizedSegment[] = [];
  const singleTimePattern = /^\[(\d{2}):(\d{2})\]\s+([^:]+):\s*(.+)$/;
  const rangePattern = /^\[(\d{2}):(\d{2})-(\d{2}):(\d{2})\]\s+([^:]+):\s*(.+)$/;
  for (const line of lines) {
    const singleMatch = line.match(singleTimePattern);
    if (singleMatch) {
      const [, sm, ss, speaker, text] = singleMatch;
      const start = Number(sm) * 60 + Number(ss);
      segments.push({
        speaker: speaker.trim(),
        text: text.trim(),
        start,
        end: start,
      });
      continue;
    }

    const rangeMatch = line.match(rangePattern);
    if (!rangeMatch) continue;
    const [, sm, ss, em, es, speaker, text] = rangeMatch;
    const start = Number(sm) * 60 + Number(ss);
    const end = Number(em) * 60 + Number(es);
    segments.push({
      speaker: speaker.trim(),
      text: text.trim(),
      start,
      end,
    });
  }
  return segments;
}

function InlineEditNote({
  note,
  onSave,
  onDelete,
  onConvertToAction,
}: {
  note: { id: string; content: string; updated_at: string };
  onSave: (noteId: string, content: string) => void;
  onDelete: (noteId: string) => void;
  onConvertToAction: (content: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  const handleSave = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (trimmed !== note.content) {
      onSave(note.id, trimmed);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="glass rounded-lg p-3 space-y-2">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSave(); }
            if (e.key === "Escape") { setValue(note.content); setEditing(false); }
          }}
          className="min-h-[60px] text-sm"
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => { setValue(note.content); setEditing(false); }}>Cancel</Button>
          <Button size="sm" onClick={handleSave}>Save</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-4 group relative">
      <p className="text-sm cursor-pointer" onClick={() => setEditing(true)}>{note.content}</p>
      <p className="text-xs text-muted-foreground mt-2">{new Date(note.updated_at).toLocaleString()}</p>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={() => onConvertToAction(note.content)} title="Convert to action item">
          <ArrowRightCircle className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </button>
        <button onClick={() => setEditing(true)} title="Edit">
          <Pencil className="h-4 w-4 text-muted-foreground hover:text-primary transition-colors" />
        </button>
        <button onClick={() => { onDelete(note.id); toast.success("Note deleted"); }} title="Delete">
          <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
        </button>
      </div>
    </div>
  );
}

export default function MeetingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { status: backendRuntimeStatus, retry: retryBackend } = useBackendRuntimeStatus();
  const { meetingQuery, sessionsQuery, notesQuery, aiChatsQuery, participantsQuery, addNote, updateNote, deleteNote, addAiChat, addParticipant, updateSession } = useMeetingDetail(id);
  const { actionItemsQuery, createActionItem, toggleActionItem, deleteActionItem } = useActionItems();
  const [noteContent, setNoteContent] = useState("");
  const [partName, setPartName] = useState("");
  const [partEmail, setPartEmail] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [newActionTitle, setNewActionTitle] = useState("");
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [uploadLanguage, setUploadLanguage] = useState<string>("");
  const [langReminderVisible, setLangReminderVisible] = useState(false);
  const [langReminderAcknowledged, setLangReminderAcknowledged] = useState(false);
  const [langSelectOpen, setLangSelectOpen] = useState(false);
  const [transcriptDraft, setTranscriptDraft] = useState("");
  const [summaryDraft, setSummaryDraft] = useState<SummaryPayload>({});
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [shareLink, setShareLink] = useState("");
  const [sharingBusy, setSharingBusy] = useState(false);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [shareMode, setShareMode] = useState<"private" | "public">("private");
  const [publicShareLink, setPublicShareLink] = useState<string | null>(null);
  const [audioPlaybackUrl, setAudioPlaybackUrl] = useState("");
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const aiChatEndRef = useRef<HTMLDivElement>(null);
  const lastSyncedSessionSnapshotRef = useRef<{
    sessionId: string;
    transcript: string;
    summaryJson: string;
  } | null>(null);

  const meeting = meetingQuery.data;
  const latestSession: any = sessionsQuery.data?.[0];
  const meetingActions = (actionItemsQuery.data ?? []).filter((a) => a.meeting_id === id);
  const hasUploadedAudio = (sessionsQuery.data ?? []).some((session: any) => Boolean(session?.audio_file_url));
  const latestAudioRef =
    (sessionsQuery.data ?? []).find((session: any) => typeof session?.audio_file_url === "string" && session.audio_file_url.trim().length > 0)?.audio_file_url ?? "";
  const diarizedSegments = latestSession ? extractSegments(latestSession) : [];
  const processingStatus =
    latestSession?.processing_status ??
    latestSession?.analytics_data?.processing_status?.status ??
    "idle";
  const processingMessage =
    latestSession?.processing_message ??
    latestSession?.analytics_data?.processing_status?.message ??
    "";
  const processingProgress =
    latestSession?.processing_progress ??
    latestSession?.analytics_data?.processing_status?.progress ??
    0;
  const latestSummary: SummaryPayload = (() => {
    const raw = latestSession?.summary;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return raw as SummaryPayload;
  })();

  useEffect(() => {
    aiChatEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [aiChatsQuery.data?.length, aiLoading]);

  useEffect(() => {
    if (!latestSession?.id) return;
    const nextTranscript = latestSession.transcript ?? "";
    const nextSummary = latestSummary ?? {};
    const nextSummaryJson = JSON.stringify(nextSummary);
    const previous = lastSyncedSessionSnapshotRef.current;

    const serverDataChanged =
      !previous ||
      previous.sessionId !== latestSession.id ||
      previous.transcript !== nextTranscript ||
      previous.summaryJson !== nextSummaryJson;

    if (!serverDataChanged) return;

    lastSyncedSessionSnapshotRef.current = {
      sessionId: latestSession.id,
      transcript: nextTranscript,
      summaryJson: nextSummaryJson,
    };
    setTranscriptDraft(nextTranscript);
    setSummaryDraft(nextSummary);
  }, [latestSession?.id, latestSession?.transcript, latestSummary]);

  useEffect(() => {
    let cancelled = false;
    const resolveAudioUrl = async () => {
      if (!latestAudioRef) {
        setAudioPlaybackUrl("");
        return;
      }
      // R2-stored audio: fetch presigned URL from backend
      if (latestAudioRef.startsWith("r2:")) {
        const session = (sessionsQuery.data ?? []).find(
          (s: any) => s.audio_file_url === latestAudioRef
        );
        if (!session) return;
        try {
          const { data: authData } = await supabase.auth.getSession();
          const token = authData.session?.access_token;
          if (!token) return;
          const res = await fetch(`${BACKEND_URL}/sessions/${session.id}/audio-url`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cancelled) return;
          if (res.ok) {
            const { url } = await res.json();
            setAudioPlaybackUrl(url);
          }
        } catch {
          // silently fail — audio player will show error state
        }
        return;
      }
      const parsed = parseStorageRef(latestAudioRef);
      if (!parsed) {
        setAudioPlaybackUrl(latestAudioRef);
        return;
      }
      const { data, error } = await supabase.storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.path, 60 * 60);
      if (cancelled) return;
      if (error || !data?.signedUrl) {
        const fallback = supabase.storage.from(parsed.bucket).getPublicUrl(parsed.path).data.publicUrl;
        setAudioPlaybackUrl(fallback ?? "");
        return;
      }
      setAudioPlaybackUrl(data.signedUrl);
    };
    void resolveAudioUrl();
    return () => {
      cancelled = true;
    };
  }, [latestAudioRef]);

  if (meetingQuery.isLoading) {
    return <div className="space-y-4"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  if (!meeting) {
    return <div className="text-center py-12 text-muted-foreground">Meeting not found.</div>;
  }

  const handleAddNote = async () => {
    if (!noteContent.trim()) return;
    await addNote.mutateAsync(noteContent.trim());
    setNoteContent("");
    toast.success("Note added!");
  };

  const handleAddParticipant = async () => {
    if (!partName.trim()) return;
    await addParticipant.mutateAsync({ name: partName.trim(), email: partEmail.trim() || undefined });
    setPartName("");
    setPartEmail("");
    toast.success("Participant added!");
  };

  const handleMeetingAudioUpload = async (file: File) => {
    if (!id || !user) return;
    if (!uploadLanguage) {
      toast.error("Please select the audio language before uploading.");
      return;
    }
    if (!isAudioOrVideoFile(file)) {
      toast.error("Please upload an audio or video file.");
      return;
    }
    setUploadingAudio(true);
    try {
      const filePath = `${user.id}/${id}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("meeting-files")
        .upload(filePath, file);
      if (uploadError) throw uploadError;

      const audioStorageRef = `meeting-files/${filePath}`;
      const { data: createdSession, error: sessionError } = await supabase
        .from("sessions")
        .insert({
          meeting_id: id,
          audio_file_url: audioStorageRef,
          language_detected: uploadLanguage,
        })
        .select("id")
        .single();
      if (sessionError) throw sessionError;

      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Authentication session missing. Please log in again.");

      await startSessionProcessing(createdSession.id, accessToken);
      await sessionsQuery.refetch();
      toast.success("Audio uploaded and processing started.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Upload failed"));
    } finally {
      setUploadingAudio(false);
    }
  };

  const handleRetryProcessing = async () => {
    if (!latestSession?.id) return;
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Authentication session missing. Please log in again.");
      await startSessionProcessing(latestSession.id, accessToken);
      toast.success("Reprocessing started.");
      await sessionsQuery.refetch();
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to retry processing"));
    }
  };

  const handleAskAi = async () => {
    const question = aiMessage.trim();
    if (!id || !question) return;
    setAiLoading(true);
    try {
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Authentication session missing. Please log in again.");
      if (!latestSession?.id) throw new Error("No processed session found for this meeting yet.");

      let lastError = "Failed to get AI answer";
      let answer = "";
      for (const candidate of getBackendCandidates(BACKEND_URL)) {
        try {
          const resp = await fetch(`${candidate}/sessions/${latestSession.id}/ask`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ question }),
          });
          if (!resp.ok) {
            const body = await resp.text();
            lastError = body || `Backend ${candidate} responded with ${resp.status}`;
            continue;
          }
          const payload = await resp.json();
          answer = payload?.answer ?? "";
          break;
        } catch (error) {
          lastError = getErrorMessage(error, `Could not reach backend at ${candidate}`);
        }
      }
      if (!answer) throw new Error(lastError);
      await addAiChat.mutateAsync({ question, answer, sessionId: latestSession.id });
      setAiMessage("");
    } catch (error) {
      toast.error(getErrorMessage(error, "AI Q&A failed"));
    } finally {
      setAiLoading(false);
    }
  };

  const persistTranscript = async (nextTranscript: string) => {
    if (!latestSession?.id) return;
    if ((latestSession.transcript ?? "") === nextTranscript) return;
    try {
      await updateSession.mutateAsync({ sessionId: latestSession.id, transcript: nextTranscript });
    } catch {
      toast.error("Failed to save transcript edits");
    }
  };

  const persistSummary = async (nextSummary: SummaryPayload) => {
    if (!latestSession?.id) return;
    if (JSON.stringify(latestSummary ?? {}) === JSON.stringify(nextSummary)) return;
    try {
      await updateSession.mutateAsync({ sessionId: latestSession.id, summary: nextSummary as Record<string, any> });
    } catch {
      toast.error("Failed to save summary edits");
    }
  };

  const updateSummaryListItem = async (key: "key_points" | "decisions" | "follow_ups", idx: number, value: string) => {
    const current = Array.isArray(summaryDraft[key]) ? [...(summaryDraft[key] as string[])] : [];
    current[idx] = value;
    const nextSummary: SummaryPayload = { ...summaryDraft, [key]: current };
    setSummaryDraft(nextSummary);
    await persistSummary(nextSummary);
  };

  const updateMomField = async (key: "overview" | "agenda" | "discussion" | "decisions" | "action_items" | "next_steps", value: string) => {
    const nextSummary: SummaryPayload = {
      ...summaryDraft,
      mom: {
        ...(summaryDraft.mom ?? {}),
        [key]: value,
      },
    };
    setSummaryDraft(nextSummary);
    await persistSummary(nextSummary);
  };

  const createShareLink = async () => {
    if (shareLink) return shareLink;
    if (!id) throw new Error("Missing meeting id");
    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) throw new Error("Authentication session missing. Please log in again.");

    let lastError = "Could not create share link";
    for (const candidate of getBackendCandidates(BACKEND_URL)) {
      try {
        const response = await fetch(`${candidate}/meetings/${id}/share-link`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        });
        if (!response.ok) {
          const body = await response.text();
          lastError = body || `Backend ${candidate} responded with ${response.status}`;
          continue;
        }
        const payload = (await response.json()) as { path?: string; token?: string };
        const path = payload.path ?? (payload.token ? `/shared/${payload.token}` : "");
        if (!path) {
          lastError = "Backend returned an invalid share link payload";
          continue;
        }
        const absolute = buildPublicAppUrl(path);
        setShareLink(absolute);
        return absolute;
      } catch (error) {
        lastError = getErrorMessage(error, `Could not reach backend at ${candidate}`);
      }
    }
    throw new Error(lastError);
  };

  const handleGeneratePdf = async () => {
    try {
      generateMeetingPdf({
        title: meeting.title,
        id: meeting.id,
        createdAt: meeting.created_at,
        transcript: transcriptDraft,
        summary: summaryDraft,
        meetingActions: meetingActions.map((a) => ({ title: a.title, is_completed: a.is_completed })),
      });
      toast.success("PDF generated.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to generate PDF"));
    }
  };

  const handleOpenShareDialog = async () => {
    if (!meeting) return;
    // Private link = current meeting page (requires login)
    const privateUrl = buildPublicAppUrl(`/dashboard/meetings/${meeting.id}`);
    setShareLink(privateUrl);
    setShareMode("private");
    setShareDialogOpen(true);
  };

  const handleCreatePublicLink = async () => {
    if (!meeting || !user) return;
    // If already created, just switch to it
    if (publicShareLink) {
      setShareMode("public");
      return;
    }
    setSharingBusy(true);
    try {
      // Build snapshot of current meeting data
      const snapshot = {
        meeting_title: meeting.title,
        created_at: meeting.created_at,
        transcript: transcriptDraft || null,
        summary: Object.keys(summaryDraft).length > 0 ? summaryDraft : null,
        action_items: meetingActions.map((a) => ({ id: a.id, title: a.title, is_completed: a.is_completed })),
      };

      // Generate a random token
      const token = crypto.randomUUID().replace(/-/g, "");

      const { error } = await supabase.from("meeting_shares").insert({
        meeting_id: meeting.id,
        created_by: user.id,
        token,
        is_revoked: false,
        snapshot,
      });

      if (error) throw error;

      const publicUrl = buildPublicAppUrl(`/shared/${token}`);
      setPublicShareLink(publicUrl);
      setShareMode("public");
    } catch (err) {
      const msg = err instanceof Error ? err.message : (typeof err === "object" && err !== null && "message" in err ? String((err as any).message) : "Failed to create public link");
      toast.error(`Failed to create public link: ${msg}`);
      console.error("Share link error:", err);
    } finally {
      setSharingBusy(false);
    }
  };

  const getActiveShareUrl = () => shareMode === "public" && publicShareLink ? publicShareLink : shareLink;

  const handleNativeShare = async () => {
    try {
      const url = getActiveShareUrl();
      if (!url || !meeting) return;
      if (navigator.share) {
        await navigator.share({
          title: `WrapUp Meeting: ${meeting.title}`,
          text: `View meeting transcript and summary: ${meeting.title}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to share"));
    }
  };

  const handleCopyShareLink = async () => {
    try {
      const url = getActiveShareUrl();
      if (!url) return;
      await navigator.clipboard.writeText(url);
      toast.success("Link copied to clipboard.");
    } catch (error) {
      toast.error(getErrorMessage(error, "Failed to copy link"));
    }
  };

  const openSocialShare = (platform: "whatsapp" | "facebook" | "telegram" | "messenger") => {
    const url = getActiveShareUrl();
    if (!url || !meeting) return;
    const encodedUrl = encodeURIComponent(url);
    const encodedText = encodeURIComponent(`WrapUp meeting: ${meeting.title}`);
    const destination =
      platform === "whatsapp"
        ? `https://wa.me/?text=${encodedText}%20${encodedUrl}`
        : platform === "facebook"
          ? `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`
          : platform === "telegram"
            ? `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`
            : `fb-messenger://share/?link=${encodedUrl}`;
    void openExternalUrl(destination);
  };

  const handleOpenEmailDialog = async () => {
    if (!meeting) return;
    setEmailDialogOpen(true);
  };

  const buildEmailBody = (): string => {
    if (!meeting) return "";
    const lines: string[] = [];
    lines.push(`Meeting: ${meeting.title}`);
    lines.push(`Date: ${new Date(meeting.created_at).toLocaleString()}`);
    lines.push("");

    const toTextList = (value?: string[] | string): string[] => {
      if (Array.isArray(value)) return value.map((s) => s.trim()).filter(Boolean);
      if (typeof value === "string") return value.split(/\s*\|\s*|\n+/).map((s) => s.trim()).filter(Boolean);
      return [];
    };

    if (summaryDraft.executive_summary) {
      lines.push("--- SUMMARY ---");
      lines.push(summaryDraft.executive_summary);
      lines.push("");
    }

    const keyPoints = toTextList(summaryDraft.key_points);
    if (keyPoints.length > 0) {
      lines.push("Key Points:");
      keyPoints.forEach((p) => lines.push(`  - ${p}`));
      lines.push("");
    }

    const decisions = toTextList(summaryDraft.decisions);
    if (decisions.length > 0) {
      lines.push("Decisions:");
      decisions.forEach((d) => lines.push(`  - ${d}`));
      lines.push("");
    }

    const followUps = toTextList(summaryDraft.follow_ups);
    if (followUps.length > 0) {
      lines.push("Follow-ups:");
      followUps.forEach((f) => lines.push(`  - ${f}`));
      lines.push("");
    }

    if (meetingActions.length > 0) {
      lines.push("--- ACTION ITEMS ---");
      meetingActions.forEach((a) => lines.push(`  [${a.is_completed ? "x" : " "}] ${a.title}`));
      lines.push("");
    }

    if (transcriptDraft) {
      lines.push("--- TRANSCRIPT ---");
      lines.push(transcriptDraft.slice(0, 3000) + (transcriptDraft.length > 3000 ? "\n[truncated...]" : ""));
      lines.push("");
    }

    lines.push("Shared via WrapUp AI");
    return lines.join("\n");
  };

  const handleSendEmail = () => {
    if (!emailRecipient.trim()) {
      toast.error("Please enter an email address.");
      return;
    }
    if (!meeting) return;
    const subject = encodeURIComponent(`Meeting notes: ${meeting.title}`);
    const body = encodeURIComponent(buildEmailBody());
    const mailto = `mailto:${encodeURIComponent(emailRecipient.trim())}?subject=${subject}&body=${body}`;
    void openExternalUrl(mailto);
    setEmailDialogOpen(false);
    toast.success("Opening your email client...");
  };

  return (
    <div className="space-y-6">
      {/* Language reminder modal */}
      {langReminderVisible && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-sky-400 bg-white dark:bg-gray-900 shadow-2xl shadow-sky-200/30 dark:shadow-sky-900/40 p-6 flex flex-col gap-4">
            <div className="flex gap-3 items-start">
              <Info className="h-5 w-5 text-sky-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-sky-800 dark:text-sky-300 mb-1">Language matters for accuracy</p>
                <p className="text-sm text-sky-700 dark:text-sky-400 leading-relaxed">
                  Select the exact language spoken in your recording. An incorrect or mismatched language will cause the transcription and summary to be inaccurate or in the wrong language.
                </p>
              </div>
            </div>
            <button
              className="self-end text-sm font-semibold px-5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white transition-colors"
              onClick={() => {
                setLangReminderVisible(false);
                setLangReminderAcknowledged(true);
                setLangSelectOpen(true);
              }}
            >
              OK, got it
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" asChild>
          <Link to={meeting.scheduled_at && new Date(meeting.scheduled_at) >= new Date() ? "/dashboard/upcoming" : "/dashboard/meetings"}><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-xl font-bold">{meeting.title}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(meeting.created_at).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </p>
          {meeting.scheduled_at && (
            <p className="text-xs text-primary mt-1">
              📅 Scheduled: {new Date(meeting.scheduled_at).toLocaleDateString()} at {new Date(meeting.scheduled_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>

      <BackendRuntimeNotice
        status={backendRuntimeStatus}
        onRetry={() => void retryBackend()}
      />

      {audioPlaybackUrl && (
        <div className="glass rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium">Meeting Audio</p>
          <audio controls preload="metadata" className="w-full" src={audioPlaybackUrl}>
            Your browser does not support the audio element.
          </audio>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap">
        {!hasUploadedAudio && (
          <>
            <input
              ref={uploadInputRef}
              type="file"
              accept={ACCEPTED_MEDIA_MIME}
              className="hidden"
              onChange={(e) => {
                const selectedFile = e.target.files?.[0];
                if (!selectedFile) return;
                void handleMeetingAudioUpload(selectedFile);
                e.target.value = "";
              }}
            />
            <div className="relative flex items-center gap-2">
              <Select
                value={uploadLanguage}
                onValueChange={(val) => { setUploadLanguage(val); setLangSelectOpen(false); }}
                open={langSelectOpen}
                onOpenChange={(open) => {
                  if (open && !langReminderAcknowledged) {
                    setLangReminderVisible(true);
                  } else {
                    setLangSelectOpen(open);
                  }
                }}
              >
                <SelectTrigger className="h-8 text-xs w-44 border-2 border-sky-500 shadow-[0_0_8px_2px_rgba(14,165,233,0.5)] hover:border-sky-400 hover:bg-sky-500/10 hover:text-sky-600 hover:shadow-[0_0_12px_3px_rgba(56,189,248,0.8)] focus:shadow-[0_0_12px_3px_rgba(14,165,233,0.7)]">
                  <SelectValue placeholder="Select language *" />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code} className="focus:bg-sky-500/15 focus:text-sky-700">{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="sm"
                disabled={uploadingAudio || !uploadLanguage}
                onClick={() => uploadInputRef.current?.click()}
                title={!uploadLanguage ? "Select a language first" : undefined}
                className="border-2 border-emerald-500 shadow-[0_0_8px_2px_rgba(16,185,129,0.5)] hover:border-emerald-400 hover:bg-emerald-500/10 hover:text-emerald-600 hover:shadow-[0_0_12px_3px_rgba(52,211,153,0.8)] disabled:shadow-none disabled:border-border disabled:hover:bg-transparent disabled:hover:text-inherit"
              >
                {uploadingAudio ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                {uploadingAudio ? "Uploading..." : "Upload"}
              </Button>
            </div>
          </>
        )}
        {hasUploadedAudio && (
          <Button variant="outline" size="sm" disabled>
            <CheckCircle2 className="h-3.5 w-3.5 mr-1 text-emerald-500" /> Uploaded
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={() => void handleGeneratePdf()}>
          <Download className="h-3.5 w-3.5 mr-1" /> Generate PDF
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleOpenShareDialog()} disabled={sharingBusy}>
          <Share2 className="h-3.5 w-3.5 mr-1" /> Share
        </Button>
        <Button variant="outline" size="sm" onClick={() => void handleOpenEmailDialog()} disabled={sharingBusy}>
          <Mail className="h-3.5 w-3.5 mr-1" /> Send via Email
        </Button>
      </div>

      <Dialog open={shareDialogOpen} onOpenChange={(open) => { setShareDialogOpen(open); if (!open) setShareMode("private"); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share meeting</DialogTitle>
            <DialogDescription>Only messages up to this point will be shared.</DialogDescription>
          </DialogHeader>

          {/* Mode selector */}
          <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
            {/* Keep private */}
            <button
              type="button"
              className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${shareMode === "private" ? "bg-muted/60" : "hover:bg-muted/30"}`}
              onClick={() => setShareMode("private")}
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Keep private</p>
                <p className="text-xs text-muted-foreground">Only you have access</p>
              </div>
              {shareMode === "private" && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>

            {/* Create public link */}
            <button
              type="button"
              className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${shareMode === "public" ? "bg-muted/60" : "hover:bg-muted/30"}`}
              onClick={() => void handleCreatePublicLink()}
              disabled={sharingBusy}
            >
              <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold">Create public link</p>
                <p className="text-xs text-muted-foreground">Anyone with the link can view</p>
              </div>
              {sharingBusy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              {shareMode === "public" && !sharingBusy && <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
            </button>
          </div>

          {/* Show the active link */}
          {shareMode === "public" && publicShareLink && (
            <div className="space-y-2">
              <Input value={publicShareLink} readOnly className="text-xs" />
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" variant="outline" onClick={() => void handleCopyShareLink()}>Copy Link</Button>
                <Button size="sm" variant="outline" onClick={() => void handleNativeShare()}>Other Apps</Button>
                <Button size="sm" variant="outline" onClick={() => openSocialShare("whatsapp")}>WhatsApp</Button>
                <Button size="sm" variant="outline" onClick={() => openSocialShare("telegram")}>Telegram</Button>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Don't share personal information or third-party content without permission.
          </p>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShareDialogOpen(false)}>Cancel</Button>
            {shareMode === "private" ? (
              <Button onClick={() => void handleCopyShareLink()}>
                Copy private link
              </Button>
            ) : (
              <Button onClick={() => void handleCopyShareLink()} disabled={!publicShareLink}>
                Copy public link
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send Meeting via Email</DialogTitle>
            <DialogDescription>
              Enter the recipient's email address. Your default email client will open with the meeting summary, action items, and transcript pre-filled.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Label htmlFor="email-recipient">Recipient Email</Label>
            <Input
              id="email-recipient"
              type="email"
              placeholder="recipient@example.com"
              value={emailRecipient}
              onChange={(e) => setEmailRecipient(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSendEmail(); }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSendEmail}><Mail className="h-3.5 w-3.5 mr-1" /> Open Email Client</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Tabs defaultValue="transcript" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="transcript"><FileText className="h-3.5 w-3.5 mr-1" /> Transcript</TabsTrigger>
          <TabsTrigger value="summary"><ListTodo className="h-3.5 w-3.5 mr-1" /> Summary</TabsTrigger>
          <TabsTrigger value="actions"><ListTodo className="h-3.5 w-3.5 mr-1" /> Actions</TabsTrigger>
          <TabsTrigger value="analytics"><BarChart3 className="h-3.5 w-3.5 mr-1" /> Analytics</TabsTrigger>
          <TabsTrigger value="ask-ai"><Bot className="h-3.5 w-3.5 mr-1" /> Ask AI</TabsTrigger>
          <TabsTrigger value="notes"><StickyNote className="h-3.5 w-3.5 mr-1" /> Notes</TabsTrigger>
          <TabsTrigger value="participants"><Users className="h-3.5 w-3.5 mr-1" /> Participants</TabsTrigger>
        </TabsList>

        <TabsContent value="transcript" className="mt-4">
          <div className="glass rounded-xl p-6 min-h-[200px] text-sm">
            {latestSession?.transcript ? (
              <div className="space-y-4">
                {diarizedSegments.length > 0 ? (
                  <div className="space-y-2">
                    {transcriptDraft.split("\n").map((line, idx) => {
                      const match = line.match(/^\[(\d{2}:\d{2})(?:-\d{2}:\d{2})?\]\s+([^:]+):\s*(.*)$/);
                      if (!match) {
                        return (
                          <p
                            key={`line-${idx}`}
                            className="whitespace-pre-wrap text-foreground"
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => {
                              const lines = transcriptDraft.split("\n");
                              lines[idx] = e.currentTarget.textContent ?? "";
                              const next = lines.join("\n");
                              setTranscriptDraft(next);
                              void persistTranscript(next);
                            }}
                          >
                            {line}
                          </p>
                        );
                      }
                      const [, time, speaker, text] = match;
                      return (
                        <p
                          key={`line-${idx}`}
                          className="whitespace-pre-wrap text-foreground"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => {
                            const lines = transcriptDraft.split("\n");
                            lines[idx] = e.currentTarget.textContent ?? "";
                            const next = lines.join("\n");
                            setTranscriptDraft(next);
                            void persistTranscript(next);
                          }}
                        >
                          <span className="text-muted-foreground">[{time}] </span>
                          <span className="font-medium">{speaker}:</span>{" "}
                          <span>{text}</span>
                        </p>
                      );
                    })}
                  </div>
                ) : (
                  <pre
                    className="text-left whitespace-pre-wrap text-foreground"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const next = e.currentTarget.textContent ?? "";
                      setTranscriptDraft(next);
                      void persistTranscript(next);
                    }}
                  >
                    {transcriptDraft}
                  </pre>
                )}
              </div>
            ) : processingStatus === "queued" || processingStatus === "processing" ? (
              <div className="space-y-3 text-center">
                <p className="text-muted-foreground">Transcription in progress...</p>
                <p className="text-xs text-muted-foreground">{processingMessage || "Processing audio with Deepgram"}</p>
                <p className="text-xs text-primary">Progress: {processingProgress}%</p>
              </div>
            ) : processingStatus === "failed" ? (
              <div className="space-y-3 text-center">
                <p className="text-muted-foreground">Transcription failed.</p>
                <p className="text-xs text-muted-foreground">{latestSession?.processing_error || "Something went wrong while processing audio."}</p>
                <Button variant="outline" size="sm" onClick={() => void handleRetryProcessing()}>
                  Retry Transcription
                </Button>
              </div>
            ) : (
              <p className="text-center text-muted-foreground">Transcript will appear here after processing.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="summary" className="mt-4">
          <div className="glass rounded-xl p-6 min-h-[200px] text-sm space-y-5">
            {latestSummary?.executive_summary ? (
              <>
                <div>
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Executive Summary</p>
                  <p
                    className="text-foreground whitespace-pre-wrap"
                    contentEditable
                    suppressContentEditableWarning
                    onBlur={(e) => {
                      const nextSummary: SummaryPayload = {
                        ...summaryDraft,
                        executive_summary: e.currentTarget.textContent ?? "",
                      };
                      setSummaryDraft(nextSummary);
                      void persistSummary(nextSummary);
                    }}
                  >
                    {summaryDraft.executive_summary ?? ""}
                  </p>
                </div>
                {Array.isArray(summaryDraft.key_points) && summaryDraft.key_points.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Key Points</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {summaryDraft.key_points.map((point, idx) => (
                        <li
                          key={`kp-${idx}`}
                          className="text-foreground"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => void updateSummaryListItem("key_points", idx, e.currentTarget.textContent ?? "")}
                        >
                          {point}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(summaryDraft.decisions) && summaryDraft.decisions.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Decisions</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {summaryDraft.decisions.map((decision, idx) => (
                        <li
                          key={`dc-${idx}`}
                          className="text-foreground"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => void updateSummaryListItem("decisions", idx, e.currentTarget.textContent ?? "")}
                        >
                          {decision}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {Array.isArray(summaryDraft.follow_ups) && summaryDraft.follow_ups.length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Follow-ups</p>
                    <ul className="list-disc pl-5 space-y-1">
                      {summaryDraft.follow_ups.map((item, idx) => (
                        <li
                          key={`fu-${idx}`}
                          className="text-foreground"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => void updateSummaryListItem("follow_ups", idx, e.currentTarget.textContent ?? "")}
                        >
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {summaryDraft.mom && Object.keys(summaryDraft.mom).length > 0 && (
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">Structured MoM</p>
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      {summaryDraft.mom.title && <p className="font-medium">{summaryDraft.mom.title}</p>}
                      {summaryDraft.mom.overview && (
                        <p
                          className="text-foreground"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={(e) => void updateMomField("overview", e.currentTarget.textContent ?? "")}
                        >
                          {summaryDraft.mom.overview}
                        </p>
                      )}
                      {summaryDraft.mom.agenda && (
                        <p className="text-foreground">
                          <span className="font-medium">Agenda:</span>{" "}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => void updateMomField("agenda", e.currentTarget.textContent ?? "")}
                          >
                            {Array.isArray(summaryDraft.mom.agenda) ? summaryDraft.mom.agenda.join(" | ") : summaryDraft.mom.agenda}
                          </span>
                        </p>
                      )}
                      {summaryDraft.mom.discussion && (
                        <p className="text-foreground">
                          <span className="font-medium">Discussion:</span>{" "}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => void updateMomField("discussion", e.currentTarget.textContent ?? "")}
                          >
                            {Array.isArray(summaryDraft.mom.discussion) ? summaryDraft.mom.discussion.join(" | ") : summaryDraft.mom.discussion}
                          </span>
                        </p>
                      )}
                      {summaryDraft.mom.decisions && (
                        <p className="text-foreground">
                          <span className="font-medium">Decisions:</span>{" "}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => void updateMomField("decisions", e.currentTarget.textContent ?? "")}
                          >
                            {Array.isArray(summaryDraft.mom.decisions) ? summaryDraft.mom.decisions.join(" | ") : summaryDraft.mom.decisions}
                          </span>
                        </p>
                      )}
                      {summaryDraft.mom.action_items && (
                        <p className="text-foreground">
                          <span className="font-medium">Action Items:</span>{" "}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => void updateMomField("action_items", e.currentTarget.textContent ?? "")}
                          >
                            {Array.isArray(summaryDraft.mom.action_items) ? summaryDraft.mom.action_items.join(" | ") : summaryDraft.mom.action_items}
                          </span>
                        </p>
                      )}
                      {summaryDraft.mom.next_steps && (
                        <p className="text-foreground">
                          <span className="font-medium">Next Steps:</span>{" "}
                          <span
                            contentEditable
                            suppressContentEditableWarning
                            onBlur={(e) => void updateMomField("next_steps", e.currentTarget.textContent ?? "")}
                          >
                            {Array.isArray(summaryDraft.mom.next_steps) ? summaryDraft.mom.next_steps.join(" | ") : summaryDraft.mom.next_steps}
                          </span>
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </>
            ) : processingStatus === "queued" || processingStatus === "processing" ? (
              <p className="text-center text-muted-foreground">Summary is being generated with Groq...</p>
            ) : processingStatus === "failed" ? (
              <div className="space-y-3 text-center">
                <p className="text-muted-foreground">Summary generation failed.</p>
                <Button variant="outline" size="sm" onClick={() => void handleRetryProcessing()}>
                  Retry Summary
                </Button>
              </div>
            ) : (
              <p className="text-center text-muted-foreground">Summary will appear here after processing.</p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="actions" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Add an action item..."
              value={newActionTitle}
              onChange={(e) => setNewActionTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newActionTitle.trim() && id) {
                  createActionItem.mutateAsync({ meetingId: id, title: newActionTitle.trim() });
                  setNewActionTitle("");
                  toast.success("Action item added!");
                }
              }}
            />
            <Button
              className="gradient-bg text-primary-foreground"
              disabled={!newActionTitle.trim() || createActionItem.isPending}
              onClick={() => {
                if (newActionTitle.trim() && id) {
                  createActionItem.mutateAsync({ meetingId: id, title: newActionTitle.trim() });
                  setNewActionTitle("");
                  toast.success("Action item added!");
                }
              }}
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>

          {meetingActions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">No action items yet. Add one above.</p>
          ) : (
            meetingActions.map((item) => (
              <div key={item.id} className="glass rounded-lg p-3 flex items-center gap-3 group">
                <button
                  onClick={() => toggleActionItem.mutate({ id: item.id, is_completed: !item.is_completed })}
                  className="shrink-0"
                >
                  {item.is_completed ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground hover:text-primary transition-colors" />
                  )}
                </button>
                <span className={`text-sm flex-1 ${item.is_completed ? "line-through text-muted-foreground" : ""}`}>
                  {item.title}
                </span>
                <button
                  onClick={() => {
                    deleteActionItem.mutate(item.id);
                    toast.success("Action item removed");
                  }}
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive transition-colors" />
                </button>
              </div>
            ))
          )}
        </TabsContent>

        <TabsContent value="analytics" className="mt-4">
          <div className="glass rounded-xl p-6 min-h-[200px] text-center text-muted-foreground text-sm">
            Meeting analytics will appear here (engagement, talk-time, sentiment).
          </div>
        </TabsContent>

        <TabsContent value="ask-ai" className="mt-4">
          <div className="glass rounded-xl p-6 space-y-4">
            <div className="h-[360px] overflow-y-auto border border-border rounded-lg p-4 text-sm space-y-4">
              {(aiChatsQuery.data ?? []).length === 0 && !aiLoading ? (
                <p className="text-muted-foreground">Ask questions about this meeting...</p>
              ) : (
                (aiChatsQuery.data ?? []).map((chat) => (
                  <div key={chat.id} className="space-y-2">
                    <div className="flex justify-end">
                      <div className="max-w-[85%] rounded-xl px-3 py-2 bg-primary text-primary-foreground whitespace-pre-wrap">
                        {chat.question}
                      </div>
                    </div>
                    <div className="flex justify-start">
                      <div className="max-w-[85%] rounded-xl px-3 py-2 bg-muted text-foreground whitespace-pre-wrap">
                        {chat.answer}
                      </div>
                    </div>
                  </div>
                ))
              )}
              {aiLoading && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl px-3 py-2 bg-muted text-muted-foreground">
                    Thinking...
                  </div>
                </div>
              )}
              <div ref={aiChatEndRef} />
            </div>
            <div className="flex gap-2">
              <Input
                placeholder="Type your question..."
                value={aiMessage}
                onChange={e => setAiMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAskAi();
                  }
                }}
              />
              <Button className="gradient-bg text-primary-foreground" onClick={() => void handleAskAi()} disabled={aiLoading || !aiMessage.trim()}>
                {aiLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
                Send
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="notes" className="mt-4 space-y-4">
          <div className="flex gap-2">
            <Textarea placeholder="Add a note..." value={noteContent} onChange={e => setNoteContent(e.target.value)} className="min-h-[80px]" />
            <Button className="gradient-bg text-primary-foreground self-end" onClick={handleAddNote} disabled={addNote.isPending}>Add</Button>
          </div>
          {notesQuery.data?.map((note) => (
            <InlineEditNote
              key={note.id}
              note={note}
              onSave={(noteId, content) => {
                updateNote.mutate({ noteId, content });
                toast.success("Note updated");
              }}
              onDelete={(noteId) => deleteNote.mutate(noteId)}
              onConvertToAction={(content) => {
                if (id) {
                  createActionItem.mutate({ meetingId: id, title: content });
                  toast.success("Converted to action item!");
                }
              }}
            />
          ))}
          {notesQuery.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No notes yet.</p>}
        </TabsContent>

        <TabsContent value="participants" className="mt-4 space-y-4">
          <div className="flex gap-2 flex-wrap">
            <Input placeholder="Name" value={partName} onChange={e => setPartName(e.target.value)} className="max-w-[200px]" />
            <Input placeholder="Email (optional)" value={partEmail} onChange={e => setPartEmail(e.target.value)} className="max-w-[250px]" />
            <Button className="gradient-bg text-primary-foreground" onClick={handleAddParticipant} disabled={addParticipant.isPending}>Add</Button>
          </div>
          {participantsQuery.data?.map((p) => (
            <div key={p.id} className="glass rounded-lg p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-primary-foreground">
                {p.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-medium">{p.name}</p>
                {p.email && <p className="text-xs text-muted-foreground">{p.email}</p>}
              </div>
            </div>
          ))}
          {participantsQuery.data?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No participants added.</p>}
        </TabsContent>
      </Tabs>
    </div>
  );
}
