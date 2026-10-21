"use client";

import { Track } from "livekit-client";
import { useTrackToggle } from "@livekit/components-react";
import { FileText, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { describeMicrophoneError } from "@/lib/media-errors";

export interface ControlBarProps {
  /** Ends the session and shows the report. */
  onEndWithReport: () => void;
  onMicrophoneError: (message: string | null) => void;
}

export function ControlBar({ onEndWithReport, onMicrophoneError }: ControlBarProps) {
  const { enabled, pending, toggle } = useTrackToggle({
    source: Track.Source.Microphone,
    onDeviceError: (error) =>
      onMicrophoneError(describeMicrophoneError(error) ?? "The microphone couldn't be started."),
  });

  const handleToggle = () => {
    if (!enabled) onMicrophoneError(null);
    void toggle();
  };

  return (
    <div className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-center text-sm text-ink-muted sm:text-left">
        Ask a question anytime — just start talking.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button
          variant="secondary"
          aria-label="Mute microphone"
          aria-pressed={!enabled}
          disabled={pending}
          onClick={handleToggle}
          className={cn(
            !enabled && "border-danger/30 bg-danger-soft text-danger hover:bg-danger-soft",
          )}
        >
          {enabled ? <Mic aria-hidden /> : <MicOff aria-hidden />}
          {enabled ? "Mute" : "Unmute"}
        </Button>
        <Button variant="danger" onClick={onEndWithReport}>
          <FileText aria-hidden />
          End &amp; view report
        </Button>
      </div>
    </div>
  );
}
