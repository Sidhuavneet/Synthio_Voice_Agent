import { cn } from "@/lib/cn";
import { formatDuration } from "@/lib/format";
import type { SlideTime } from "@/lib/types";

/** Anchor id of a slide's row, so other report sections can link to it. */
export function slideAnchorId(index: number): string {
  return `report-slide-${index}`;
}

/** Horizontal bars of how long each slide was on screen. */
export function SlideTimeChart({ slides }: { slides: SlideTime[] }) {
  const longest = Math.max(1, ...slides.map((slide) => slide.timeSec));

  return (
    <ol className="space-y-1">
      {slides.map((slide) => (
        <li
          key={slide.index}
          id={slideAnchorId(slide.index)}
          className="-mx-2 scroll-mt-6 rounded-lg px-2 py-1.5 transition-colors duration-700 target:bg-accent-soft"
        >
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="flex min-w-0 gap-2">
              <span className="shrink-0 text-xs font-medium text-ink-muted tabular-nums">
                {String(slide.index + 1).padStart(2, "0")}
              </span>
              <span className="truncate text-ink-soft">{slide.title}</span>
            </span>
            <span
              className={cn(
                "shrink-0 text-xs tabular-nums",
                slide.timeSec > 0 ? "font-medium text-ink" : "text-ink-muted",
              )}
            >
              {slide.timeSec > 0 ? formatDuration(slide.timeSec) : "Not shown"}
            </span>
          </div>
          <div aria-hidden className="mt-1.5 h-1.5 rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent),var(--color-violet))]"
              style={{ width: `${(slide.timeSec / longest) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
