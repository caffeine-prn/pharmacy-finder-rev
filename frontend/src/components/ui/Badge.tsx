// frontend/src/components/ui/Badge.tsx
import { type ReactNode } from "react";

type BadgeVariant = "pharmacy" | "herbal" | "animal" | "cross" | "noYkiho" | "default";

const variantStyles: Record<BadgeVariant, string> = {
  pharmacy:
    "bg-emerald-50 text-emerald-700 border-emerald-200",
  herbal:
    "bg-rose-50 text-rose-700 border-rose-200",
  animal:
    "bg-orange-50 text-orange-700 border-orange-200",
  cross:
    "bg-violet-50 text-violet-700 border-violet-200",
  noYkiho:
    "bg-zinc-100 text-zinc-500 border-zinc-200",
  default:
    "bg-zinc-50 text-zinc-600 border-zinc-200",
};

interface BadgeProps {
  variant?: BadgeVariant;
  children: ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${variantStyles[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
