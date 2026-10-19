"use client";

import { useSessionContext, useStartAudio } from "@livekit/components-react";
import { Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown only when the browser blocked audio autoplay. */
export function StartAudioPrompt() {
  const { room } = useSessionContext();
  const { canPlayAudio, mergedProps } = useStartAudio({ room, props: {} });

  if (canPlayAudio) return null;

  return (
    <div className="flex justify-center">
      <Button size="md" onClick={mergedProps.onClick}>
        <Volume2 aria-hidden />
        Click to enable presenter audio
      </Button>
    </div>
  );
}
