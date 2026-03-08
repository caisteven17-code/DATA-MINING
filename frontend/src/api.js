/**
 * api.js
 * HTTP client for Byteme FastAPI backend.
 * Falls back to browser-only (engine.js) mode if backend is unavailable.
 */

const BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

async function apiFetch(path, opts = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API error");
  }
  return res.json();
}

export async function uploadCSV(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/api/upload`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "Upload failed");
  }
  return res.json();
}

export const api = {
  health:          ()      => apiFetch("/api/health"),
  dashboard:       ()      => apiFetch("/api/dashboard"),
  reset:           ()      => apiFetch("/api/reset", { method: "POST" }),
  iterations:      ()      => apiFetch("/api/iterations"),
  iteration:       (id)    => apiFetch(`/api/iterations/${id}`),
  rules:           (n=50)  => apiFetch(`/api/rules?limit=${n}`),
  homepage:        ()      => apiFetch("/api/recommendations/homepage"),
  bundles:         ()      => apiFetch("/api/recommendations/bundles"),
  fbt:             (item)  => apiFetch(`/api/recommendations/fbt${item ? `?item=${encodeURIComponent(item)}` : ""}`),
  crosssell:       (item)  => apiFetch(`/api/recommendations/crosssell${item ? `?item=${encodeURIComponent(item)}` : ""}`),
  promos:          ()      => apiFetch("/api/recommendations/promos"),
  insights:        ()      => apiFetch("/api/recommendations/insights"),
};
