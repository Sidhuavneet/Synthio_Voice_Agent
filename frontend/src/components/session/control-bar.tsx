"use client";

import { Track } from "livekit-client";
import { useTrackToggle } from "@livekit/components-react";
import { Mic, MicOff, PhoneOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { describeMicrophoneError } from "@/lib/media-errors";

export interface ControlBarProps {
  onEnd: () => void;
  onMicrophoneError: (message: string | null) => void;
}

export function ControlBar({ onEnd, onMicrophoneError }: ControlBarProps) {
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
      <div className="flex items-center gap-2">
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
        <Button variant="danger" onClick={onEnd}>
          <PhoneOff aria-hidden />
          End session
        </Button>
      </div>
    </div>
  );
}
