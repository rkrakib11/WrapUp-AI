import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Upload, FileAudio, FileVideo, Loader2, Check, Info } from "lucide-react";
import { BackendRuntimeNotice } from "@/components/common/BackendRuntimeNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useMeetings } from "@/hooks/useMeetings";
import { useBackendRuntimeStatus } from "@/hooks/use-backend-runtime-status";
import { startSessionProcessing } from "@/lib/session-processing";
import { LANGUAGES } from "@/lib/languages";
import { toast } from "sonner";

const ACCEPTED_MEDIA_MIME = "audio/*,video/*";
const COMMON_MEDIA_EXTENSIONS = new Set([
  "mp3", "wav", "mp4", "webm", "m4a", "aac", "flac", "ogg", "oga", "opus", "wma",
  "mov", "avi", "mkv", "m4v", "3gp", "3g2", "amr", "aiff", "au", "ts",
]);
function getErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const rawMessage = String((error as { message: unknown }).message ?? "");
    if (rawMessage.toLowerCase().includes("failed to fetch")) {
      return "File may be uploaded, but backend is unreachable for processing. Start backend on port 8002 and try again.";
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

export default function UploadPage() {
  const { user } = useAuth();
  const { meetingsQuery, createMeeting } = useMeetings();
  const [searchParams] = useSearchParams();
  const [file, setFile] = useState<File | null>(null);
  const [meetingId, setMeetingId] = useState<string>("");
  const [language, setLanguage] = useState<string>("");
  const [showReminderCard, setShowReminderCard] = useState(false);
  const [reminderAcknowledged, setReminderAcknowledged] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { status: backendRuntimeStatus, retry: retryBackend } = useBackendRuntimeStatus();

  const meetings = meetingsQuery.data ?? [];

  useEffect(() => {
    const meetingIdFromQuery = searchParams.get("meetingId");
    if (!meetingIdFromQuery) return;
    setMeetingId(meetingIdFromQuery);
  }, [searchParams]);

  const handleUpload = async () => {
    if (!file || !user) return;
    if (!isAudioOrVideoFile(file)) {
      toast.error("Please upload an audio or video file.");
      return;
    }

    setUploading(true);
    try {
      let targetMeetingId = meetingId;

      if (!targetMeetingId || targetMeetingId === "new") {
        const meeting = await createMeeting.mutateAsync(file.name.replace(/\.[^.]+$/, ""));
        targetMeetingId = meeting.id;
      }

      const filePath = `${user.id}/${targetMeetingId}/${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from("meeting-files")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Keep bucket/path (not public URL). Backend will generate a signed URL
      // for this private bucket object before sending bytes to Deepgram.
      const audioStorageRef = `meeting-files/${filePath}`;

      const sessionInsert: Record<string, unknown> = {
        meeting_id: targetMeetingId,
        audio_file_url: audioStorageRef,
        language_detected: language,
      };

      const { data: createdSession, error: sessionError } = await supabase
        .from("sessions")
        .insert(sessionInsert)
        .select("id")
        .single();

      if (sessionError) throw sessionError;

      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) {
        throw new Error("Authentication session missing. Please log in again.");
      }

      try {
        await startSessionProcessing(createdSession.id, accessToken);
      } catch {
        setUploaded(true);
        toast.warning(
          "File uploaded, but processing could not start. Backend may be offline. Open meeting details and click Retry Processing.",
        );
        return;
      }

      setUploaded(true);
      toast.success("File uploaded and processing started.");
    } catch (err: unknown) {
      toast.error(getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
    <h1 className="text-2xl font-bold">Upload Recording</h1>
    <div className="flex items-center justify-center min-h-[calc(100vh-320px)]">
    <div className="w-full max-w-xl">
      {/* Language reminder modal */}
      {showReminderCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="mx-4 w-full max-w-sm rounded-xl border border-amber-400 bg-white dark:bg-gray-900 shadow-2xl shadow-amber-200/30 dark:shadow-amber-900/40 p-6 flex flex-col gap-4">
            <div className="flex gap-3 items-start">
              <Info className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-300 mb-1">Language matters for accuracy</p>
                <p className="text-sm text-amber-700 dark:text-amber-400 leading-relaxed">
                  Select the exact language spoken in your recording. An incorrect or mismatched language will cause the transcription and summary to be inaccurate or in the wrong language.
                </p>
              </div>
            </div>
            <button
              className="self-end text-sm font-semibold px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-white transition-colors"
              onClick={() => {
                setShowReminderCard(false);
                setReminderAcknowledged(true);
                setLanguageOpen(true);
              }}
            >
              OK, got it
            </button>
          </div>
        </div>
      )}

      <div className="glass rounded-xl p-6 space-y-5">
        <BackendRuntimeNotice
          status={backendRuntimeStatus}
          onRetry={() => void retryBackend()}
        />

        {/* File drop */}
        <div
          className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-primary transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_MEDIA_MIME}
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setUploaded(false); }}
          />
          {file ? (
            <div className="flex items-center justify-center gap-3">
              {file.type.startsWith("audio") ? <FileAudio className="h-8 w-8 text-primary" /> : <FileVideo className="h-8 w-8 text-primary" />}
              <div className="text-left">
                <p className="text-sm font-medium">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
              </div>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
              <p className="text-sm text-muted-foreground">Click to upload any audio or video file</p>
            </>
          )}
        </div>

        {/* Meeting selection */}
        <div>
          <Label>Attach to meeting (optional)</Label>
          <Select value={meetingId} onValueChange={setMeetingId}>
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Auto-create new meeting" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="new">Create new meeting</SelectItem>
              {meetings.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Language selection (required) */}
        <div className="relative">
          <Label>Audio language <span className="text-destructive">*</span></Label>
          <Select
            value={language}
            onValueChange={(val) => { setLanguage(val); setLanguageOpen(false); }}
            open={languageOpen}
            onOpenChange={(open) => {
              if (open && !reminderAcknowledged) {
                setShowReminderCard(true);
              } else {
                setLanguageOpen(open);
              }
            }}
          >
            <SelectTrigger className="mt-1 border-2 border-amber-500 shadow-[0_0_8px_2px_rgba(245,158,11,0.4)] hover:border-amber-400 hover:bg-amber-500/10 hover:text-amber-700 hover:shadow-[0_0_12px_3px_rgba(251,191,36,0.7)] focus:shadow-[0_0_12px_3px_rgba(245,158,11,0.6)]">
              <SelectValue placeholder="Select language to continue" />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code} className="focus:bg-amber-500/15 focus:text-amber-800 dark:focus:text-amber-300">{l.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-xs text-muted-foreground mt-1">
            Required. Select the language spoken in the recording for accurate transcription.
          </p>
        </div>

        <Button
          className="w-full gradient-bg text-primary-foreground font-semibold"
          disabled={!file || !language || uploading}
          onClick={handleUpload}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : uploaded ? <Check className="h-4 w-4 mr-2" /> : <Upload className="h-4 w-4 mr-2" />}
          {uploading ? "Uploading..." : uploaded ? "Uploaded!" : "Upload & Process"}
        </Button>

        {uploaded && (
          <div className="rounded-lg bg-accent/50 p-4 text-sm text-accent-foreground">
            <p className="font-medium">Processing transcript…</p>
            <p className="text-xs text-muted-foreground mt-1">Open the meeting page to view diarized transcript once ready.</p>
          </div>
        )}
      </div>
    </div>
    </div>
    </div>
  );
}
