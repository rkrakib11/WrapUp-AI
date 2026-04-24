import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { getBackendCandidates } from "@/lib/session-processing";
import { resolveBackendUrl } from "@/lib/backend-url";
import { useAuth } from "./useAuth";

const BACKEND_URL = resolveBackendUrl();

type MeetingUpdate = Pick<
  Database["public"]["Tables"]["meetings"]["Update"],
  "title" | "scheduled_at" | "scheduled_end_at" | "actual_ended_at" | "duration_minutes"
>;
type MeetingInsert = Database["public"]["Tables"]["meetings"]["Insert"];
type MeetingRow = Database["public"]["Tables"]["meetings"]["Row"];
type SessionRow = Database["public"]["Tables"]["sessions"]["Row"];

export type MeetingSessionSummary = Pick<
  SessionRow,
  "id" | "transcript" | "summary" | "language_detected" | "created_at"
> & {
  processing_status?: string | null;
  analytics_data?: Record<string, unknown> | null;
};

export type MeetingWithSessions = MeetingRow & {
  sessions: MeetingSessionSummary[];
};

export function useMeetings() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const meetingsQuery = useQuery({
    queryKey: ["meetings", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("meetings")
        .select("*, sessions(id, transcript, summary, language_detected, created_at, analytics_data, processing_status)")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MeetingWithSessions[];
    },
    enabled: !!user,
  });

  // Realtime subscription for live updates
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel("meetings-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "meetings" }, () => {
        queryClient.invalidateQueries({ queryKey: ["meetings"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const createMeeting = useMutation({
    mutationFn: async ({ title, source }: { title: string; source?: string }) => {
      const { data, error } = await supabase
        .from("meetings")
        .insert({ title, owner_id: user!.id, ...(source ? { source } : {}) })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const updateMeeting = useMutation({
    mutationFn: async (payload: { id: string; title?: string; scheduled_at?: string; scheduled_end_at?: string; actual_ended_at?: string; duration_minutes?: number }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase.from("meetings").update(rest as MeetingUpdate).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const deleteMeeting = useMutation({
    mutationFn: async (id: string) => {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token ?? "";
      let lastError = "Failed to delete meeting";
      let allCandidatesReturned404 = true;
      for (const candidate of getBackendCandidates(BACKEND_URL)) {
        try {
          const res = await fetch(`${candidate}/meetings/${id}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${token}` },
          });
          if (res.ok) return;
          if (res.status !== 404) allCandidatesReturned404 = false;
          lastError = (await res.text()) || `Backend responded with ${res.status}`;
        } catch (err) {
          allCandidatesReturned404 = false;
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
      // Desktop may be running an older bundled backend that does not yet
      // expose DELETE /meetings/{id}. In that case every candidate returns
      // 404. Fall back to a soft-delete so the UI stays responsive; the
      // next rebuild will reclaim the orphaned storage.
      if (allCandidatesReturned404) {
        const { error } = await supabase
          .from("meetings")
          .update({ is_deleted: true })
          .eq("id", id);
        if (error) throw new Error(error.message);
        return;
      }
      throw new Error(lastError);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  const scheduleMeeting = useMutation({
    mutationFn: async ({ title, scheduledAt, scheduledEndAt }: { title: string; scheduledAt: string; scheduledEndAt: string }) => {
      const { data, error } = await supabase
        .from("meetings")
        .insert({ title, owner_id: user!.id, scheduled_at: scheduledAt, scheduled_end_at: scheduledEndAt } as MeetingInsert)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["meetings"] }),
  });

  return { meetingsQuery, createMeeting, updateMeeting, deleteMeeting, scheduleMeeting };
}
