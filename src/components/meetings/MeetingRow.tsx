import { useNavigate } from "react-router-dom";
import { Check, Download, Globe, MoreHorizontal, Pencil, Share2, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { MeetingWithSessions } from "@/hooks/useMeetings";
import {
  cleanMeetingTitle,
  deriveMeetingStatus,
  formatDuration,
  formatLanguage,
  formatMeetingDate,
  getIconColor,
  getInitial,
} from "@/lib/meeting-display";

export interface MeetingRowProps {
  meeting: MeetingWithSessions;
  index: number;
  onRename: (m: MeetingWithSessions) => void;
  onDelete: (m: MeetingWithSessions) => void;
  onDownload: (m: MeetingWithSessions) => void;
  onShare: (m: MeetingWithSessions) => void;
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: string) => void;
}

function StatusTag({ tone, children }: { tone: "done" | "processing" | "idle" | "failed"; children: React.ReactNode }) {
  const cls =
    tone === "done"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : tone === "processing"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : tone === "idle"
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-rose-500/15 text-rose-400 border-rose-500/30";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium", cls)}>
      {children}
    </span>
  );
}

function SentimentPill({ sentiment }: { sentiment: "positive" | "neutral" | "tense" }) {
  const map = {
    positive: { label: "Positive", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
    neutral: { label: "Neutral", cls: "bg-muted text-muted-foreground border-border/60" },
    tense: { label: "Tense", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" },
  } as const;
  const v = map[sentiment];
  return (
    <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", v.cls)}>
      {v.label}
    </span>
  );
}

export function MeetingRow({
  meeting,
  index,
  onRename,
  onDelete,
  onDownload,
  onShare,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: MeetingRowProps) {
  const navigate = useNavigate();
  const title = cleanMeetingTitle(meeting.title);
  const iconStyle = getIconColor(index);
  const initial = getInitial(title);
  const dateStr = formatMeetingDate(meeting.created_at);
  const duration = formatDuration(meeting.duration_minutes);
  const status = deriveMeetingStatus(meeting);
  const hasAnyStatus = status.transcriptDone || status.summaryDone || status.momDone || status.processing;

  // While in multi-select mode the entire row toggles selection instead of
  // navigating into the meeting detail page.
  const handleClick = () => {
    if (selectionMode) {
      onToggleSelect?.(meeting.id);
      return;
    }
    navigate(`/dashboard/meetings/${meeting.id}`);
  };

  const stop = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={cn(
        "group flex items-center gap-4 px-4 py-5 min-h-[64px] hover:bg-accent/40 transition-colors cursor-pointer focus:outline-none focus-visible:bg-accent/40",
        selectionMode && selected && "bg-rose-500/10 hover:bg-rose-500/15",
      )}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect?.(meeting.id)}
          onClick={stop}
          aria-label="Select meeting"
          className="h-4 w-4 shrink-0 accent-rose-500 cursor-pointer"
        />
      )}

      <div
        className="shrink-0 h-10 w-10 rounded-lg flex items-center justify-center font-semibold text-sm"
        style={iconStyle}
        aria-hidden
      >
        {initial}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-medium text-[14px] truncate">{title}</h3>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          {status.transcriptDone && (
            <StatusTag tone="done">
              <Check className="h-3 w-3" /> Transcript
            </StatusTag>
          )}
          {status.summaryDone && (
            <StatusTag tone="done">
              <Check className="h-3 w-3" /> Summary
            </StatusTag>
          )}
          {status.momDone && (
            <StatusTag tone="done">
              <Check className="h-3 w-3" /> MoM
            </StatusTag>
          )}
          {status.processing && <StatusTag tone="processing">Processing…</StatusTag>}
          {!hasAnyStatus && <StatusTag tone="idle">Not processed</StatusTag>}
          {status.language && (
            <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/90">
              <Globe className="h-3 w-3" /> {formatLanguage(status.language)}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center gap-3 text-[12px] text-muted-foreground flex-wrap">
          {dateStr && <span>{dateStr}</span>}
          {duration && (
            <>
              <span aria-hidden>•</span>
              <span>{duration}</span>
            </>
          )}
          {status.speakerCount != null && status.speakerCount > 0 && (
            <>
              <span aria-hidden>•</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {status.speakerCount} {status.speakerCount === 1 ? "speaker" : "speakers"}
              </span>
            </>
          )}
          {status.sentiment && <SentimentPill sentiment={status.sentiment} />}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={stop}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 opacity-60 group-hover:opacity-100"
            aria-label="Meeting actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={stop}>
          <DropdownMenuItem onClick={() => onDownload(meeting)}>
            <Download className="mr-2 h-4 w-4" /> Generate PDF
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onShare(meeting)}>
            <Share2 className="mr-2 h-4 w-4" /> Share
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRename(meeting)}>
            <Pencil className="mr-2 h-4 w-4" /> Rename
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onDelete(meeting)} className="text-destructive focus:text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
