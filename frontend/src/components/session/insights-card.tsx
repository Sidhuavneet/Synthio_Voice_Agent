"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Gauge, ShieldAlert } from "lucide-react";
import { CompliancePanel } from "@/components/session/compliance-panel";
import { LatencyPanel } from "@/components/session/latency-panel";
import { Card } from "@/components/ui/card";
import type { LatencyStats } from "@/hooks/use-agent-events";
import { cn } from "@/lib/cn";
import type { ComplianceFlag } from "@/lib/types";

type Tab = "latency" | "compliance";

const TABS: readonly Tab[] = ["latency", "compliance"];

export interface InsightsCardProps {
  latency: LatencyStats;
  complianceFlags: ComplianceFlag[];
  className?: string;
}

/**
 * Latency and compliance in one fixed-height card with tabs, so a growing flag list scrolls
 * inside the card instead of squeezing the transcript.
 */
export function InsightsCard({ latency, complianceFlags, className }: InsightsCardProps) {
  const [tab, setTab] = useState<Tab>("latency");
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({ latency: null, compliance: null });
  const id = useId();
  const tabId = (value: Tab) => `${id}-tab-${value}`;
  const panelId = `${id}-panel`;

  // Arrow keys move between tabs (WAI-ARIA tabs pattern, automatic activation).
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const flagCount = complianceFlags.length;

  return (
    <Card className={cn("flex h-56 shrink-0 flex-col overflow-hidden", className)}>
      <div
        role="tablist"
        aria-label="Session insights"
        onKeyDown={handleKeyDown}
        className="flex shrink-0 gap-1 border-b border-line px-3 pt-2"
      >
        {TABS.map((value) => (
          <TabButton
            key={value}
            ref={(el) => {
              tabRefs.current[value] = el;
            }}
            id={tabId(value)}
            controls={panelId}
            selected={tab === value}
            onSelect={() => setTab(value)}
          >
            {value === "latency" ? (
              <>
                <Gauge aria-hidden className="size-3.5" />
                Latency
              </>
            ) : (
              <>
                <ShieldAlert aria-hidden className="size-3.5" />
                Compliance
                {flagCount > 0 && (
                  <span className="rounded-full bg-warning-soft px-1.5 py-px text-[11px] font-semibold text-warning tabular-nums">
                    <span className="sr-only">, </span>
                    {flagCount}
                    <span className="sr-only"> flagged</span>
                  </span>
                )}
              </>
            )}
          </TabButton>
        ))}
      </div>
      <div
        role="tabpanel"
        id={panelId}
        aria-labelledby={tabId(tab)}
        tabIndex={0}
        className="min-h-0 flex-1 overflow-y-auto p-5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        {tab === "latency" ? (
          <LatencyPanel latency={latency} />
        ) : (
          <CompliancePanel flags={complianceFlags} />
        )}
      </div>
    </Card>
  );
}

export interface TabButtonProps {
  ref: (el: HTMLButtonElement | null) => void;
  id: string;
  controls: string;
  selected: boolean;
  onSelect: () => void;
  children: ReactNode;
}

export function TabButton({ ref, id, controls, selected, onSelect, children }: TabButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      role="tab"
      id={id}
      aria-selected={selected}
      aria-controls={controls}
      tabIndex={selected ? 0 : -1}
      onClick={onSelect}
      className={cn(
        "-mb-px flex items-center gap-1.5 border-b-2 px-2.5 py-2 text-xs font-semibold tracking-wide uppercase transition-colors",
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        selected
          ? "border-accent text-ink"
          : "border-transparent text-ink-muted hover:text-ink-soft",
      )}
    >
      {children}
    </button>
  );
}
