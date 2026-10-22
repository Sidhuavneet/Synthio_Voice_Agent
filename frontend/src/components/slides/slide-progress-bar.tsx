"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { recordPoint, segmentFill, type FurthestPoints } from "@/lib/slide-progress";
import type { Slide } from "@/lib/types";

export interface SlideProgressBarProps {
  slides: Slide[];
  currentIndex: number;
  /** Point being narrated on the current slide (`slide.point`), or null. */
  pointIndex: number | null;
  /** Slides already fully presented (`slide.presented`). */
  presented: number[];
  pendingIndex: number | null;
  disabled: boolean;
  onSelect: (index: number) => void;
}

/**
 * The slide index as a segmented progress bar: presented slides are full, the current one fills
 * as its points are narrated, later ones are empty. Each segment jumps to its slide.
 */
export function SlideProgressBar({
  slides,
  currentIndex,
  pointIndex,
  presented,
  pendingIndex,
  disabled,
  onSelect,
}: SlideProgressBarProps) {
  // The furthest point narrated per slide, so the fill holds during Q&A (`slide.point` is -1).
  const [furthest, setFurthest] = useState<FurthestPoints>({});
  const next = recordPoint(furthest, currentIndex, pointIndex);
  // Adjusts state during render (no effect), as recordPoint returns the same object when idle.
  if (next !== furthest) setFurthest(next);

  const listRef = useRef<HTMLOListElement>(null);
  const done = new Set(presented);
  const busy = disabled || pendingIndex !== null;
  const lastIndex = slides.length - 1;

  // Arrow keys, Home and End move focus between the slide segments.
  const handleKeyDown = (event: KeyboardEvent<HTMLOListElement>) => {
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
    if (!keys.includes(event.key) || !listRef.current) return;
    const buttons = [...listRef.current.querySelectorAll<HTMLButtonElement>("button:enabled")];
    if (buttons.length === 0) return;
    event.preventDefault();
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const step = event.key === "ArrowRight" ? 1 : -1;
    let target = at === -1 ? 0 : Math.min(buttons.length - 1, Math.max(0, at + step));
    if (event.key === "Home") target = 0;
    if (event.key === "End") target = buttons.length - 1;
    buttons[target].focus();
  };

  return (
    <nav aria-label="Slides" className="flex shrink-0 items-center gap-1.5 sm:gap-2">
      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Previous slide"
        disabled={busy || currentIndex <= 0}
        onClick={() => onSelect(currentIndex - 1)}
      >
        <ChevronLeft aria-hidden />
      </Button>

      <ol
        ref={listRef}
        onKeyDown={handleKeyDown}
        className="flex min-w-0 flex-1 items-center gap-1 sm:gap-1.5"
      >
        {slides.map((slide) => {
          const isCurrent = slide.index === currentIndex;
          const isPending = slide.index === pendingIndex;
          const isDone = done.has(slide.index);
          const fill = segmentFill({
            index: slide.index,
            currentIndex,
            presented: done,
            furthest,
            pointCount: slide.points.length,
          });
          return (
            <li key={slide.index} className="relative min-w-0 flex-1">
              <button
                type="button"
                aria-current={isCurrent ? "step" : undefined}
                aria-label={`Go to slide ${slide.index + 1}: ${slide.title}${isDone ? " (covered)" : ""}`}
                disabled={busy || isCurrent}
                onClick={() => onSelect(slide.index)}
                className={cn(
                  "peer group block w-full rounded-full py-2.5",
                  "focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent",
                  "disabled:cursor-default",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "relative block overflow-hidden rounded-full transition-[height,background-color] duration-300",
                    isCurrent ? "h-2 bg-accent-soft ring-1 ring-accent-light ring-inset" : "h-1.5",
                    !isCurrent && "bg-line group-enabled:group-hover:bg-line-strong",
                    isPending && "motion-safe:animate-pulse",
                  )}
                >
                  <span
                    className={cn(
                      "absolute inset-0 origin-left rounded-full transition-transform duration-700 ease-out",
                      isCurrent && !isDone
                        ? "bg-[linear-gradient(90deg,var(--color-accent),var(--color-violet))]"
                        : "bg-accent",
                    )}
                    style={{ transform: `scaleX(${fill})` }}
                  />
                </span>
              </button>
              {/* Tooltip on hover and keyboard focus (the label is also the button's aria-label). */}
              <span
                aria-hidden
                className={cn(
                  "pointer-events-none absolute top-full z-30 mt-1 hidden w-max max-w-56 rounded-lg bg-ink px-2.5 py-1.5 text-xs text-white shadow-card",
                  "peer-hover:block peer-focus-visible:block",
                  slide.index === 0
                    ? "left-0"
                    : slide.index === lastIndex
                      ? "right-0"
                      : "left-1/2 -translate-x-1/2",
                )}
              >
                <span className="font-semibold tabular-nums">
                  {String(slide.index + 1).padStart(2, "0")}
                </span>{" "}
                {slide.title}
                {isDone && <span className="text-white/70"> · covered</span>}
              </span>
            </li>
          );
        })}
      </ol>

      <Button
        variant="ghost"
        size="icon"
        className="size-9"
        aria-label="Next slide"
        disabled={busy || currentIndex >= lastIndex}
        onClick={() => onSelect(currentIndex + 1)}
      >
        <ChevronRight aria-hidden />
      </Button>
    </nav>
  );
}
