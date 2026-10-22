"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import {
  BarVisualizer,
  useAgent,
  useTrackVolume,
  type AgentState,
  type TrackReference,
} from "@livekit/components-react";
import { MessagesSquare, Sparkles, X } from "lucide-react";
import { AgentStatus, agentStatusLabel } from "@/components/session/agent-status";
import { InsightsCard, TabButton } from "@/components/session/insights-card";
import { Transcript } from "@/components/session/transcript";
import type { LatencyStats } from "@/hooks/use-agent-events";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/cn";
import type { TranscriptRow } from "@/lib/transcript";
import type { ComplianceFlag, Presenter, Slide } from "@/lib/types";

type PanelTab = "conversation" | "insights";

const TABS: readonly PanelTab[] = ["conversation", "insights"];

type Tone = "speaking" | "listening" | "thinking" | "waiting" | "error";

function toneFor(state: AgentState): Tone {
  switch (state) {
    case "speaking":
    case "listening":
    case "thinking":
      return state;
    case "failed":
      return "error";
    default:
      return "waiting";
  }
}

const TONE_CLASSES: Record<Tone, { ring: string; halo: string; dot: string; avatar?: string }> = {
  speaking: { ring: "ring-accent", halo: "bg-accent/25", dot: "bg-accent" },
  listening: { ring: "ring-success", halo: "bg-success/15", dot: "bg-success" },
  thinking: {
    ring: "ring-warning",
    halo: "bg-warning/20 motion-safe:animate-pulse",
    dot: "bg-warning",
  },
  waiting: {
    ring: "ring-line-strong",
    halo: "bg-transparent",
    dot: "bg-ink-muted",
    avatar: "grayscale opacity-75",
  },
  error: { ring: "ring-danger", halo: "bg-danger/10", dot: "bg-danger", avatar: "grayscale" },
};

const AVATAR_GRADIENT = "bg-[linear-gradient(135deg,var(--color-accent),var(--color-violet))]";

const HINT_SEEN_KEY = "synthio.bubbleHintSeen";

