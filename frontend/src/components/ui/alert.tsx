import type { ReactNode } from "react";
import { AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/cn";

type AlertTone = "danger" | "info";

export interface AlertProps {
  tone?: AlertTone;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function Alert({ tone = "danger", title, children, action, className }: AlertProps) {
  const Icon = tone === "danger" ? AlertTriangle : Info;
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn(
        "flex flex-col gap-3 rounded-xl px-4 py-3 text-sm sm:flex-row sm:items-center",
        tone === "danger" ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-strong",
        className,
      )}
    >
      <div className="flex flex-1 gap-3">
        <Icon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-0.5">
          <p className="font-semibold">{title}</p>
          {children && <div className="text-ink-soft">{children}</div>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-7 sm:pl-0">{action}</div>}
    </div>
  );
}
