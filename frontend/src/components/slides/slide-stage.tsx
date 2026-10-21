import { AlertCircle, CornerDownRight, Loader2, Pause } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import type { Citation } from "@/lib/deck";
import type { Slide, SlideChange, SlidePoint } from "@/lib/types";

export type PresenterStatus = "connecting" | "live" | "unavailable";

export interface SlideStageProps {
  deckTitle: string;
  slide: Slide;
  total: number;
  presenterStatus: PresenterStatus;
  /** Index of the point being narrated (`slide.point`), or null. */
  activePoint: number | null;
  /** Point the user cut into, shown while narration is paused, or null. */
  pausedPoint: number | null;
  /** The question jump that brought this slide on screen, if any. */
  jump: SlideChange | null;
  citations: Citation[];
}

export function SlideStage({
  deckTitle,
  slide,
  total,
  presenterStatus,
  activePoint,
  pausedPoint,
  jump,
  citations,
}: SlideStageProps) {
  const position = `Slide ${slide.index + 1} of ${total}`;
  return (
    <section
      aria-label={position}
      className="relative isolate shrink-0 rounded-3xl border border-line bg-surface shadow-stage md:min-h-[22rem]"
    >
      <p aria-live="polite" className="sr-only">
        {presenterStatus === "live" ? `${position}: ${slide.title}` : ""}
      </p>
      {/* Decorations are clipped on their own layer so slide content is never cut off. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-3xl"
      >
        <div className="absolute -top-40 -right-40 size-96 rounded-full bg-[radial-gradient(circle,rgb(124_58_237/0.14),transparent_70%)]" />
        <div
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,var(--color-accent),var(--color-violet))]"
          style={{ width: `${((slide.index + 1) / total) * 100}%` }}
        />
      </div>

      <div className="flex h-full flex-col p-6 sm:p-8 xl:px-10 xl:py-8">
        <header className="flex items-center justify-between gap-4 text-xs font-medium text-ink-muted">
          <span className="truncate">{deckTitle}</span>
          <PresenterBadge status={presenterStatus} current={slide.index + 1} total={total} />
        </header>

        <div
          key={slide.index}
          className="flex flex-1 animate-slide-in flex-col gap-5 pt-5 xl:flex-row xl:items-center xl:gap-10"
        >
          <div className="min-w-0 flex-1 space-y-4">
            {jump && (
              <p className="inline-flex max-w-full items-start gap-1.5 rounded-2xl bg-accent-soft px-3 py-1.5 text-xs text-accent-strong">
                <CornerDownRight aria-hidden className="mt-px size-3.5 shrink-0" />
                <span className="min-w-0 text-pretty">
                  <span className="font-semibold">Jumped from slide {jump.fromIndex + 1}</span>
                  {jump.reason && <span> to answer: {jump.reason}</span>}
                </span>
              </p>
            )}
            <div className="space-y-2">
              <p className="text-sm font-semibold tracking-[0.14em] text-accent uppercase">
                {slide.kicker}
              </p>
              <h2 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl">
                {slide.title}
              </h2>
            </div>
            <ol className="-mx-3 space-y-1">
              {slide.points.map((point, i) => (
                <PointItem
                  key={point.text}
                  point={point}
                  active={i === activePoint}
                  paused={activePoint === null && i === pausedPoint}
                />
              ))}
            </ol>
          </div>

          {slide.stat && (
            <aside className="rounded-2xl bg-[linear-gradient(135deg,var(--color-navy),var(--color-accent)_60%,var(--color-violet))] p-6 text-white xl:w-56 xl:shrink-0">
              <p className="text-4xl font-semibold tracking-tight xl:text-5xl">
                {slide.stat.value}
              </p>
              <p className="mt-2 text-sm text-pretty text-white/80">{slide.stat.label}</p>
            </aside>
          )}
        </div>

        {citations.length > 0 && (
          <footer className="mt-5 border-t border-line pt-3 text-xs text-ink-muted">
            <h3 className="sr-only">Sources</h3>
            <ol className="space-y-0.5">
              {citations.map((citation) => (
                <li key={citation.id} className="flex gap-1.5">
                  <span className="shrink-0 font-medium tabular-nums">[{citation.id + 1}]</span>
                  <span className="text-pretty">{citation.text}</span>
                </li>
              ))}
            </ol>
          </footer>
        )}
      </div>
    </section>
  );
}

interface PointItemProps {
  point: SlidePoint;
  active: boolean;
  paused: boolean;
}

function PointItem({ point, active, paused }: PointItemProps) {
  return (
    <li
      aria-current={active || undefined}
      className={cn(
        "flex gap-3 rounded-xl px-3 py-1.5 transition-colors duration-500 ease-out",
        active && "bg-accent-soft",
        paused && "bg-canvas ring-1 ring-line ring-inset",
      )}
    >
      {paused ? (
        <Pause aria-hidden className="mt-1.5 size-3 shrink-0 fill-accent text-accent" />
      ) : (
        <span
          aria-hidden
          className={cn(
            "mt-2.5 size-1.5 shrink-0 rounded-full bg-accent transition-transform duration-500",
            active && "scale-150",
          )}
        />
      )}
      <div className="min-w-0 space-y-0.5">
        <p
          className={cn(
            "text-base font-medium text-pretty transition-colors duration-500 xl:text-lg",
            active ? "text-ink" : "text-ink-soft",
          )}
        >
          {point.text}
          {paused && (
            <span className="ml-2 align-middle text-[11px] font-medium tracking-wide text-ink-muted uppercase">
              Paused here
            </span>
          )}
        </p>
        <p className="text-sm leading-snug text-pretty text-ink-muted">{point.detail}</p>
      </div>
    </li>
  );
}

interface PresenterBadgeProps {
  status: PresenterStatus;
  current: number;
  total: number;
}

function PresenterBadge({ status, current, total }: PresenterBadgeProps) {
  if (status === "live") {
    return (
      <span className="shrink-0 tabular-nums">
        {current} / {total}
      </span>
    );
  }
  if (status === "unavailable") {
    return (
      <Chip tone="neutral" className="shrink-0">
        <AlertCircle aria-hidden className="size-3" />
        Presenter unavailable
      </Chip>
    );
  }
  return (
    <Chip tone="neutral" className="shrink-0">
      <Loader2 aria-hidden className="size-3 animate-spin" />
      Connecting to presenter…
    </Chip>
  );
}
