"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Copy,
  CircleCheck,
  CircleHelp,
  Clock,
  Layers,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  MessagesSquare,
  ShieldAlert,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { ComplianceFlagItem } from "@/components/compliance/compliance-flag-item";
import { FollowUpList } from "@/components/report/follow-up-list";
import { SessionTimeline } from "@/components/report/session-timeline";
import { SlideTimeChart, slideAnchorId } from "@/components/report/slide-time-chart";
import { TranscriptList } from "@/components/session/transcript";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { TimelineEntry } from "@/hooks/use-agent-events";
import type { ReportState } from "@/hooks/use-session-report";
import { COMPLIANCE_CATEGORY_LABELS, formatDuration } from "@/lib/format";
import { formatFollowUpEmail } from "@/lib/report";
import { cn } from "@/lib/cn";
import { buildSessionTimeline, type SessionSpan } from "@/lib/timeline";
import { formatTranscript, type TranscriptRow } from "@/lib/transcript";
import type { Deck, SessionFacts, SessionInsights, SessionReport } from "@/lib/types";

export interface SessionReportViewProps {
  deck: Deck;
  state: Exclude<ReportState, { status: "idle" }>;
  /** Slide changes and interruptions seen live, for the session timeline. */
  timeline: TimelineEntry[];
  /** Null if the presenter never synced. */
  span: SessionSpan | null;
  /** The session transcript as shown when the session ended (empty if not captured). */
  transcript?: TranscriptRow[];
  onExit: () => void;
}

const NO_TRANSCRIPT: TranscriptRow[] = [];

