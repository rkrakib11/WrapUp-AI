import { useNavigate } from "react-router-dom";
import { Check, Download, Eye, Globe, MoreHorizontal, Pencil, Share2, Trash2, Users } from "lucide-react";
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

export interface MeetingCardProps {
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

export function MeetingCard({
  meeting,
  index,
  onRename,
  onDelete,
  onDownload,
  onShare,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: MeetingCardProps) {
  const navigate = useNavigate();
  const title = cleanMeetingTitle(meeting.title);
  const iconStyle = getIconColor(index);
  const initial = getInitial(title);
  const dateStr = formatMeetingDate(meeting.created_at);
  const duration = formatDuration(meeting.duration_minutes);
  const status = deriveMeetingStatus(meeting);
  const hasAnyStatus = status.transcriptDone || status.summaryDone || status.momDone || status.processing;

  const go = () => navigate(`/dashboard/meetings/${meeting.id}`);
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const handleCardClick = () => {
    if (selectionMode) onToggleSelect?.(meeting.id);
  };

  const sentimentPill = status.sentiment
    ? status.sentiment === "positive"
      ? { label: "Positive", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" }
      : status.sentiment === "tense"
      ? { label: "Tense", cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" }
      : { label: "Neutral", cls: "bg-muted text-muted-foreground border-border/60" }
    : null;

  return (
    <div
      className={cn(
        "glass rounded-xl p-4 flex flex-col gap-3 hover:glow-sm transition-shadow",
        selectionMode && "cursor-pointer",
        selectionMode && selected && "ring-2 ring-rose-500/60 bg-rose-500/5",
      )}
      onClick={selectionMode ? handleCardClick : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {selectionMode && (
            <input
              type="checkbox"
              checked={selected}
              onChange={() => onToggleSelect?.(meeting.id)}
              onClick={stop}
              aria-label="Select meeting"
              className="h-4 w-4 mt-1 accent-rose-500 cursor-pointer"
            />
          )}
          <div
            className="h-10 w-10 rounded-lg flex items-center justify-center font-semibold text-sm"
            style={iconStyle}
            aria-hidden
          >
            {initial}
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild onClick={stop}>
            <Button variant="ghost" size="icon" className="h-7 w-7 -mr-1 -mt-1" aria-label="Meeting actions">
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

      <div>
        <h3 className="font-medium text-[14px] line-clamp-2">{title}</h3>
        <div className="mt-1 flex items-center gap-2 text-[12px] text-muted-foreground flex-wrap">
          {dateStr && <span>{dateStr}</span>}
          {duration && (
            <>
              <span aria-hidden>·</span>
              <span>{duration}</span>
            </>
          )}
          {status.speakerCount != null && status.speakerCount > 0 && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" /> {status.speakerCount}
              </span>
            </>
          )}
          {sentimentPill && (
            <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium", sentimentPill.cls)}>
              {sentimentPill.label}
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {status.transcriptDone && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Check className="h-3 w-3" /> Transcript
          </span>
        )}
        {status.summaryDone && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Check className="h-3 w-3" /> Summary
          </span>
        )}
        {status.momDone && (
          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
            <Check className="h-3 w-3" /> MoM
          </span>
        )}
        {status.processing && (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            Processing…
          </span>
        )}
        {!hasAnyStatus && (
          <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
            Not processed
          </span>
        )}
        {status.language && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary/90">
            <Globe className="h-3 w-3" /> {formatLanguage(status.language)}
          </span>
        )}
      </div>

      <div className="mt-auto pt-1">
        <Button variant="outline" size="sm" className="w-full" onClick={go}>
          <Eye className="mr-1.5 h-3.5 w-3.5" /> View
        </Button>
      </div>
    </div>
  );
}
