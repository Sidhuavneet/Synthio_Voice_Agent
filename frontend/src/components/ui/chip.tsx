import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ChipTone = "accent" | "neutral" | "inverse" | "warning" | "danger";

const toneClasses: Record<ChipTone, string> = {
  accent: "bg-accent-soft text-accent-strong",
  neutral: "bg-canvas text-ink-soft ring-1 ring-line ring-inset",
  inverse: "bg-white/15 text-white ring-1 ring-white/25 ring-inset",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
};

export interface ChipProps extends ComponentProps<"span"> {
  tone?: ChipTone;
}

export function Chip({ tone = "accent", className, ...props }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium tracking-wide",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
