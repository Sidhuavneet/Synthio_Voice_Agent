import type { ReactNode } from "react";
import {
  ArrowLeft,
  CircleCheck,
  CircleHelp,
  Clock,
  Layers,
  ListChecks,
  Loader2,
  MessageCircleQuestion,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { ComplianceFlagItem } from "@/components/compliance/compliance-flag-item";
import { SlideTimeChart, slideAnchorId } from "@/components/report/slide-time-chart";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { ReportState } from "@/hooks/use-session-report";
import { formatDuration } from "@/lib/format";
import type { Deck, SessionFacts, SessionInsights } from "@/lib/types";

export interface SessionReportViewProps {
  deck: Deck;
  state: Exclude<ReportState, { status: "idle" }>;
  onExit: () => void;
}

/** Post-session report (contract §5 `SessionReport`), with a loading and a facts-only fallback. */
export function SessionReportView({ deck, state, onExit }: SessionReportViewProps) {
  const facts: SessionFacts = state.status === "ready" ? state.report : state.facts;
  const insights: SessionInsights | null = state.status === "ready" ? state.report : null;
  const generating = state.status === "generating";
  // The LLM-generated sections are skeletons while generating and hidden if generation failed.
  const showInsights = generating || insights !== null;
  const slidesShown = facts.slides.filter((slide) => slide.timeSec > 0).length;

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
        <Button variant="secondary" size="sm" onClick={onExit}>
          <ArrowLeft aria-hidden />
          Back to decks
        </Button>
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

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div className="space-y-6">
            {showInsights && (
              <ReportSection icon={<Sparkles aria-hidden />} title="Summary">
                {insights ? (
                  <p className="leading-relaxed text-pretty text-ink-soft">{insights.summary}</p>
                ) : (
                  <SkeletonLines count={3} />
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
                  <BulletList items={insights.followUps} empty="No open items." />
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
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-5 sm:p-6">
      <section className="space-y-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-ink [&_svg]:size-4 [&_svg]:text-accent">
          {icon}
          {title}
        </h2>
        {children}
      </section>
    </Card>
  );
}

function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <EmptyText>{empty}</EmptyText>;
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 text-sm text-ink-soft">
          <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
          <span className="text-pretty">{item}</span>
        </li>
      ))}
    </ul>
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
