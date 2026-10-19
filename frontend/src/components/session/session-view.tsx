"use client";

import { useState } from "react";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSessionContext,
} from "@livekit/components-react";
import { ArrowLeft } from "lucide-react";
import { ControlBar } from "@/components/session/control-bar";
import { PresenterPanel } from "@/components/session/presenter-panel";
import { StartAudioPrompt } from "@/components/session/start-audio-prompt";
import { SlideRail } from "@/components/slides/slide-rail";
import { SlideStage, type PresenterStatus } from "@/components/slides/slide-stage";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { useAgentSession, type AgentSessionError } from "@/hooks/use-agent-session";
import { useSlideNavigation } from "@/hooks/use-slide-navigation";
import { useSlideSync } from "@/hooks/use-slide-sync";
import type { Presentation } from "@/hooks/use-start-presentation";
import type { Deck } from "@/lib/types";

const BACK_LABEL = "Back to decks";

export interface SessionViewProps {
  presentation: Presentation;
  onExit: () => void;
}

export function SessionView({ presentation, onExit }: SessionViewProps) {
  const { session, error, setMicrophoneError } = useAgentSession(presentation.connection);

  return (
    <SessionProvider session={session}>
      <RoomAudioRenderer />
      <SessionLayout
        deck={presentation.deck}
        sessionError={error}
        onExit={onExit}
        onMicrophoneError={setMicrophoneError}
      />
    </SessionProvider>
  );
}

interface SessionLayoutProps {
  deck: Deck;
  sessionError: AgentSessionError | null;
  onExit: () => void;
  onMicrophoneError: (message: string | null) => void;
}

function SessionLayout({ deck, sessionError, onExit, onMicrophoneError }: SessionLayoutProps) {
  const session = useSessionContext();
  const agent = useAgent();
  const { index, isSynced } = useSlideSync(deck.id, deck.slides.length);
  const navigation = useSlideNavigation();
  const [wasConnected, setWasConnected] = useState(false);

  if (session.isConnected && !wasConnected) setWasConnected(true);
  const droppedConnection = wasConnected && !session.isConnected;
  const connectionFailed = sessionError?.kind === "connection";
  const agentFailed = agent.state === "failed" && !connectionFailed;
  const presenterStatus: PresenterStatus =
    agent.state === "failed" || connectionFailed || droppedConnection
      ? "unavailable" : isSynced ? "live" : "connecting";

  const backAction = (
    <Button variant="secondary" size="sm" onClick={onExit}>
      <ArrowLeft aria-hidden />
      {BACK_LABEL}
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:h-svh lg:py-6">
      <header className="flex items-center justify-between gap-4">
        <BrandMark />
        <h1 className="sr-only">{deck.title}</h1>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
          {agentFailed && (
            <Alert title="The presenter couldn't join" action={backAction}>
              {agent.failureReasons.join(" ")} Make sure the agent worker is running (uv run
              synthio-agent dev).
            </Alert>
          )}
          {droppedConnection && agent.state !== "failed" && !connectionFailed && (
            <Alert title="Session ended" action={backAction}>
              The connection to the presentation room was closed.
            </Alert>
          )}
          {sessionError && (
            <Alert
              title={
                sessionError.kind === "microphone" ? "Microphone unavailable" : "Connection problem"
              }
              action={connectionFailed ? backAction : undefined}
            >
              {sessionError.message}
            </Alert>
          )}

          <SlideStage
            deckTitle={deck.title}
            slide={deck.slides[index]}
            total={deck.slides.length}
            presenterStatus={presenterStatus}
          />

          <SlideRail
            slides={deck.slides}
            currentIndex={index}
            pendingIndex={navigation.pendingIndex}
            disabled={!navigation.canNavigate}
            onSelect={(target) => void navigation.navigate(target)}
          />
          {navigation.error && (
            <p role="alert" className="text-center text-sm text-danger">
              {navigation.error}
            </p>
          )}

          <div className="mt-auto space-y-3 pt-1">
            <StartAudioPrompt />
            <ControlBar onEnd={onExit} onMicrophoneError={onMicrophoneError} />
            <p className="text-center text-xs text-ink-muted sm:text-left">{deck.disclaimer}</p>
          </div>
        </main>

        <aside className="flex h-[28rem] min-h-0 flex-col lg:h-auto">
          <PresenterPanel presenter={deck.presenter} />
        </aside>
      </div>
    </div>
  );
}