/** Post-session report (contract §5 `SessionReport`), with a loading and a facts-only fallback. */
export function SessionReportView({
  deck,
  state,
  timeline,
  span,
  transcript = NO_TRANSCRIPT,
  onExit,
}: SessionReportViewProps) {
  const facts: SessionFacts = state.status === "ready" ? state.report : state.facts;
  const insights: SessionInsights | null = state.status === "ready" ? state.report : null;
  const generating = state.status === "generating";
  // The LLM-generated sections are skeletons while generating and hidden if generation failed.
  const showInsights = generating || insights !== null;
  const slidesShown = facts.slides.filter((slide) => slide.timeSec > 0).length;
  const slideTitle = (index: number) => deck.slides[index]?.title ?? `Slide ${index + 1}`;
  const story =
    span && buildSessionTimeline(span, timeline, facts.complianceFlags, (i) => `slide ${i + 1}`);

  const slideLink = (index: number) => (
    <a
      href={`#${slideAnchorId(index)}`}
      className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent"
    >
      Slide {index + 1}
      {deck.slides[index] && <span className="font-normal"> · {deck.slides[index].title}</span>}
    </a>
  );

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-8 sm:py-10">
      <header className="flex items-center justify-between gap-4">
        <BrandMark />
        <div className="flex flex-wrap justify-end gap-2">
          {state.status === "ready" && <CopyEmailButton deck={deck} report={state.report} />}
          <Button variant="secondary" size="sm" onClick={onExit}>
            <ArrowLeft aria-hidden />
            Back to decks
          </Button>
        </div>
      </header>

      <main className="mt-8 space-y-6 sm:mt-12">
        <div className="space-y-2">
          <p className="text-sm font-medium tracking-wide text-accent">Session report</p>
          <h1 className="text-3xl font-semibold tracking-tight text-balance text-ink sm:text-4xl">
            {deck.title}
          </h1>
          <p className="text-ink-muted">
            Presented by {deck.presenter.name}, {deck.presenter.role}
          </p>
        </div>

        {generating && (
          <div
            role="status"
            className="flex items-center gap-3 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-strong"
          >
            <Loader2 aria-hidden className="size-4 shrink-0 animate-spin" />
            <span>
              <span className="font-semibold">Generating your report…</span>{" "}
              <span className="text-ink-soft">This can take up to 30 seconds.</span>
            </span>
          </div>
        )}
        {state.status === "failed" && (
          <Alert title="The full report isn't available">
            {state.error} Showing what was recorded in this browser.
          </Alert>
        )}

        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat
            icon={<Clock aria-hidden />}
            label="Duration"
            value={formatDuration(facts.durationSec)}
          />
          <Stat
            icon={<Layers aria-hidden />}
            label="Slides shown"
            value={`${slidesShown} / ${deck.slides.length}`}
          />
          <Stat
            icon={<MessageCircleQuestion aria-hidden />}
            label="Questions"
            value={insights ? String(insights.questions.length) : "—"}
          />
          <Stat
            icon={<ShieldAlert aria-hidden />}
            label="Compliance flags"
            value={String(facts.complianceFlags.length)}
          />
        </dl>

        {story && span && (
          <ReportSection icon={<Waypoints aria-hidden />} title="Session timeline">
            <SessionTimeline
              segments={story.segments}
              moments={story.moments}
              durationSec={(span.endedAt - span.startedAt) / 1000}
              slideTitle={slideTitle}
            />
          </ReportSection>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            {showInsights && (
              <ReportSection icon={<Sparkles aria-hidden />} title="Summary">
                {!insights ? (
                  <SkeletonLines count={3} />
                ) : insights.summary.trim() ? (
                  <p className="leading-relaxed text-pretty text-ink-soft">{insights.summary}</p>
                ) : (
                  <EmptyText>A summary couldn&apos;t be written for this session.</EmptyText>
                )}
              </ReportSection>
            )}

            {showInsights && (
              <ReportSection icon={<MessageCircleQuestion aria-hidden />} title="Questions asked">
                {!insights ? (
                  <SkeletonLines count={2} />
                ) : insights.questions.length === 0 ? (
                  <EmptyText>No questions were asked.</EmptyText>
                ) : (
                  <ul className="divide-y divide-line">
                    {insights.questions.map((item, i) => (
                      <li key={i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                        {item.answered ? (
                          <CircleCheck aria-hidden className="mt-0.5 size-4 shrink-0 text-success" />
                        ) : (
                          <CircleHelp aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
                        )}
                        <span className="sr-only">{item.answered ? "Answered:" : "Open:"}</span>
                        <div className="min-w-0 space-y-1">
                          <p className="text-sm text-pretty text-ink">{item.question}</p>
                          <p className="text-xs">{slideLink(item.slideIndex)}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </ReportSection>
            )}

            <ReportSection icon={<Clock aria-hidden />} title="Time per slide">
              <SlideTimeChart slides={facts.slides} />
            </ReportSection>
          </div>

          <div className="space-y-6">
            <ReportSection icon={<ShieldAlert aria-hidden />} title="Compliance flags">
              {facts.complianceFlags.length === 0 ? (
                <EmptyText>No questions needed a compliance deflection.</EmptyText>
              ) : (
                <ul className="divide-y divide-line">
                  {facts.complianceFlags.map((flag) => (
                    <li key={flag.id} className="py-3 first:pt-0 last:pb-0">
                      <ComplianceFlagItem flag={flag} slideLabel={slideLink(flag.slideIndex)} />
                    </li>
                  ))}
                </ul>
              )}
            </ReportSection>

            {showInsights && (
              <ReportSection icon={<ListChecks aria-hidden />} title="Follow-ups">
                {insights ? (
                  <FollowUpList items={insights.followUps} />
                ) : (
                  <SkeletonLines count={2} />
                )}
              </ReportSection>
            )}

            {showInsights && (
              <ReportSection icon={<Sparkles aria-hidden />} title="Interests">
                {insights ? (
                  insights.interests.length === 0 ? (
                    <EmptyText>No clear interests yet.</EmptyText>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {insights.interests.map((interest, i) => (
                        <li
                          key={i}
                          className="rounded-full bg-accent-soft px-3 py-1 text-sm text-accent-strong"
                        >
                          {interest}
                        </li>
                      ))}
                    </ul>
                  )
                ) : (
                  <SkeletonLines count={1} />
                )}
              </ReportSection>
            )}
          </div>
        </div>

        <ReportSection
          icon={<MessagesSquare aria-hidden />}
          title="Transcript"
          action={
            transcript.length > 0 && (
              <CopyButton
                label="Copy transcript"
                getText={() => formatTranscript(transcript, deck.presenter.name, deck.slides)}
              />
            )
          }
        >
          {transcript.length === 0 ? (
            <EmptyText>Nothing was said in this session.</EmptyText>
          ) : (
            <CollapsibleTranscript deck={deck} rows={transcript} />
          )}
        </ReportSection>
      </main>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card className="space-y-1 p-4">
      <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-muted [&_svg]:size-3.5">
        {icon}
        {label}
      </dt>
      <dd className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{value}</dd>
    </Card>
  );
}

function ReportSection({
  icon,
  title,
  action,
  children,
}: {
  icon: ReactNode;
  title: string;
  /** Shown at the end of the heading row. */
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-ink [&_svg]:size-4 [&_svg]:text-accent">
            {icon}
            {title}
          </h2>
          {action}
        </div>
        {children}
      </section>
    </Card>
  );
}

/** Rows shown before a long transcript is expanded. */
const COLLAPSED_TRANSCRIPT_ROWS = 8;

function CollapsibleTranscript({ deck, rows }: { deck: Deck; rows: TranscriptRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const long = rows.length > COLLAPSED_TRANSCRIPT_ROWS;
  const collapsed = long && !expanded;
  return (
    <div className="space-y-3">
      <div
        id={id}
        className={cn("relative", collapsed && "max-h-96 overflow-hidden")}
        // Rows cut off by the collapsed view stay out of the tab order until expanded.
        inert={collapsed}
      >
        <TranscriptList presenterName={deck.presenter.name} rows={rows} slides={deck.slides} />
        {collapsed && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-surface to-transparent"
          />
        )}
      </div>
      {long && (
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded((value) => !value)}
        >
          <ChevronDown aria-hidden className={cn("transition-transform", expanded && "rotate-180")} />
          {expanded ? "Show less" : `Show full transcript (${rows.length} entries)`}
        </Button>
      )}
    </div>
  );
}

function CopyButton({
  label,
  getText,
  describedBy,
}: {
  label: string;
  getText: () => string;
  describedBy?: string;
}) {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getText());
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };
  return (
    <Button
      variant="secondary"
      size="sm"
      aria-describedby={describedBy}
      onClick={() => void copy()}
    >
      {status === "copied" ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span aria-live="polite">
        {status === "copied" ? "Copied" : status === "failed" ? "Copy blocked by browser" : label}
      </span>
    </Button>
  );
}

/** Copies the follow-up email; hovering or focusing the button previews exactly that text. */
function CopyEmailButton({ deck, report }: { deck: Deck; report: SessionReport }) {
  const text = useMemo(
    () => formatFollowUpEmail(deck, report, (flag) => COMPLIANCE_CATEGORY_LABELS[flag.category]),
    [deck, report],
  );
  const previewId = useId();
  // Esc hides the preview until the pointer or focus leaves (WCAG 1.4.13).
  const [dismissed, setDismissed] = useState(false);
  return (
    <div
      className="group relative"
      onKeyDown={(event) => {
        if (event.key === "Escape") setDismissed(true);
      }}
      onMouseLeave={() => setDismissed(false)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDismissed(false);
      }}
    >
      <CopyButton label="Copy follow-up email" getText={() => text} describedBy={previewId} />
      {/* Padding, not margin, bridges the gap so moving the pointer onto the preview keeps it. */}
      <div
        id={previewId}
        role="tooltip"
        className={cn(
          "invisible absolute top-full right-0 z-20 w-[min(32rem,calc(100vw-2rem))] pt-2 opacity-0 transition-opacity",
          !dismissed &&
            "group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100",
        )}
      >
        <div className="rounded-xl border border-line bg-surface shadow-stage">
          <p className="border-b border-line px-4 py-2 text-xs font-medium text-ink-muted">
            Email preview
          </p>
          <pre className="max-h-80 overflow-y-auto px-4 py-3 font-sans text-xs leading-relaxed whitespace-pre-wrap text-ink-soft">
            {text}
          </pre>
        </div>
      </div>
    </div>
  );
}

function EmptyText({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

function SkeletonLines({ count }: { count: number }) {
  return (
    <div aria-hidden className="space-y-2.5">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-3.5 animate-pulse rounded-full bg-line/70 last:w-2/3" />
      ))}
    </div>
  );
}
