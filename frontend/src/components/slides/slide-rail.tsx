import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { Slide } from "@/lib/types";

export interface SlideRailProps {
  slides: Slide[];
  currentIndex: number;
  pendingIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}

export function SlideRail({
  slides,
  currentIndex,
  pendingIndex,
  disabled,
  onSelect,
}: SlideRailProps) {
  const busy = disabled || pendingIndex !== null;
  const lastIndex = slides.length - 1;

  return (
    <nav aria-label="Slides" className="flex items-center gap-2 sm:gap-3">
      <Button
        variant="secondary"
        size="icon"
        aria-label="Previous slide"
        disabled={busy || currentIndex <= 0}
        onClick={() => onSelect(currentIndex - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>

      <ol className="flex min-w-0 flex-1 gap-1.5 overflow-x-auto py-1 sm:gap-2">
        {slides.map((slide) => {
          const isCurrent = slide.index === currentIndex;
          const isPending = slide.index === pendingIndex;
          return (
            <li key={slide.index} className="min-w-0 flex-1 basis-10 sm:basis-24">
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Go to slide ${slide.index + 1}: ${slide.title}`}
                title={slide.title}
                disabled={busy || isCurrent}
                onClick={() => onSelect(slide.index)}
                className={cn(
                  "flex w-full flex-col gap-2 rounded-xl px-2.5 py-2 text-left transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  "disabled:cursor-default",
                  isCurrent ? "bg-accent-soft" : "hover:bg-surface enabled:hover:shadow-card",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "h-1 w-full rounded-full",
                    slide.index <= currentIndex ? "bg-accent" : "bg-line",
                  )}
                />
                <span className="flex items-center gap-1.5 text-xs font-medium">
                  <span
                    className={cn("tabular-nums", isCurrent ? "text-accent" : "text-ink-muted")}
                  >
                    {String(slide.index + 1).padStart(2, "0")}
                  </span>
                  {isPending && <Loader2 aria-hidden className="size-3 animate-spin text-accent" />}
                  <span
                    className={cn(
                      "hidden truncate sm:inline",
                      isCurrent ? "text-ink" : "text-ink-muted",
                    )}
                  >
                    {slide.kicker}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <Button
        variant="secondary"
        size="icon"
        aria-label="Next slide"
        disabled={busy || currentIndex >= lastIndex}
        onClick={() => onSelect(currentIndex + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
