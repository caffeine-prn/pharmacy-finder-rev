export type CommunityBadgeType =
  | "unregistered_herbal_staff"
  | "suspected_discounting"
  | "warehouse_style"
  | "other";

export type BadgeEvidenceType =
  | "visit"
  | "consultation"
  | "signage"
  | "job_posting"
  | "photo"
  | "other";

export type BadgeReportStatus =
  | "pending"
  | "reviewing"
  | "approved"
  | "rejected"
  | "needs_more_evidence";

export const COMMUNITY_BADGE_OPTIONS: Array<{
  type: CommunityBadgeType;
  label: string;
  publicLabel: string;
}> = [
  {
    type: "unregistered_herbal_staff",
    label: "HIRA 미반영 한약사 근무 제보",
    publicLabel: "현장 한약사 제보",
  },
  {
    type: "suspected_discounting",
    label: "난매 의심",
    publicLabel: "난매 의심 제보",
  },
  {
    type: "warehouse_style",
    label: "창고형/기형적 약국 의심",
    publicLabel: "창고형 약국 의심",
  },
  {
    type: "other",
    label: "기타 운영 특이사항",
    publicLabel: "운영 특이사항",
  },
];

export const EVIDENCE_OPTIONS: Array<{ type: BadgeEvidenceType; label: string }> = [
  { type: "visit", label: "직접 방문" },
  { type: "consultation", label: "상담/응대 경험" },
  { type: "signage", label: "명찰/안내문/게시물" },
  { type: "job_posting", label: "구인공고/채용정보" },
  { type: "photo", label: "사진 등 자료 보유" },
  { type: "other", label: "기타" },
];

export function isCommunityBadgeType(value: unknown): value is CommunityBadgeType {
  return COMMUNITY_BADGE_OPTIONS.some((option) => option.type === value);
}

export function isEvidenceType(value: unknown): value is BadgeEvidenceType {
  return EVIDENCE_OPTIONS.some((option) => option.type === value);
}

export function badgeTypeLabel(type: CommunityBadgeType | string) {
  return COMMUNITY_BADGE_OPTIONS.find((option) => option.type === type)?.label || "기타";
}

export function publicBadgeLabel(type: CommunityBadgeType | string) {
  return COMMUNITY_BADGE_OPTIONS.find((option) => option.type === type)?.publicLabel || "제보";
}

export function sanitizeText(value: unknown, maxLength: number) {
  return String(value || "").trim().slice(0, maxLength);
}

