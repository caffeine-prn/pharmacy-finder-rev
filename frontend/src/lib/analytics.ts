"use client";

type AnalyticsMetadata = Record<string, unknown>;

interface AnalyticsEvent {
  eventName: string;
  pharmacyId?: string | null;
  view?: string | null;
  metadata?: AnalyticsMetadata;
}

const SESSION_KEY = "pharmacy_finder_session_id";

function getSessionId() {
  try {
    const existing = window.localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const next =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    window.localStorage.setItem(SESSION_KEY, next);
    return next;
  } catch {
    return null;
  }
}

export function trackAnalyticsEvent({
  eventName,
  pharmacyId = null,
  view = null,
  metadata = {},
}: AnalyticsEvent) {
  if (typeof window === "undefined") return;

  const payload = {
    event_name: eventName,
    session_id: getSessionId(),
    pharmacy_id: pharmacyId,
    view,
    path: `${window.location.pathname}${window.location.search}`,
    referrer: document.referrer || null,
    metadata,
  };

  const body = JSON.stringify(payload);
  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      if (navigator.sendBeacon("/api/analytics/event", blob)) return;
    }
  } catch {
    // Fall through to fetch.
  }

  void fetch("/api/analytics/event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}
