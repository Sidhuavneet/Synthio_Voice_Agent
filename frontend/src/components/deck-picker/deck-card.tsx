import { ArrowRight, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { cn } from "@/lib/cn";
import { formatCategory } from "@/lib/format";
import type { DeckSummary } from "@/lib/types";

export interface DeckCardProps {
  deck: DeckSummary;
  featured?: boolean;
  pending: boolean;
  disabled: boolean;
  onStart: (deckId: string) => void;
}

export function DeckCard({ deck, featured = false, pending, disabled, onStart }: DeckCardProps) {
  return (
    <article
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl p-6 transition-shadow sm:p-7",
        featured
          ? "min-h-64 bg-[linear-gradient(135deg,var(--color-navy)_0%,var(--color-accent)_55%,var(--color-violet)_100%)] text-white shadow-stage md:col-span-2 lg:col-span-3"
          : // With the featured card first, an even child count leaves the last card alone in its md row.
            "min-h-64 border border-line bg-surface shadow-card hover:shadow-stage md:max-lg:last:even:col-span-2",
      )}
    >
      {featured && (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-white/10 blur-2xl"
        />
      )}
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={featured ? "inverse" : "accent"}>{formatCategory(deck.category)}</Chip>
          {featured && <Chip tone="inverse">Featured</Chip>}
        </div>
        <div className="space-y-2">
          <h2
            className={cn(
              "font-semibold tracking-tight text-balance",
              featured ? "text-2xl sm:text-4xl" : "text-xl text-ink",
            )}
          >
            {deck.title}
          </h2>
          <p
            className={cn("max-w-prose text-pretty", featured ? "text-white/80" : "text-ink-muted")}
          >
            {deck.subtitle}
          </p>
        </div>
      </div>

      <div className="relative mt-8 flex items-center justify-between gap-4">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-sm",
            featured ? "text-white/75" : "text-ink-muted",
          )}
        >
          <Layers aria-hidden className="size-4" />
          {deck.slideCount} {deck.slideCount === 1 ? "slide" : "slides"}
        </span>
        <Button
          variant={featured ? "secondary" : "primary"}
          className={cn(featured && "border-transparent")}
          disabled={disabled}
          aria-busy={pending}
          onClick={() => onStart(deck.id)}
        >
          {pending ? (
            <>
              <Loader2 aria-hidden className="animate-spin" />
              Starting…
            </>
          ) : (
            <>
              Start presentation
              <ArrowRight
                aria-hidden
                className="transition-transform group-hover:translate-x-0.5"
              />
            </>
          )}
        </Button>
      </div>
    </article>
  );
}
