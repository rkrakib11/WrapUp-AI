import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { resolveBackendUrl, getBackendCandidates } from "@/lib/backend-url";

/**
 * Persisted Ask-AI chat for a meeting/session, using the SAME
 * infrastructure that MeetingDetailPage already uses:
 *   - GET answer:  POST /sessions/{id}/ask  (existing backend endpoint)
 *   - Save Q+A:    INSERT into meeting_ai_chats (existing table + RLS)
 *
 * This way Ask AI from the InstantMeetingPage and from MeetingDetailPage
 * share one history table, one endpoint, one auth path. Nothing new is
 * added on the backend or DB.
 *
 * `MeetingAiChatRow` shape comes from the meeting_ai_chats table:
 *   { id, meeting_id, session_id, user_id, question, answer, created_at }
 */

export type MeetingAiChatRow = {
  id: string;
  meeting_id: string;
  session_id: string | null;
  user_id: string;
  question: string;
  answer: string;
  created_at: string;
};

type SendVariables = { question: string };

export function useSessionChat(meetingId: string | undefined, sessionId: string | undefined) {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const historyQuery = useQuery({
    queryKey: ["meeting_ai_chats", meetingId],
    queryFn: async (): Promise<MeetingAiChatRow[]> => {
      if (!meetingId) return [];
      const { data, error } = await supabase
        .from("meeting_ai_chats")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as MeetingAiChatRow[];
    },
    enabled: Boolean(meetingId),
    staleTime: 30_000,
  });

  const sendMutation = useMutation({
    mutationFn: async ({ question }: SendVariables): Promise<MeetingAiChatRow> => {
      if (!meetingId || !sessionId) throw new Error("Meeting or session not ready");
      if (!user) throw new Error("Not signed in");

      // 1. Get the answer from the existing /sessions/{id}/ask endpoint.
      //    Try each backend candidate in order (handles localhost/127.0.0.1
      //    + 8002/8003 swaps automatically).
      const { data: authData } = await supabase.auth.getSession();
      const accessToken = authData.session?.access_token;
      if (!accessToken) throw new Error("Not signed in");

      const candidates = getBackendCandidates(resolveBackendUrl());
      let answer = "";
      let lastError: string | null = null;
      for (const candidate of candidates) {
        try {
          const resp = await fetch(`${candidate}/sessions/${sessionId}/ask`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ question }),
          });
          if (!resp.ok) {
            try {
              const body = await resp.json();
              lastError = body?.detail ?? `Backend ${candidate} returned ${resp.status}`;
            } catch {
              lastError = `Backend ${candidate} returned ${resp.status}`;
            }
            continue;
          }
          const payload = await resp.json();
          answer = (payload?.answer ?? "").trim();
          break;
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
        }
      }
      if (!answer) {
        throw new Error(lastError ?? "Could not reach the AI service");
      }

      // 2. Persist Q+A to meeting_ai_chats. RLS ensures only this user's
      //    rows are returned/updated.
      const { data: inserted, error } = await supabase
        .from("meeting_ai_chats")
        .insert({
          meeting_id: meetingId,
          session_id: sessionId,
          user_id: user.id,
          question,
          answer,
        })
        .select()
        .single();
      if (error) throw error;
      return inserted as MeetingAiChatRow;
    },
    onSuccess: (newRow) => {
      queryClient.setQueryData<MeetingAiChatRow[]>(
        ["meeting_ai_chats", meetingId],
        (prev) => [...(prev ?? []), newRow],
      );
    },
  });

  return {
    messages: historyQuery.data ?? [],
    isLoading: historyQuery.isLoading,
    isSending: sendMutation.isPending,
    error: sendMutation.error?.message ?? null,
    sendMessage: (question: string) => sendMutation.mutateAsync({ question }),
  };
}