function readHintSeen(): boolean {
  try {
    return window.localStorage.getItem(HINT_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

function writeHintSeen(): void {
  try {
    window.localStorage.setItem(HINT_SEEN_KEY, "1");
  } catch {
    // Storage unavailable: the hint simply shows again next session.
  }
}

export function initials(name: string): string {
  return name
    .replace(/^dr\.?\s+/i, "")
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export interface PresenterBubbleProps {
  presenter: Presenter;
  /** The session transcript (messages and timeline markers). */
  transcript: TranscriptRow[];
  slides: Slide[];
  latency: LatencyStats;
  complianceFlags: ComplianceFlag[];
}

/**
 * The presenter as a floating bubble (bottom right) whose colour follows the agent's state.
 * It opens a panel with the live conversation and the session insights: anchored above the
 * bubble on larger screens, a bottom sheet on phones.
 */
export function PresenterBubble({
  presenter,
  transcript,
  slides,
  latency,
  complianceFlags,
}: PresenterBubbleProps) {
  const agent = useAgent();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PanelTab>("conversation");
  const bubbleRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const panelId = useId();

  // Messages read so far: the panel being open marks everything as read.
  const messageCount = transcript.filter((row) => row.kind === "message").length;
  const [readCount, setReadCount] = useState(messageCount);
  if (open && readCount !== messageCount) setReadCount(messageCount);
  const unread = !open && messageCount > readCount;

  const close = () => {
    restoreFocus.current = true;
    setOpen(false);
  };

  useEffect(() => {
    if (!open) {
      // After the bubble is visible again (it is hidden behind the sheet on phones).
      if (restoreFocus.current) bubbleRef.current?.focus();
      restoreFocus.current = false;
      return;
    }
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      restoreFocus.current = true;
      setOpen(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const tone = toneFor(agent.state);
  const status = agentStatusLabel(agent.state);
  // Until the bubble is opened once (remembered), point out that it holds the chat.
  const [hintSeen, setHintSeen] = useState(readHintSeen);
  const toggle = () => {
    if (!hintSeen) {
      setHintSeen(true);
      writeHintSeen();
    }
    setOpen((value) => !value);
  };

  return (
    <>
      {open && (
        <>
          <div aria-hidden onClick={close} className="fixed inset-0 z-40 bg-ink/30 sm:hidden" />
          <PresenterPanel
            id={panelId}
            presenter={presenter}
            transcript={transcript}
            slides={slides}
            latency={latency}
            complianceFlags={complianceFlags}
            tab={tab}
            onTabChange={setTab}
            onClose={close}
          />
        </>
      )}
      <button
        ref={bubbleRef}
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={`${presenter.name}, ${status.toLowerCase()}. ${open ? "Hide" : "Show"} conversation and insights${unread ? " (new messages)" : ""}`}
        onClick={toggle}
        className={cn(
          "group fixed right-4 bottom-4 z-50 flex items-center gap-2.5 rounded-full sm:right-6 sm:bottom-6",
          "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent",
          open && "max-sm:hidden",
        )}
      >
        <span className="flex max-w-40 flex-col items-end rounded-2xl bg-surface/95 px-3 py-1.5 text-right shadow-card ring-1 ring-line backdrop-blur transition-colors group-hover:bg-surface">
          <span className="w-full truncate text-xs leading-tight font-semibold text-ink">
            {presenter.name}
          </span>
          <span className="flex items-center gap-1 text-[11px] leading-tight text-ink-muted">
            <span aria-hidden className={cn("size-1.5 rounded-full", TONE_CLASSES[tone].dot)} />
            {status}
          </span>
          {!hintSeen && !open && (
            <span className="mt-0.5 flex items-center gap-1 text-[11px] leading-tight font-medium text-accent motion-safe:animate-pulse">
              <MessagesSquare aria-hidden className="size-3" />
              Tap to see the chat
            </span>
          )}
        </span>
        <Avatar name={presenter.name} tone={tone} track={agent.microphoneTrack} unread={unread} />
      </button>
    </>
  );
}

interface AvatarProps {
  name: string;
  tone: Tone;
  track: TrackReference | undefined;
  unread: boolean;
}

function Avatar({ name, tone, track, unread }: AvatarProps) {
  const classes = TONE_CLASSES[tone];
  return (
    <span className="relative flex size-14 shrink-0 items-center justify-center">
      {tone === "speaking" ? (
        <SpeakingHalo track={track} />
      ) : (
        <span
          aria-hidden
          className={cn(
            "absolute -inset-1.5 rounded-full transition-colors duration-300",
            classes.halo,
          )}
        />
      )}
      <span
        aria-hidden
        className={cn(
          "relative flex size-14 items-center justify-center rounded-full text-base font-semibold text-white shadow-stage",
          "ring-[3px] ring-offset-2 ring-offset-canvas transition-[box-shadow,filter,opacity] duration-300 group-hover:brightness-110",
          AVATAR_GRADIENT,
          classes.ring,
          classes.avatar,
        )}
      >
        {initials(name)}
      </span>
      {unread && (
        <span
          aria-hidden
          className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-danger ring-2 ring-canvas"
        />
      )}
    </span>
  );
}

/** A halo that swells with the presenter's voice (static when motion is reduced). */
function SpeakingHalo({ track }: { track: TrackReference | undefined }) {
  const volume = useTrackVolume(track);
  const reducedMotion = usePrefersReducedMotion();
  const scale = reducedMotion ? 1.12 : 1.06 + Math.min(volume * 1.6, 0.34);
  return (
    <span
      aria-hidden
      className="absolute inset-0 rounded-full bg-accent/25 transition-transform duration-100 ease-out"
      style={{ transform: `scale(${scale})` }}
    />
  );
}

interface PresenterPanelProps extends PresenterBubbleProps {
  id: string;
  tab: PanelTab;
  onTabChange: (tab: PanelTab) => void;
  onClose: () => void;
}

function PresenterPanel({
  id,
  presenter,
  transcript,
  slides,
  latency,
  complianceFlags,
  tab,
  onTabChange,
  onClose,
}: PresenterPanelProps) {
  const agent = useAgent();
  const titleId = useId();
  const tabsId = useId();
  const tabRefs = useRef<Record<PanelTab, HTMLButtonElement | null>>({
    conversation: null,
    insights: null,
  });
  const tabId = (value: PanelTab) => `${tabsId}-tab-${value}`;
  const tabPanelId = `${tabsId}-panel`;

  // Focus moves into the panel when it opens.
  const initialTab = useRef(tab);
  useEffect(() => {
    tabRefs.current[initialTab.current]?.focus();
  }, []);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.key === "ArrowRight" ? 1 : -1;
    const next = TABS[(TABS.indexOf(tab) + step + TABS.length) % TABS.length];
    onTabChange(next);
    tabRefs.current[next]?.focus();
  };

  const flagCount = complianceFlags.length;

  return (
    <div
      id={id}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex h-[80dvh] flex-col overflow-hidden rounded-t-3xl border border-line bg-surface shadow-stage animate-sheet-in",
        "sm:inset-x-auto sm:right-6 sm:bottom-24 sm:h-[min(620px,calc(100dvh-8rem))] sm:w-[400px] sm:origin-bottom-right sm:rounded-2xl sm:animate-panel-in",
      )}
    >
      <span aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line sm:hidden" />
      <div className="shrink-0 space-y-3 border-b border-line px-4 pt-3 pb-3 sm:pt-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-hidden
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white",
                AVATAR_GRADIENT,
              )}
            >
              {initials(presenter.name)}
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate font-semibold text-ink">
                {presenter.name}
              </h2>
              <p className="truncate text-sm text-ink-muted">{presenter.role}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <AgentStatus state={agent.state} />
            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="rounded-full p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X aria-hidden className="size-4" />
            </button>
          </div>
        </div>
        <div aria-hidden className="h-9 rounded-xl bg-canvas py-2">
          <BarVisualizer
            state={agent.state}
            track={agent.microphoneTrack}
            barCount={7}
            options={{ minHeight: 8 }}
            className="h-full"
          />
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Presenter panel"
        onKeyDown={handleTabKeyDown}
        className="flex shrink-0 gap-1 border-b border-line px-3 pt-1"
      >
        {TABS.map((value) => (
          <TabButton
            key={value}
            ref={(el) => {
              tabRefs.current[value] = el;
            }}
            id={tabId(value)}
            controls={tabPanelId}
            selected={tab === value}
            onSelect={() => onTabChange(value)}
          >
            {value === "conversation" ? (
              <>
                <MessagesSquare aria-hidden className="size-3.5" />
                Conversation
              </>
            ) : (
              <>
                <Sparkles aria-hidden className="size-3.5" />
                Insights
                {flagCount > 0 && (
                  <span className="rounded-full bg-warning-soft px-1.5 py-px text-[11px] font-semibold text-warning tabular-nums">
                    <span className="sr-only">, </span>
                    {flagCount}
                    <span className="sr-only"> compliance flags</span>
                  </span>
                )}
              </>
            )}
          </TabButton>
        ))}
      </div>

      <div
        role="tabpanel"
        id={tabPanelId}
        aria-labelledby={tabId(tab)}
        className="flex min-h-0 flex-1 flex-col"
      >
        {tab === "conversation" ? (
          <Transcript presenterName={presenter.name} rows={transcript} slides={slides} />
        ) : (
          <InsightsCard
            latency={latency}
            complianceFlags={complianceFlags}
            className="h-auto min-h-0 flex-1 rounded-none border-0 shadow-none"
          />
        )}
      </div>
    </div>
  );
}
