import { Button } from "@/components/ui/button";
import type { BackendRuntimeStatus } from "@/lib/backend-runtime";

interface BackendRuntimeNoticeProps {
  status: BackendRuntimeStatus | null;
  onRetry?: () => void;
}

export function BackendRuntimeNotice({
  status,
  onRetry,
}: BackendRuntimeNoticeProps) {
  if (!status || status.state === "ready") {
    return null;
  }

  return (
    <div className="rounded-xl border border-border px-4 py-3 text-left space-y-2">
      <p className="text-xs font-medium text-foreground">
        {status.state === "starting"
          ? "Local backend starting..."
          : "Local backend unavailable"}
      </p>
      {status.message && (
        <p className="text-xs text-muted-foreground">{status.message}</p>
      )}
      {status.state === "unavailable" && onRetry && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={onRetry}
        >
          Retry backend start
        </Button>
      )}
    </div>
  );
}
