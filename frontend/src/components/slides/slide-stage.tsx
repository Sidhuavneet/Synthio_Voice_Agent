import { AlertCircle, Loader2 } from "lucide-react";
import { Chip } from "@/components/ui/chip";
import type { Slide } from "@/lib/types";

export type PresenterStatus = "connecting" | "live" | "unavailable";

export interface SlideStageProps {
  deckTitle: string;
  slide: Slide;
  total: number;
  presenterStatus: PresenterStatus;
}

export function SlideStage({ deckTitle, slide, total, presenterStatus }: SlideStageProps) {
  const position = `Slide ${slide.index + 1} of ${total}`;
  return (
    <section
      aria-label={position}
      className="relative isolate rounded-3xl border border-line bg-surface shadow-stage md:min-h-[22rem] xl:aspect-video"
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

      <div className="flex h-full flex-col p-6 sm:p-8 xl:p-12">
        <header className="flex items-center justify-between gap-4 text-xs font-medium text-ink-muted">
          <span className="truncate">{deckTitle}</span>
          <PresenterBadge status={presenterStatus} current={slide.index + 1} total={total} />
        </header>

        <div
          key={slide.index}
          className="flex flex-1 animate-slide-in flex-col gap-6 pt-6 xl:flex-row xl:items-center xl:gap-12 xl:pt-8"
        >
          <div className="min-w-0 flex-1 space-y-4 xl:space-y-5">
            <p className="text-sm font-semibold tracking-[0.14em] text-accent uppercase">
              {slide.kicker}
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-balance text-ink sm:text-3xl xl:text-4xl">
              {slide.title}
            </h2>
            <ul className="space-y-3">
              {slide.bullets.map((bullet) => (
                <li key={bullet} className="flex gap-3 text-base text-ink-soft xl:text-lg">
                  <span
                    aria-hidden
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent xl:mt-3"
                  />
                  <span className="text-pretty">{bullet}</span>
                </li>
              ))}
            </ul>
          </div>

          {slide.stat && (
            <aside className="rounded-2xl bg-[linear-gradient(135deg,var(--color-navy),var(--color-accent)_60%,var(--color-violet))] p-6 text-white xl:w-64 xl:shrink-0">
              <p className="text-4xl font-semibold tracking-tight xl:text-5xl">
                {slide.stat.value}
              </p>
              <p className="mt-2 text-sm text-pretty text-white/80">{slide.stat.label}</p>
            </aside>
          )}
        </div>
      </div>
    </section>
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
