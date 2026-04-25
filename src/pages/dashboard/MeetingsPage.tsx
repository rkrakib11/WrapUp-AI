import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowUpDown, Filter, LayoutGrid, List, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useMeetings, type MeetingWithSessions } from "@/hooks/useMeetings";
import { useActionItems } from "@/hooks/useActionItems";
import { useAuth } from "@/hooks/useAuth";
import { cleanMeetingTitle, deriveMeetingStatus } from "@/lib/meeting-display";
import { buildPublicAppUrl } from "@/lib/app-shell";
import { generateMeetingPdf, type MeetingSummaryPayload } from "@/lib/meeting-pdf";
import { MeetingRow } from "@/components/meetings/MeetingRow";
import { MeetingCard } from "@/components/meetings/MeetingCard";
import { MeetingSkeleton } from "@/components/meetings/MeetingSkeleton";
import { MeetingsEmptyState } from "@/components/meetings/MeetingsEmptyState";

type ViewMode = "list" | "grid";
type TabKey = "all" | "mine" | "recorded" | "uploaded" | "live" | "shared";
type FilterKey = "all" | "week" | "month";
type SortKey = "newest" | "oldest" | "longest" | "shortest";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export default function MeetingsPage() {
  const { user } = useAuth();
  const { meetingsQuery, createMeeting, updateMeeting, deleteMeeting } = useMeetings();
  const { actionItemsQuery } = useActionItems();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const [view, setView] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "list";
    const saved = window.localStorage.getItem("meetings:view");
    return saved === "grid" || saved === "list" ? saved : "list";
  });
  const [tab, setTab] = useState<TabKey>("all");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [languageFilter, setLanguageFilter] = useState<string | null>(null);
  const [sentimentFilter, setSentimentFilter] = useState<"positive" | "neutral" | "tense" | null>(null);
  const [sort, setSort] = useState<SortKey>("newest");
  const [now, setNow] = useState(() => new Date());

  const [createOpen, setCreateOpen] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  // Multi-select bulk-delete state. Triggered from any row's Delete menu item.
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setCreateOpen(true);
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete("new");
        return next;
      }, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("meetings:view", view);
    }
  }, [view]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const allMeetings: MeetingWithSessions[] = (meetingsQuery.data ?? []) as MeetingWithSessions[];

  const visible = useMemo(() => {
    return allMeetings.filter((m) => {
      const scheduledStart = m.scheduled_at ? new Date(m.scheduled_at) : null;
      const scheduledEnd = m.actual_ended_at
        ? new Date(m.actual_ended_at)
        : m.scheduled_end_at
        ? new Date(m.scheduled_end_at)
        : scheduledStart
        ? new Date(scheduledStart.getTime() + ((m.duration_minutes ?? 30) * 60 * 1000))
        : null;
      const isScheduledAndNotEnded = !!(scheduledStart && scheduledEnd && scheduledEnd >= now);
      return !isScheduledAndNotEnded;
    });
  }, [allMeetings, now]);

  const tabCounts = useMemo(() => {
    const mine = visible.filter((m) => m.owner_id === user?.id);
    return {
      all: visible.length,
      mine: mine.length,
      recorded: mine.filter((m) => (m as MeetingWithSessions & { source?: string | null }).source === "recorded").length,
      uploaded: mine.filter((m) => (m as MeetingWithSessions & { source?: string | null }).source === "uploaded").length,
      live: mine.filter((m) => (m as MeetingWithSessions & { source?: string | null }).source === "live").length,
      shared: visible.filter((m) => m.owner_id !== user?.id).length,
    };
  }, [visible, user?.id]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const nowTs = Date.now();

    let list = visible.slice();

    if (tab === "mine") {
      list = list.filter((m) => m.owner_id === user?.id);
    } else if (tab === "recorded") {
      list = list.filter((m) => m.owner_id === user?.id && (m as MeetingWithSessions & { source?: string | null }).source === "recorded");
    } else if (tab === "uploaded") {
      list = list.filter((m) => m.owner_id === user?.id && (m as MeetingWithSessions & { source?: string | null }).source === "uploaded");
    } else if (tab === "live") {
      list = list.filter((m) => m.owner_id === user?.id && (m as MeetingWithSessions & { source?: string | null }).source === "live");
    } else if (tab === "shared") {
      list = list.filter((m) => m.owner_id !== user?.id);
    }

    if (filter === "week") {
      list = list.filter((m) => nowTs - new Date(m.created_at).getTime() <= 7 * MS_PER_DAY);
    } else if (filter === "month") {
      list = list.filter((m) => nowTs - new Date(m.created_at).getTime() <= 31 * MS_PER_DAY);
    }

    if (languageFilter) {
      list = list.filter((m) => {
        const lang = deriveMeetingStatus(m).language;
        return lang && lang.toLowerCase() === languageFilter.toLowerCase();
      });
    }
    if (sentimentFilter) {
      list = list.filter((m) => deriveMeetingStatus(m).sentiment === sentimentFilter);
    }

    if (q) {
      list = list.filter((m) => (m.title ?? "").toLowerCase().includes(q));
    }

    const cmp = {
      newest: (a: MeetingWithSessions, b: MeetingWithSessions) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      oldest: (a: MeetingWithSessions, b: MeetingWithSessions) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      longest: (a: MeetingWithSessions, b: MeetingWithSessions) =>
        (b.duration_minutes ?? 0) - (a.duration_minutes ?? 0),
      shortest: (a: MeetingWithSessions, b: MeetingWithSessions) =>
        (a.duration_minutes ?? 0) - (b.duration_minutes ?? 0),
    }[sort];
    list.sort(cmp);

    return list;
  }, [visible, tab, filter, languageFilter, sentimentFilter, search, sort, user?.id]);

  const availableLanguages = useMemo(() => {
    const set = new Set<string>();
    for (const m of visible) {
      const lang = deriveMeetingStatus(m).language;
      if (lang) set.add(lang);
    }
    return Array.from(set).sort();
  }, [visible]);

  const handleCreate = async () => {
    if (!newTitle.trim()) return;
    await createMeeting.mutateAsync({ title: newTitle.trim() });
    setNewTitle("");
    setCreateOpen(false);
    toast.success("Meeting created!");
  };

  const handleRename = async () => {
    if (!renameId || !renameTitle.trim()) return;
    await updateMeeting.mutateAsync({ id: renameId, title: renameTitle.trim() });
    setRenameId(null);
    toast.success("Meeting renamed!");
  };

  const onRename = (m: MeetingWithSessions) => {
    setRenameId(m.id);
    setRenameTitle(m.title ?? "");
  };
  // Clicking "Delete" on any row's 3-dot menu now enters multi-select mode
  // (instead of opening a single-meeting confirm dialog), pre-selecting the
  // row the user clicked. The user can then add more rows or hit "Cancel" /
  // confirm via the action bar at the top of the page.
  const onDelete = (m: MeetingWithSessions) => {
    setSelectionMode(true);
    setSelectedIds((prev) => new Set(prev).add(m.id));
  };
  const exitSelection = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };
  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(
      ids.map((id) => deleteMeeting.mutateAsync(id)),
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    setBulkDeleting(false);
    setBulkDeleteConfirmOpen(false);
    exitSelection();
    if (failed === 0) {
      toast.success(`${ids.length} meeting${ids.length === 1 ? "" : "s"} deleted.`);
    } else {
      toast.error(`Deleted ${ids.length - failed}, failed ${failed}.`);
    }
  };
  const onDownload = (m: MeetingWithSessions) => {
    const sessions = m.sessions ?? [];
    const latest = [...sessions].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
    const transcript = typeof latest?.transcript === "string" ? latest.transcript : "";
    const summary: MeetingSummaryPayload =
      latest?.summary && typeof latest.summary === "object" && !Array.isArray(latest.summary)
        ? (latest.summary as MeetingSummaryPayload)
        : {};

    const meetingActions = (actionItemsQuery.data ?? [])
      .filter((a: { meeting_id: string }) => a.meeting_id === m.id)
      .map((a: { title: string; is_completed: boolean }) => ({
        title: a.title,
        is_completed: a.is_completed,
      }));

    if (!transcript.trim() && Object.keys(summary).length === 0 && meetingActions.length === 0) {
      toast.error("Nothing to export yet. Process this meeting first.");
      return;
    }

    try {
      generateMeetingPdf({
        title: cleanMeetingTitle(m.title),
        id: m.id,
        createdAt: m.created_at,
        transcript,
        summary,
        meetingActions,
      });
      toast.success("PDF generated.");
    } catch {
      toast.error("Failed to generate PDF.");
    }
  };

  const onShare = async (m: MeetingWithSessions) => {
    const url = buildPublicAppUrl(`/dashboard/meetings/${m.id}`);
    const title = cleanMeetingTitle(m.title);
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({
          title: `WrapUp Meeting: ${title}`,
          text: `View meeting transcript and summary: ${title}`,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied.");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Failed to share link.");
    }
  };

  const searchActive = search.trim().length > 0 || filter !== "all" || !!languageFilter || !!sentimentFilter;

  return (
    <div className="space-y-6 pt-4">
      {/* Bulk-delete action bar — only visible while in selection mode */}
      {selectionMode && (
        <div className="glass rounded-xl px-4 py-3 flex items-center gap-3 border-2 border-rose-500/40 bg-rose-500/5">
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size === 0
              ? "Select meetings to delete"
              : `${selectedIds.size} selected`}
          </span>
          <span className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            onClick={exitSelection}
          >
            <X className="h-4 w-4 mr-1" /> Cancel
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={selectedIds.size === 0}
            onClick={() => setBulkDeleteConfirmOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-1" /> Delete {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </Button>
        </div>
      )}

      <div className="glass rounded-xl p-2 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search meetings, transcripts, speakers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-transparent border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Filter
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Date</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
              <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="week">This Week</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="month">This Month</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {availableLanguages.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>By Language</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={languageFilter ?? "__any"}
                  onValueChange={(v) => setLanguageFilter(v === "__any" ? null : v)}
                >
                  <DropdownMenuRadioItem value="__any">Any</DropdownMenuRadioItem>
                  {availableLanguages.map((lang) => (
                    <DropdownMenuRadioItem key={lang} value={lang}>
                      {lang}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>By Sentiment</DropdownMenuLabel>
            <DropdownMenuRadioGroup
              value={sentimentFilter ?? "__any"}
              onValueChange={(v) =>
                setSentimentFilter(v === "__any" ? null : (v as "positive" | "neutral" | "tense"))
              }
            >
              <DropdownMenuRadioItem value="__any">Any</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="positive">Positive</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="neutral">Neutral</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="tense">Tense</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            {(filter !== "all" || languageFilter || sentimentFilter) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setFilter("all");
                    setLanguageFilter(null);
                    setSentimentFilter(null);
                  }}
                >
                  Clear filters
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sort
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="longest">Longest</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="shortest">Shortest</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => v && setView(v as ViewMode)}
          className="bg-secondary/50 rounded-md p-0.5"
        >
          <ToggleGroupItem value="list" aria-label="List view" className="h-7 w-7 p-0 data-[state=on]:bg-background">
            <List className="h-3.5 w-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="grid" aria-label="Grid view" className="h-7 w-7 p-0 data-[state=on]:bg-background">
            <LayoutGrid className="h-3.5 w-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="flex items-center justify-between gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-transparent border-b border-border/40 rounded-none p-0 justify-start gap-1 h-auto">
            {(
              [
                { key: "all", label: "All", count: tabCounts.all },
                { key: "mine", label: "Created by me", count: tabCounts.mine },
                { key: "recorded", label: "Recorded", count: tabCounts.recorded },
                { key: "uploaded", label: "Uploaded", count: tabCounts.uploaded },
                { key: "live", label: "Live", count: tabCounts.live },
                { key: "shared", label: "Shared", count: tabCounts.shared },
              ] as const
            ).map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className={cn(
                  "rounded-none border-b-2 border-transparent bg-transparent px-3 py-2 text-sm font-medium text-muted-foreground",
                  "data-[state=active]:border-primary data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:bg-transparent",
                )}
              >
                {t.label}
                <span
                  className={cn(
                    "ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                    tab === t.key ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground",
                  )}
                >
                  {t.count}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <Button size="sm" className="gradient-bg text-primary-foreground font-semibold shrink-0" onClick={() => navigate("/dashboard/new-meeting")}>
          <Plus className="h-4 w-4 mr-1" /> New Meeting
        </Button>
      </div>

      {meetingsQuery.isLoading ? (
        <MeetingSkeleton count={5} />
      ) : filtered.length === 0 ? (
        <MeetingsEmptyState
          searchActive={searchActive}
          onUpload={() => navigate("/dashboard/upload")}
          onStart={() => navigate("/dashboard/instant")}
        />
      ) : view === "list" ? (
        <div className="glass rounded-xl divide-y divide-border/40 overflow-hidden">
          {filtered.map((m, i) => (
            <MeetingRow
              key={m.id}
              meeting={m}
              index={i}
              onRename={onRename}
              onDelete={onDelete}
              onDownload={onDownload}
              onShare={onShare}
              selectionMode={selectionMode}
              selected={selectedIds.has(m.id)}
              onToggleSelect={toggleSelected}
            />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((m, i) => (
            <MeetingCard
              key={m.id}
              meeting={m}
              index={i}
              onRename={onRename}
              onDelete={onDelete}
              onDownload={onDownload}
              onShare={onShare}
              selectionMode={selectionMode}
              selected={selectedIds.has(m.id)}
              onToggleSelect={toggleSelected}
            />
          ))}
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Meeting</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Meeting title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              className="gradient-bg text-primary-foreground"
              onClick={handleCreate}
              disabled={createMeeting.isPending}
            >
              {createMeeting.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!renameId} onOpenChange={() => setRenameId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Meeting</DialogTitle>
          </DialogHeader>
          <Input
            value={renameTitle}
            onChange={(e) => setRenameTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRename()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameId(null)}>
              Cancel
            </Button>
            <Button
              className="gradient-bg text-primary-foreground"
              onClick={handleRename}
              disabled={updateMeeting.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={(open) => !bulkDeleting && setBulkDeleteConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedIds.size} meeting{selectedIds.size === 1 ? "" : "s"}?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the selected meetings and their recordings.
            This action cannot be undone.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDeleteConfirmOpen(false)} disabled={bulkDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={bulkDeleting}>
              {bulkDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
