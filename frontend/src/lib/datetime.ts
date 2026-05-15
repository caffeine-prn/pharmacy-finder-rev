const KST_TIME_ZONE = "Asia/Seoul";

function parseTimestamp(value: string | null | undefined) {
  if (!value) return null;

  let normalized = value.trim();
  if (!normalized) return null;

  if (!normalized.includes("T") && normalized.includes(" ")) {
    normalized = normalized.replace(" ", "T");
  }

  normalized = normalized.replace(/([+-]\d{2})$/, "$1:00");

  if (/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(normalized)) {
    normalized = `${normalized}Z`;
  }

  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function partsForKst(value: string | null | undefined) {
  const date = parseTimestamp(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("ko-KR", {
    timeZone: KST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function formatKstDate(value: string | null | undefined) {
  const parts = partsForKst(value);
  if (!parts) return value || "-";
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function formatKstTime(value: string | null | undefined) {
  const parts = partsForKst(value);
  if (!parts) return value || "";
  return `${parts.hour}:${parts.minute} KST`;
}

export function formatKstDateTime(value: string | null | undefined) {
  const parts = partsForKst(value);
  if (!parts) return value || "-";
  return `${parts.year}. ${parts.month}. ${parts.day}. ${parts.hour}:${parts.minute} KST`;
}
