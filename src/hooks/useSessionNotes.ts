import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Single auto-saved note for an instant-meeting session, persisted to
 * the existing `notes` table (which is keyed by meeting_id, with many
 * notes per meeting). On the InstantMeetingPage we want a single
 * stream-of-consciousness textarea — so this hook owns ONE row in the
 * `notes` table per session and updates its content as the user types.
 *
 * On Meeting Detail, that row appears alongside any other notes the
 * user added manually — same table, same shape, same RLS.
 *
 * One-time migration: if there's nothing in the table yet AND the
 * legacy localStorage key has content (from before this hook existed),
 * push the local copy through then delete the local key.
 */
const LOCAL_STORAGE_PREFIX = "instant-meeting-notes:";
const DEBOUNCE_MS = 800;

type NoteRow = {
  id: string;
  meeting_id: string;
  content: string | null;
  updated_at?: string;
};

export function useSessionNotes(meetingId: string | undefined, sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<string>("");
  const noteIdRef = useRef<string | null>(null);
  const hydratedFor = useRef<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const initialDraftRef = useRef<string>("");

  // Fetch every note for this meeting; we'll use the most-recently-updated
  // one as the "live note" and own its id. If none exists, we'll create
  // one on first save.
  const notesQuery = useQuery({
    queryKey: ["notes", meetingId],
    queryFn: async () => {
      if (!meetingId) return [] as NoteRow[];
      const { data, error } = await supabase
        .from("notes")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as NoteRow[];
    },
    enabled: Boolean(meetingId),
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (next: string) => {
      if (!meetingId) return;
      if (noteIdRef.current) {
        const { error } = await supabase
          .from("notes")
          .update({ content: next })
          .eq("id", noteIdRef.current);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("notes")
          .insert({ meeting_id: meetingId, content: next })
          .select()
          .single();
        if (error) throw error;
        if (data?.id) noteIdRef.current = data.id as string;
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notes", meetingId] });
    },
  });

  // Hydrate the draft + note id from the server (or migrate from
  // localStorage) the first time we have a meetingId AND a query result.
  useEffect(() => {
    if (!meetingId) return;
    if (notesQuery.isLoading) return;
    if (hydratedFor.current === meetingId) return;

    const rows = notesQuery.data ?? [];
    if (rows.length > 0) {
      const top = rows[0];
      noteIdRef.current = top.id;
      const content = top.content ?? "";
      setDraft(content);
      initialDraftRef.current = content;
      hydratedFor.current = meetingId;
      return;
    }

    // No notes yet — try one-time migration from localStorage (keyed by
    // session id since that's how the old hook stored them).
    let localValue = "";
    if (sessionId) {
      try {
        localValue = window.localStorage.getItem(`${LOCAL_STORAGE_PREFIX}${sessionId}`) ?? "";
      } catch { /* private mode / quota */ }
    }

    if (localValue) {
      setDraft(localValue);
      initialDraftRef.current = "";  // force a save
      upsertMutation.mutate(localValue, {
        onSuccess: () => {
          if (sessionId) {
            try {
              window.localStorage.removeItem(`${LOCAL_STORAGE_PREFIX}${sessionId}`);
            } catch { /* noop */ }
          }
        },
      });
    } else {
      setDraft("");
      initialDraftRef.current = "";
    }
    hydratedFor.current = meetingId;
  }, [meetingId, sessionId, notesQuery.isLoading, notesQuery.data, upsertMutation]);

  // Debounced upsert on draft change. Skips empty drafts on first hydration
  // so we don't create empty rows the user never typed into.
  useEffect(() => {
    if (!meetingId) return;
    if (hydratedFor.current !== meetingId) return;
    if (draft === initialDraftRef.current) return;
    // Don't insert an empty first row — wait until the user has actually
    // typed something.
    if (!noteIdRef.current && !draft.trim()) return;
    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = window.setTimeout(() => {
      upsertMutation.mutate(draft);
      initialDraftRef.current = draft;
    }, DEBOUNCE_MS);
    return () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current);
    };
  }, [draft, meetingId, upsertMutation]);

  return {
    notes: draft,
    setNotes: setDraft,
    isLoading: notesQuery.isLoading,
    isSaving: upsertMutation.isPending,
  };
}
