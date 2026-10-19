import type { ReactNode } from "react";
import { FolderOpen, RefreshCw, ServerOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function DeckGridSkeleton() {
  return (
    <div
      aria-busy
      aria-label="Loading presentations"
      className="grid gap-5 md:grid-cols-2 lg:grid-cols-3"
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={
            i === 0
              ? "min-h-64 animate-pulse rounded-2xl bg-accent-soft md:col-span-2 lg:col-span-3"
              : "min-h-64 animate-pulse rounded-2xl bg-line/60"
          }
        />
      ))}
    </div>
  );
}

interface StatePanelProps {
  icon: ReactNode;
  title: string;
  message: string;
  action?: ReactNode;
}

function StatePanel({ icon, title, message, action }: StatePanelProps) {
  return (
    <Card className="flex flex-col items-center gap-4 px-6 py-14 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-accent-soft text-accent">
        {icon}
      </span>
      <div className="max-w-md space-y-1.5">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        <p className="text-sm text-pretty text-ink-muted">{message}</p>
      </div>
      {action}
    </Card>
  );
}

export function EmptyDecks() {
  return (
    <StatePanel
      icon={<FolderOpen aria-hidden className="size-5" />}
      title="No presentations yet"
      message="Add a deck JSON file to the backend's decks folder and refresh this page."
    />
  );
}

export interface DecksErrorProps {
  message: string;
  unreachable: boolean;
  onRetry: () => void;
}

export function DecksError({ message, unreachable, onRetry }: DecksErrorProps) {
  return (
    <StatePanel
      icon={<ServerOff aria-hidden className="size-5" />}
      title={unreachable ? "Presentation server is offline" : "Couldn't load presentations"}
      message={
        unreachable
          ? `${message} Start it by running uv run synthio-api in the backend folder.`
          : message
      }
      action={
        <Button variant="secondary" onClick={onRetry}>
          <RefreshCw aria-hidden />
          Try again
        </Button>
      }
    />
  );
}
