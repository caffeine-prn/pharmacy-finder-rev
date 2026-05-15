"use client";

import {
  CheckCircle,
  XCircle,
  Leaf,
  PawPrint,
  UsersFour,
  IdentificationBadge,
} from "@phosphor-icons/react";
import type { Pharmacy } from "@/lib/types";

interface PharmacyStatusButtonsProps {
  pharmacy: Pick<
    Pharmacy,
    | "is_herbal_pharmacy"
    | "is_animal_pharmacy"
    | "is_cross_employed"
    | "has_ykiho"
    | "ykiho"
    | "pharmacist_count"
    | "herbal_pharmacist_count"
  >;
  compact?: boolean;
}

function StatusButton({
  active,
  label,
  detail,
  icon,
  tone,
  compact,
}: {
  active: boolean;
  label: string;
  detail: string;
  icon: React.ReactNode;
  tone: "rose" | "orange" | "violet" | "zinc";
  compact?: boolean;
}) {
  const activeStyles = {
    rose: "border-rose-300 bg-rose-50 text-rose-700",
    orange: "border-orange-300 bg-orange-50 text-orange-700",
    violet: "border-violet-300 bg-violet-50 text-violet-700",
    zinc: "border-emerald-300 bg-emerald-50 text-emerald-700",
  }[tone];

  const inactiveStyles = "border-zinc-200 bg-white text-zinc-500";

  return (
    <button
      type="button"
      aria-pressed={active}
      className={`flex min-h-11 items-center gap-2 rounded-md border px-2.5 text-left transition-colors ${
        active ? activeStyles : inactiveStyles
      } ${compact ? "py-1.5" : "py-2"}`}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-semibold">{label}</span>
        <span className="block truncate text-[11px] opacity-80">{detail}</span>
      </span>
      <span className="ml-auto shrink-0">
        {active ? <CheckCircle size={15} weight="fill" /> : <XCircle size={15} />}
      </span>
    </button>
  );
}

export function PharmacyStatusButtons({ pharmacy, compact }: PharmacyStatusButtonsProps) {
  const ykihoDetail = pharmacy.has_ykiho
    ? `요양기관번호 ${pharmacy.ykiho ?? "확인"}`
    : "HIRA 약국 API 미매칭";

  return (
    <div className={`grid gap-2 ${compact ? "grid-cols-1" : "grid-cols-2"}`}>
      <StatusButton
        active={pharmacy.is_herbal_pharmacy}
        label="한약사"
        detail={
          pharmacy.is_herbal_pharmacy
            ? `한약사 ${pharmacy.herbal_pharmacist_count || 1}명`
            : "HIRA 인력정보 없음"
        }
        icon={<Leaf size={15} weight={pharmacy.is_herbal_pharmacy ? "fill" : "regular"} />}
        tone="rose"
        compact={compact}
      />
      <StatusButton
        active={pharmacy.is_animal_pharmacy}
        label="동물약국"
        detail={pharmacy.is_animal_pharmacy ? "행안부 동물약국 매칭" : "동물약국 매칭 없음"}
        icon={<PawPrint size={15} weight={pharmacy.is_animal_pharmacy ? "fill" : "regular"} />}
        tone="orange"
        compact={compact}
      />
      <StatusButton
        active={pharmacy.is_cross_employed}
        label="교차고용"
        detail={pharmacy.is_cross_employed ? "약사+한약사 인력 동시 확인" : "교차고용 아님"}
        icon={<UsersFour size={15} weight={pharmacy.is_cross_employed ? "fill" : "regular"} />}
        tone="violet"
        compact={compact}
      />
      <StatusButton
        active={pharmacy.has_ykiho}
        label={pharmacy.has_ykiho ? "요양기관" : "요양X"}
        detail={ykihoDetail}
        icon={<IdentificationBadge size={15} weight={pharmacy.has_ykiho ? "fill" : "regular"} />}
        tone="zinc"
        compact={compact}
      />
    </div>
  );
}
