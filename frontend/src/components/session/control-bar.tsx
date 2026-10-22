"use client";

import { useRef, type KeyboardEvent } from "react";
import { FileText, Hand, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMicControl, type MicControl } from "@/hooks/use-mic-control";
import { cn } from "@/lib/cn";
import { MIC_MODES, type MicMode } from "@/lib/mic-mode";

const MODE_LABELS: Record<MicMode, string> = { open: "Open mic", tap: "Tap to speak" };

export interface ControlBarProps {
  micMode: MicMode;
  onMicModeChange: (mode: MicMode) => void;
  /** Ends the session and shows the report. */
  onEndWithReport: () => void;
  onMicrophoneError: (message: string | null) => void;
}

export function ControlBar({
  micMode,
  onMicModeChange,
  onEndWithReport,
  onMicrophoneError,
}: ControlBarProps) {
  const mic = useMicControl(micMode, onMicModeChange, onMicrophoneError);

  const hint =
    micMode === "open"
      ? "Ask a question anytime — just start talking."
      : mic.listening
        ? "Listening — tap again when you’re done."
        : "Tap the mic, ask your question, then tap again.";

  return (
    <div className="flex flex-col items-center justify-between gap-3 lg:flex-row">
      <p aria-live="polite" className="text-center text-sm text-ink-muted lg:text-left">
        {hint}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {micMode === "open" ? <MuteButton mic={mic} /> : <TapToSpeakButton mic={mic} />}
        <MicModeSwitch value={micMode} onChange={mic.changeMode} />
        <Button variant="danger" onClick={onEndWithReport}>
          <FileText aria-hidden />
          End &amp; view report
        </Button>
      </div>
    </div>
  );
}

function MuteButton({ mic }: { mic: MicControl }) {
  return (
    <Button
      variant="secondary"
      aria-label="Mute microphone"
      aria-pressed={!mic.enabled}
      disabled={mic.pending}
      onClick={mic.toggleMute}
      className={cn(
        !mic.enabled && "border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft",
      )}
    >
      {mic.enabled ? <Mic aria-hidden /> : <MicOff aria-hidden />}
      {mic.enabled ? "Mute" : "Unmute"}
    </Button>
  );
}

function TapToSpeakButton({ mic }: { mic: MicControl }) {
  return (
    <Button
      disabled={mic.pending}
      onClick={mic.tap}
      className={cn(
        "relative min-w-52 overflow-hidden",
        mic.listening
          ? "bg-success hover:bg-success/90 focus-visible:outline-success"
          : "bg-accent hover:bg-accent-strong",
      )}
    >
      {mic.listening ? (
        <>
          <span aria-hidden className="relative flex size-2.5">
            <span className="absolute inline-flex size-full rounded-full bg-white/70 motion-safe:animate-ping" />
            <span className="relative inline-flex size-2.5 rounded-full bg-white" />
          </span>
          Listening… tap to finish
          {/* Drains over the listen window, after which the mic closes by itself. */}
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-white/60 motion-safe:animate-listen-window"
          />
        </>
      ) : (
        <>
          <Mic aria-hidden />
          Tap to speak
        </>
      )}
    </Button>
  );
}

interface MicModeSwitchProps {
  value: MicMode;
  onChange: (mode: MicMode) => void;
}

/** Segmented control (a radio group: arrow keys move and select). */
function MicModeSwitch({ value, onChange }: MicModeSwitchProps) {
  const refs = useRef<Record<MicMode, HTMLButtonElement | null>>({ open: null, tap: null });

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = MIC_MODES[(MIC_MODES.indexOf(value) + step + MIC_MODES.length) % MIC_MODES.length];
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Microphone mode"
      onKeyDown={handleKeyDown}
      className="inline-flex h-11 items-center gap-0.5 rounded-full bg-canvas p-1 ring-1 ring-line ring-inset"
    >
      {MIC_MODES.map((mode) => {
        const checked = mode === value;
        return (
          <button
            key={mode}
            ref={(el) => {
              refs.current[mode] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(mode)}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
              "[&_svg]:size-3.5 [&_svg]:shrink-0",
              checked ? "bg-surface text-ink shadow-card" : "text-ink-muted hover:text-ink-soft",
            )}
          >
            {mode === "open" ? <Mic aria-hidden /> : <Hand aria-hidden />}
            {MODE_LABELS[mode]}
          </button>
        );
      })}
    </div>
  );
}
