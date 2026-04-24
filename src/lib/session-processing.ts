import { getBackendCandidates, resolveBackendUrl } from "@/lib/backend-url";

export function getProcessStartErrorMessage(error: unknown, fallback: string): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const rawMessage = String((error as { message: unknown }).message ?? "");
    const normalizedMessage = rawMessage.toLowerCase();

    if (
      normalizedMessage.includes("failed to fetch") ||
      normalizedMessage.includes("fetch failed")
    ) {
      return "Backend is unreachable. Start backend on port 8002 and try again.";
    }
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export { getBackendCandidates } from "@/lib/backend-url";

export async function startSessionProcessing(
  sessionId: string,
  accessToken: string,
  backendUrl: string = resolveBackendUrl(),
): Promise<void> {
  let lastError = "Failed to start processing";

  for (const candidate of getBackendCandidates(backendUrl)) {
    try {
      const processResponse = await fetch(`${candidate}/sessions/${sessionId}/process`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
      });

      if (!processResponse.ok) {
        const body = await processResponse.text();
        lastError = body || `Backend ${candidate} responded with ${processResponse.status}`;
        continue;
      }

      return;
    } catch (error) {
      lastError = getProcessStartErrorMessage(error, `Could not reach backend at ${candidate}`);
    }
  }

  throw new Error(lastError);
}
