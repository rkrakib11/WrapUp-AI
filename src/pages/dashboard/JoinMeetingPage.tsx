import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Mic, MicOff, Phone, PhoneOff, Users, Loader2, Monitor, MonitorOff } from "lucide-react";
import { BackendRuntimeNotice } from "@/components/common/BackendRuntimeNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMeetings } from "@/hooks/useMeetings";
import { useAuth } from "@/hooks/useAuth";
import { useBackendRuntimeStatus } from "@/hooks/use-backend-runtime-status";
import { supabase } from "@/integrations/supabase/client";
import {
  getProcessStartErrorMessage,
  startSessionProcessing,
} from "@/lib/session-processing";
import { toast } from "sonner";

export default function JoinMeetingPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { meetingsQuery, updateMeeting } = useMeetings();
  const { status: backendRuntimeStatus, retry: retryBackend } = useBackendRuntimeStatus();
  const [meetingCode, setMeetingCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const [endingMeeting, setEndingMeeting] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const mixedStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const audioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      micStreamRef.current?.getTracks().forEach((track) => track.stop());
      systemStreamRef.current?.getTracks().forEach((track) => track.stop());
      mixedStreamRef.current?.getTracks().forEach((track) => track.stop());
      micSourceRef.current?.disconnect();
      systemSourceRef.current?.disconnect();
      audioDestinationRef.current = null;
      micSourceRef.current = null;
      systemSourceRef.current = null;
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        void audioContextRef.current.close();
      }
    };
  }, []);

  const selectedMeeting = useMemo(() => {
    if (!id) return null;
    const meetings = meetingsQuery.data ?? [];
    return meetings.find((m) => m.id === id) ?? null;
  }, [id, meetingsQuery.data]);

  const scheduledAt = selectedMeeting?.scheduled_at ? new Date(selectedMeeting.scheduled_at) : null;
  const effectiveEndAt = selectedMeeting
    ? selectedMeeting.actual_ended_at
      ? new Date(selectedMeeting.actual_ended_at)
      : selectedMeeting.scheduled_end_at
      ? new Date(selectedMeeting.scheduled_end_at)
      : selectedMeeting.scheduled_at
      ? new Date(new Date(selectedMeeting.scheduled_at).getTime() + ((selectedMeeting.duration_minutes ?? 30) * 60 * 1000))
      : null
    : null;
  const hasEnded = !!effectiveEndAt && now >= effectiveEndAt;
  const canJoinScheduledMeeting = !!scheduledAt && now >= scheduledAt && !hasEnded;
  const canEndMeetingAsHost = !!selectedMeeting && !!user && selectedMeeting.owner_id === user.id;

  const joinAfterLabel = scheduledAt
    ? `${scheduledAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${scheduledAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  const endAtLabel = effectiveEndAt
    ? `${effectiveEndAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} at ${effectiveEndAt.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}`
    : null;

  const startHostRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Audio recording is not supported in this browser.");
      return;
    }

    const micStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    micStreamRef.current = micStream;

    const audioContext = new AudioContext();
    audioContextRef.current = audioContext;
    const destination = audioContext.createMediaStreamDestination();
    audioDestinationRef.current = destination;
    const micSource = audioContext.createMediaStreamSource(micStream);
    micSourceRef.current = micSource;
    micSource.connect(destination);

    const mixedStream = destination.stream;
    mixedStreamRef.current = mixedStream;

    let recorder: MediaRecorder;
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      recorder = new MediaRecorder(mixedStream, { mimeType: "audio/webm;codecs=opus" });
    } else {
      recorder = new MediaRecorder(mixedStream);
    }
    chunksRef.current = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
    };
    recorderRef.current = recorder;
    recorder.start(1000);
  };

  const stopSystemAudioCapture = () => {
    systemSourceRef.current?.disconnect();
    systemSourceRef.current = null;
    systemStreamRef.current?.getTracks().forEach((track) => track.stop());
    systemStreamRef.current = null;
    setScreenSharing(false);
  };

  const startSystemAudioCapture = async ({ enableScreenShareUi }: { enableScreenShareUi: boolean }) => {
    if (systemSourceRef.current) {
      if (enableScreenShareUi) setScreenSharing(true);
      return;
    }
    if (!audioContextRef.current || !audioDestinationRef.current) {
      throw new Error("Recording is not active.");
    }
    const displayStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    systemStreamRef.current = displayStream;

    const audioTracks = displayStream.getAudioTracks();
    if (audioTracks.length === 0) {
      displayStream.getTracks().forEach((track) => track.stop());
      systemStreamRef.current = null;
      throw new Error("No device/tab audio was shared. Enable Share audio and try again.");
    }

    const audioTrack = audioTracks[0];
    const detach = () => {
      stopSystemAudioCapture();
    };
    audioTrack.onended = detach;
    displayStream.getVideoTracks().forEach((track) => {
      track.onended = detach;
    });

    const systemSource = audioContextRef.current.createMediaStreamSource(new MediaStream([audioTrack]));
    systemSourceRef.current = systemSource;
    systemSource.connect(audioDestinationRef.current);
    if (enableScreenShareUi) setScreenSharing(true);
  };

  const toggleScreenShare = async () => {
    if (screenSharing) {
      stopSystemAudioCapture();
      return;
    }
    try {
      await startSystemAudioCapture({ enableScreenShareUi: true });
      toast.success("Screen share started. Device/tab audio will be included.");
    } catch (error) {
      toast.error(getProcessStartErrorMessage(error, "Failed to start screen share"));
    }
  };

  const stopHostRecording = async (): Promise<Blob | null> => {
    const recorder = recorderRef.current;

    if (!recorder) return null;

    if (recorder.state === "recording") {
      recorder.requestData();
    }
    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });

    stopSystemAudioCapture();
    micStreamRef.current?.getTracks().forEach((track) => track.stop());
    mixedStreamRef.current?.getTracks().forEach((track) => track.stop());
    micStreamRef.current = null;
    mixedStreamRef.current = null;
    micSourceRef.current?.disconnect();
    micSourceRef.current = null;
    audioDestinationRef.current = null;
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      await audioContextRef.current.close();
    }
    audioContextRef.current = null;

    recorderRef.current = null;
    if (chunksRef.current.length === 0) return null;
    return new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
  };

  const uploadAndProcessMeetingAudio = async (audioBlob: Blob) => {
    if (!selectedMeeting || !user) return;

    const filePath = `${user.id}/${selectedMeeting.id}/${Date.now()}-join-call.webm`;
    const { error: uploadError } = await supabase.storage
      .from("meeting-files")
      .upload(filePath, audioBlob);
    if (uploadError) throw uploadError;

    const audioStorageRef = `meeting-files/${filePath}`;
    const { data: createdSession, error: sessionError } = await supabase
      .from("sessions")
      .insert({
        meeting_id: selectedMeeting.id,
        audio_file_url: audioStorageRef,
      })
      .select("id")
      .single();
    if (sessionError) throw sessionError;

    const { data: authData } = await supabase.auth.getSession();
    const accessToken = authData.session?.access_token;
    if (!accessToken) throw new Error("Authentication session missing. Please log in again.");

    await startSessionProcessing(createdSession.id, accessToken);
  };

  const handleJoinScheduledMeeting = async () => {
    if (!selectedMeeting) return;
    if (!canJoinScheduledMeeting) return;
    try {
      if (canEndMeetingAsHost) {
        toast.info("Meeting recording started. Use the middle button to start screen share + device audio.");
        await startHostRecording();
      }
      setJoined(true);
    } catch (error) {
      toast.error(getProcessStartErrorMessage(error, "Failed to join meeting"));
    }
  };

  const handleLeaveOrEnd = async () => {
    if (!selectedMeeting || !canEndMeetingAsHost) {
      setJoined(false);
      return;
    }

    setEndingMeeting(true);
    try {
      const audioBlob = await stopHostRecording();
      if (audioBlob && audioBlob.size > 0) {
        await uploadAndProcessMeetingAudio(audioBlob);
      }

      await updateMeeting.mutateAsync({
        id: selectedMeeting.id,
        actual_ended_at: new Date().toISOString(),
      });

      toast.success("Meeting ended. Transcript and summary are being generated.");
      setJoined(false);
    } catch (error) {
      toast.error(getProcessStartErrorMessage(error, "Failed to end meeting"));
    } finally {
      setEndingMeeting(false);
    }
  };

  if (id && meetingsQuery.isLoading) {
    return <div className="glass rounded-xl p-6 text-sm text-muted-foreground">Loading meeting...</div>;
  }

  if (id && !selectedMeeting) {
    return <div className="glass rounded-xl p-6 text-sm text-muted-foreground">Meeting not found.</div>;
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Join Meeting</h1>

      <BackendRuntimeNotice
        status={backendRuntimeStatus}
        onRetry={() => void retryBackend()}
      />

      {!joined ? (
        <div className="glass rounded-xl p-6 space-y-4">
          {selectedMeeting ? (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Meeting</label>
                <Input value={selectedMeeting.title} readOnly />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Meeting ID</label>
                <Input value={selectedMeeting.id.slice(0, 8)} readOnly className="font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Scheduled Time</label>
                <Input value={joinAfterLabel ?? "-"} readOnly className="font-mono" />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">End Time</label>
                <Input value={endAtLabel ?? "-"} readOnly className="font-mono" />
              </div>
              {canJoinScheduledMeeting ? (
                <Button
                  className="gradient-bg text-primary-foreground font-semibold w-full"
                  onClick={() => void handleJoinScheduledMeeting()}
                >
                  <Phone className="h-4 w-4 mr-2" /> Join
                </Button>
              ) : hasEnded ? (
                <p className="text-sm text-muted-foreground">
                  This meeting has ended.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Please join after {joinAfterLabel}.
                </p>
              )}
            </>
          ) : (
            <>
              <div>
                <label className="text-sm font-medium mb-1 block">Meeting ID</label>
                <Input
                  placeholder="Enter meeting ID..."
                  value={meetingCode}
                  onChange={e => setMeetingCode(e.target.value)}
                  className="font-mono"
                />
              </div>
              <Button
                className="gradient-bg text-primary-foreground font-semibold w-full"
                disabled={!meetingCode.trim()}
                onClick={() => setJoined(true)}
              >
                <Phone className="h-4 w-4 mr-2" /> Join Call
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="glass rounded-xl p-6 space-y-6">
          <div className="border border-border rounded-xl min-h-[300px] p-4">
            <p className="text-xs text-muted-foreground mb-2 font-medium">Live Transcript</p>
            <p className="text-sm text-muted-foreground italic">
              Transcript will appear here during the call...
            </p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground mb-2 font-medium flex items-center gap-1">
              <Users className="h-3.5 w-3.5" /> Participants
            </p>
            <div className="flex gap-2">
              <div className="w-8 h-8 rounded-full gradient-bg flex items-center justify-center text-xs font-bold text-primary-foreground">
                Y
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant={micOn ? "outline" : "destructive"}
              size="icon"
              onClick={() => {
                const next = !micOn;
                micStreamRef.current?.getAudioTracks().forEach((track) => {
                  track.enabled = next;
                });
                setMicOn(next);
              }}
              className="rounded-full w-12 h-12"
            >
              {micOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
            </Button>
            <Button
              variant={screenSharing ? "default" : "outline"}
              size="icon"
              onClick={() => void toggleScreenShare()}
              className="rounded-full w-12 h-12"
              disabled={endingMeeting || !canEndMeetingAsHost}
              title={screenSharing ? "Stop screen share" : "Start screen share"}
            >
              {screenSharing ? <MonitorOff className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              onClick={() => void handleLeaveOrEnd()}
              className="rounded-full w-12 h-12"
              disabled={endingMeeting}
            >
              {endingMeeting ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
