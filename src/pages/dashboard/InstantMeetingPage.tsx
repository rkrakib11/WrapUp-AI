import { AlertCircle, Loader2, Mic, Monitor, PhoneOff, Radio } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BackendRuntimeNotice } from "@/components/common/BackendRuntimeNotice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  getDesktopCaptureState,
  isDesktopCaptureAvailable,
  startDesktopCapture,
  stopDesktopCapture,
  subscribeToDesktopCaptureState,
  type DesktopCaptureState,
} from "@/lib/desktop-capture";
import { deleteFinalizedCaptureSpool } from "@/lib/finalized-capture-spools";
import {
  listUploadQueueItems,
  runNextForegroundUpload,
  retryUploadQueueItem,
  type UploadQueueItem,
} from "@/lib/upload-queue";
import { isDesktopApp, openExternalUrl } from "@/lib/app-shell";
import { useBackendRuntimeStatus } from "@/hooks/use-backend-runtime-status";
import { toast } from "sonner";

export default function InstantMeetingPage() {
  const navigate = useNavigate();
  const [captureState, setCaptureState] = useState<DesktopCaptureState>(() => getDesktopCaptureState());
  const [captureMicrophone, setCaptureMicrophone] = useState(true);
  const [captureSystemAudio, setCaptureSystemAudio] = useState(false);
  const [lastCaptureSize, setLastCaptureSize] = useState<number | null>(null);
  const [lastSpoolFilename, setLastSpoolFilename] = useState<string | null>(null);
  const [lastSpoolPath, setLastSpoolPath] = useState<string | null>(null);
  const [lastUploadedMeeting, setLastUploadedMeeting] = useState<{
    meetingId: string;
    sessionId: string;
    meetingPath: string;
    processingStarted: boolean;
  } | null>(null);
  const [uploadQueueItems, setUploadQueueItems] = useState<UploadQueueItem[]>([]);
  const [uploadQueueError, setUploadQueueError] = useState<string | null>(null);
  const [uploadingNext, setUploadingNext] = useState(false);
  const { status: backendRuntimeStatus, retry: retryBackend } = useBackendRuntimeStatus();

  const refreshUploadQueueItems = async () => {
    try {
      const items = await listUploadQueueItems();
      setUploadQueueItems(items);
      setUploadQueueError(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load upload queue items.";
      setUploadQueueError(message);
    }
  };

  useEffect(() => {
    const unsubscribe = subscribeToDesktopCaptureState((state) => {
      setCaptureState(state);
    });

    void refreshUploadQueueItems();

    return () => {
      unsubscribe();
      void stopDesktopCapture();
    };
  }, []);

  const desktopCaptureAvailable = isDesktopCaptureAvailable() && captureState.desktopSupported;
  const isBusy = captureState.status === "starting" || captureState.status === "stopping";
  const isRecording = captureState.status === "recording";
  const isMacDesktop =
    typeof navigator !== "undefined" &&
    isDesktopApp() &&
    /mac/i.test(navigator.platform || navigator.userAgent);

  const statusLabel = useMemo(() => {
    switch (captureState.status) {
      case "starting":
        return "Starting desktop capture...";
      case "recording":
        return "Desktop capture is running";
      case "stopping":
        return "Stopping desktop capture...";
      case "error":
        return "Desktop capture needs attention";
      default:
        return "Ready to start a desktop capture session";
    }
  }, [captureState.status]);

  const sourceSummary = useMemo(() => {
    const activeSources = [
      captureState.captureMicrophone ? "microphone" : null,
      captureState.captureSystemAudio ? "system audio" : null,
    ].filter(Boolean);

    return activeSources.length > 0 ? activeSources.join(" + ") : "nothing selected yet";
  }, [captureState.captureMicrophone, captureState.captureSystemAudio]);

  const uploadQueueCounts = useMemo(() => {
    return uploadQueueItems.reduce(
      (counts, item) => {
        counts[item.uploadStatus] += 1;
        return counts;
      },
      {
        ready: 0,
        uploading: 0,
        uploaded: 0,
        failed: 0,
      },
    );
  }, [uploadQueueItems]);

  const formatBytes = (value: number) => {
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getMeetingDetailsPath = (meetingId: string, sessionId: string) => {
    return `/dashboard/meetings/${meetingId}?sessionId=${encodeURIComponent(sessionId)}`;
  };

  const handleStartCapture = async () => {
    try {
      await startDesktopCapture({
        captureMicrophone,
        captureSystemAudio,
      });
      setLastCaptureSize(null);
      setLastSpoolFilename(null);
      setLastSpoolPath(null);
      toast.success("Desktop capture started.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to start desktop capture.");
    }
  };

  const handleStopCapture = async () => {
    try {
      const result = await stopDesktopCapture();
      setLastCaptureSize(result.size > 0 ? result.size : null);
      setLastSpoolFilename(result.spoolFilename ?? null);
      setLastSpoolPath(result.spoolPath ?? null);
      await refreshUploadQueueItems();
      toast.success(
        result.spooled
          ? "Capture stopped. The temporary local recording file was finalized successfully."
          : "Capture stopped cleanly.",
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to stop desktop capture.");
    }
  };

  const handleDeleteFinalizedSpool = async (id: string) => {
    try {
      const result = await deleteFinalizedCaptureSpool(id);
      await refreshUploadQueueItems();

      toast.success(
        result.deleted
          ? "Temporary capture file deleted."
          : "Temporary capture file was already gone.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to delete the temporary capture file.",
      );
    }
  };

  const handleRunNextForegroundUpload = async () => {
    try {
      setUploadingNext(true);
      const result = await runNextForegroundUpload();
      await refreshUploadQueueItems();

      if (result.outcome === "no_ready_item") {
        toast("No ready temp capture files are waiting for upload.");
        return;
      }

      if (result.outcome === "failed") {
        toast.error(result.error ?? "Foreground upload failed.");
        return;
      }

      if (!result.meetingId || !result.sessionId) {
        toast.error("Upload finished, but no meeting link was returned.");
        return;
      }

      const meetingPath = getMeetingDetailsPath(result.meetingId, result.sessionId);
      setLastUploadedMeeting({
        meetingId: result.meetingId,
        sessionId: result.sessionId,
        meetingPath,
        processingStarted: result.processingStarted,
      });

      if (result.outcome === "uploaded_processing_not_started") {
        toast.warning(
          result.processStartError
            ? `${result.error ?? "Audio uploaded successfully, but automatic processing did not start."} ${result.processStartError}`
            : (result.error ?? "Audio uploaded successfully, but automatic processing did not start."),
          {
            action: {
              label: "Open meeting",
              onClick: () => navigate(meetingPath),
            },
          },
        );
      } else if (result.spoolFilename) {
        toast.success(`Uploaded ${result.spoolFilename} with the existing web upload flow.`, {
          action: {
            label: "Open meeting",
            onClick: () => navigate(meetingPath),
          },
        });
      } else {
        toast.success("Foreground upload finished successfully.", {
          action: {
            label: "Open meeting",
            onClick: () => navigate(meetingPath),
          },
        });
      }

      if (result.tempFileDeleteError) {
        toast.error(result.tempFileDeleteError);
      }

      navigate(meetingPath);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to run the next foreground upload.");
    } finally {
      setUploadingNext(false);
    }
  };

  const handleRetryUploadQueueItem = async (id: string) => {
    try {
      const item = await retryUploadQueueItem(id);
      await refreshUploadQueueItems();

      if (!item) {
        toast("That upload queue item is no longer available.");
        return;
      }

      toast.success(`Returned ${item.spoolFilename} to the ready queue.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to retry the upload queue item.");
    }
  };

  const handleRetryBackendStartup = async () => {
    try {
      const status = await retryBackend();

      if (!status) {
        return;
      }

      if (status.state === "ready") {
        toast.success("Local backend is ready.");
        return;
      }

      if (status.state === "starting") {
        toast("Local backend is starting...");
        return;
      }

      toast.error(status.message ?? "Local backend is unavailable.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to restart the local backend.");
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

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Instant Meeting</h1>

      {!isRecording && !isBusy ? (
        <div className="flex items-center justify-center min-h-[calc(100vh-180px)]">
        <div className="glass rounded-xl p-8 text-center space-y-6 w-full max-w-2xl">
          <div className="w-16 h-16 rounded-full gradient-bg mx-auto flex items-center justify-center">
            <Radio className="h-8 w-8 text-primary-foreground" />
          </div>
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Start an Instant Meeting</h2>
            <p className="text-sm font-medium">{statusLabel}</p>
          </div>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            This step writes desktop capture to a temporary local file, then lets you send one queued recording through the same upload path used by the web Upload section.
          </p>

          <div className="space-y-3 text-left max-w-md mx-auto w-full">
            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">Microphone</p>
                <p className="text-xs text-muted-foreground">Capture local mic input with echo cancellation.</p>
              </div>
              <Switch
                checked={captureMicrophone}
                onCheckedChange={setCaptureMicrophone}
                disabled={isBusy}
              />
            </div>

            <div className="flex items-center justify-between rounded-xl border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">System audio + display share</p>
                <p className="text-xs text-muted-foreground">
                  Uses Electron desktop capture to request shared display audio.
                </p>
              </div>
              <Switch
                checked={captureSystemAudio}
                onCheckedChange={setCaptureSystemAudio}
                disabled={isBusy || !captureState.systemAudioSupported}
              />
            </div>
          </div>

          {!captureState.systemAudioSupported && (
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              System audio capture is currently supported on Windows only in this Electron foundation.
            </p>
          )}

          {!desktopCaptureAvailable && (
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Desktop capture is only available inside the Electron app. Web live capture is unchanged in this step.
            </p>
          )}

          {captureState.error && (
            <div className="max-w-md mx-auto rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-left flex gap-3">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <p className="text-sm text-destructive">{captureState.error}</p>
            </div>
          )}

          {isMacDesktop && (
            <div className="max-w-md mx-auto rounded-xl border border-border/70 px-4 py-3 text-left space-y-2">
              <p className="text-xs text-muted-foreground">
                macOS setup: allow <span className="font-medium text-foreground">Microphone</span> for Electron before starting capture.
                Screen Recording is only needed if you turn on display share.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleOpenMacMicrophoneSettings()}
                >
                  Open Microphone settings
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleOpenMacScreenRecordingSettings()}
                >
                  Open Screen Recording
                </Button>
              </div>
            </div>
          )}

          <div className="max-w-md mx-auto w-full">
            <BackendRuntimeNotice
              status={backendRuntimeStatus}
              onRetry={() => void handleRetryBackendStartup()}
            />
          </div>

          {lastCaptureSize !== null && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground">
                Last capture size: {formatBytes(lastCaptureSize)}
              </p>
              {lastSpoolFilename && (
                <p className="text-xs text-muted-foreground">
                  Last temp spool file: {lastSpoolFilename}
                </p>
              )}
              {lastSpoolPath && (
                <p className="text-[11px] text-muted-foreground break-all">
                  Stored at: {lastSpoolPath}
                </p>
              )}
            </div>
          )}

          {lastUploadedMeeting && (
            <div className="max-w-md mx-auto w-full rounded-xl border border-border px-4 py-3 text-left space-y-2">
              <p className="text-xs font-medium text-foreground">Latest uploaded meeting</p>
              <p className="text-xs text-muted-foreground">
                {lastUploadedMeeting.processingStarted
                  ? "Upload completed and the meeting details page is ready."
                  : "Upload completed, but automatic processing did not start yet."}
              </p>
              <Link to={lastUploadedMeeting.meetingPath} className="text-xs text-primary underline underline-offset-4">
                Open meeting details
              </Link>
            </div>
          )}

          {(uploadQueueItems.length > 0 || uploadQueueError) && (
            <div className="max-w-md mx-auto w-full rounded-xl border border-border px-4 py-3 text-left space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-foreground">Upload queue</p>
                  <p className="text-xs text-muted-foreground">
                    Ready {uploadQueueCounts.ready} • Uploading {uploadQueueCounts.uploading} • Uploaded {uploadQueueCounts.uploaded} • Failed {uploadQueueCounts.failed}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-xs"
                  onClick={() => void handleRunNextForegroundUpload()}
                  disabled={uploadingNext}
                >
                  {uploadingNext ? "Uploading..." : "Upload next"}
                </Button>
              </div>

              {uploadQueueError ? (
                <p className="text-xs text-destructive">{uploadQueueError}</p>
              ) : (
                uploadQueueItems.slice(0, 3).map((item) => (
                  <div key={item.id} className="space-y-2 rounded-lg border border-border/70 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{item.spoolFilename}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(item.size)} • {item.uploadStatus} • {new Date(item.finalizedAt).toLocaleString()}
                      </p>
                      {item.lastUploadError && (
                        <p className="text-[11px] text-destructive">{item.lastUploadError}</p>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.uploadStatus === "failed" && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => void handleRetryUploadQueueItem(item.id)}
                        >
                          Retry
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => void handleDeleteFinalizedSpool(item.id)}
                      >
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          <Button
            className="gradient-bg text-primary-foreground font-semibold"
            onClick={() => void handleStartCapture()}
            disabled={!desktopCaptureAvailable || (!captureMicrophone && !captureSystemAudio)}
          >
            <Mic className="h-4 w-4 mr-2" /> Start Capture
          </Button>
        </div>
        </div>
      ) : (
        <div className="glass rounded-xl p-6 space-y-6">
          <div className="text-center">
            <div className="w-12 h-12 rounded-full gradient-bg mx-auto flex items-center justify-center animate-pulse-glow">
              {isBusy ? <Loader2 className="h-6 w-6 text-primary-foreground animate-spin" /> : <Radio className="h-6 w-6 text-primary-foreground" />}
            </div>
            <p className="text-sm font-medium mt-3">{statusLabel}</p>
            <p className="text-xs text-muted-foreground">Active sources: {sourceSummary}</p>
          </div>

          <div className="border border-border rounded-xl min-h-[200px] p-4">
            <p className="text-sm text-muted-foreground italic">
              Desktop capture is active. Live transcription and upload are intentionally not wired in this step.
            </p>
          </div>

          <div className="flex justify-center gap-3">
            <Button
              variant="outline"
              className="rounded-full h-12 px-4"
              disabled
            >
              <Mic className="h-5 w-5" />
              {captureState.captureMicrophone ? "Mic enabled" : "Mic off"}
            </Button>
            <Button
              variant="outline"
              className="rounded-full h-12 px-4"
              disabled
            >
              <Monitor className="h-5 w-5" />
              {captureState.captureSystemAudio ? "System audio enabled" : "System audio off"}
            </Button>
            <Button
              variant="destructive"
              size="icon"
              className="rounded-full w-12 h-12"
              onClick={() => void handleStopCapture()}
              disabled={isBusy}
            >
              {captureState.status === "stopping" ? <Loader2 className="h-5 w-5 animate-spin" /> : <PhoneOff className="h-5 w-5" />}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
