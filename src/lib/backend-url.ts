import { isDesktopApp } from "@/lib/app-shell";

const ELECTRON_LOCAL_BACKEND = "http://127.0.0.1:8002";
const PROD_PROXY_BASE = "/api/backend";

export function resolveBackendUrl(): string {
  if (isDesktopApp()) return ELECTRON_LOCAL_BACKEND;

  const envUrl = import.meta.env.VITE_BACKEND_URL;
  if (envUrl && String(envUrl).trim().length > 0) {
    return String(envUrl).replace(/\/+$/, "");
  }

  if (import.meta.env.PROD) return PROD_PROXY_BASE;

  return ELECTRON_LOCAL_BACKEND;
}

export function getBackendCandidates(baseUrl: string = resolveBackendUrl()): string[] {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (normalized.startsWith("/")) return [normalized];

  const variants = new Set<string>([normalized]);
  if (normalized.includes("127.0.0.1")) variants.add(normalized.replace("127.0.0.1", "localhost"));
  if (normalized.includes("localhost")) variants.add(normalized.replace("localhost", "127.0.0.1"));
  if (normalized.includes(":8002")) variants.add(normalized.replace(":8002", ":8003"));
  if (normalized.includes(":8003")) variants.add(normalized.replace(":8003", ":8002"));
  return Array.from(variants);
}

/**
 * True if the current surface can reach the backend over WebSocket.
 * Returns false on production Vercel until VITE_PROD_BACKEND_WS_URL is set
 * (the Cloudflare Tunnel hostname). Local web dev and Electron always
 * return true — those surfaces don't need a separate env var because they
 * share scheme/origin with the backend.
 */
export function isLiveStreamingConfigured(): boolean {
  if (isDesktopApp()) return true;
  if (import.meta.env.PROD) {
    const prodWs = import.meta.env.VITE_PROD_BACKEND_WS_URL as string | undefined;
    return Boolean(prodWs && prodWs.trim().length > 0);
  }
  return true;
}

/**
 * Build a WebSocket URL for backend streaming endpoints.
 *
 * Resolution order:
 *   - Desktop/Electron          → ws://127.0.0.1:8002{path}
 *   - Production (Vercel HTTPS) → VITE_PROD_BACKEND_WS_URL (Cloudflare Tunnel
 *                                 hostname, e.g. wss://api.example.com). Falls
 *                                 back to converting resolveBackendUrl() if the
 *                                 env var is unset, but that fallback will hit
 *                                 mixed-content rules — users should set the var.
 *   - Local web dev             → swap http→ws on VITE_BACKEND_URL
 */
export function resolveWebSocketUrl(path: string): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;

  if (isDesktopApp()) {
    return `ws://127.0.0.1:8002${suffix}`;
  }

  if (import.meta.env.PROD) {
    const prodWs = import.meta.env.VITE_PROD_BACKEND_WS_URL as string | undefined;
    if (prodWs && prodWs.trim().length > 0) {
      return `${prodWs.replace(/\/+$/, "")}${suffix}`;
    }
    // Fallback: derive from the HTTP proxy base. The /api/backend rewrite is
    // HTTP-only, so this will likely fail for wss — log a loud warning so
    // infra forgets to set VITE_PROD_BACKEND_WS_URL are obvious at runtime.
    console.warn(
      "[backend-url] VITE_PROD_BACKEND_WS_URL not set; production WebSocket streaming will likely fail.",
    );
  }

  const base = resolveBackendUrl();
  // Handle the `/api/backend` relative-path case — there's no scheme to swap.
  if (base.startsWith("/")) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const wsOrigin = origin.replace(/^http/, "ws");
    return `${wsOrigin}${base}${suffix}`;
  }
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}${suffix}`;
}
