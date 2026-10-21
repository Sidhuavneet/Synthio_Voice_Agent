"use client";

import { useState } from "react";
import { Check, MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/cn";

export interface SuggestedQuestionsProps {
  questions: string[];
  /** Sends the question as a typed user turn; the presenter answers it by voice. */
  onAsk: (question: string) => Promise<unknown>;
  disabled: boolean;
}

/** "Try asking" chips: deck questions chosen to show slide routing and compliance handling. */
export function SuggestedQuestions({ questions, onAsk, disabled }: SuggestedQuestionsProps) {
  const [asked, setAsked] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState(false);
  // One send at a time: a double click would otherwise send the question twice.
  const [sending, setSending] = useState(false);

  if (questions.length === 0) return null;

  const ask = async (question: string) => {
    setError(false);
    setSending(true);
    try {
      await onAsk(question);
      setAsked((prev) => new Set(prev).add(question));
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return (
    <section aria-label="Suggested questions" className="space-y-2">
      <h2 className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
        <MessageCircleQuestion aria-hidden className="size-3.5" />
        Try asking — say it, or click to send
      </h2>
      <ul className="flex flex-wrap gap-2">
        {questions.map((question) => {
          const done = asked.has(question);
          return (
            <li key={question}>
              <button
                type="button"
                disabled={disabled || sending}
                onClick={() => void ask(question)}
                className={cn(
                  "inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-left text-sm transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
                  "disabled:cursor-not-allowed disabled:opacity-50",
                  done
                    ? "bg-canvas text-ink-muted ring-1 ring-line ring-inset"
                    : "bg-surface text-ink-soft ring-1 ring-line-strong ring-inset hover:bg-accent-soft hover:text-accent-strong hover:ring-accent-light",
                )}
              >
                {done && <Check aria-hidden className="size-3.5 shrink-0" />}
                {question}
              </button>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="text-xs text-danger">
          That question couldn&apos;t be sent. Try saying it instead.
        </p>
      )}
    </section>
  );
}
