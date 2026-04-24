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
