"use client";

import { useCallback, useState } from "react";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSessionContext,
  useSessionMessages,
} from "@livekit/components-react";
import { ArrowLeft } from "lucide-react";
import { SessionReportView } from "@/components/report/session-report-view";
import { CompliancePanel } from "@/components/session/compliance-panel";
import { ComplianceToast } from "@/components/session/compliance-toast";
import { ControlBar } from "@/components/session/control-bar";
import { LatencyPanel } from "@/components/session/latency-panel";
import { PresenterPanel } from "@/components/session/presenter-panel";
import { StartAudioPrompt } from "@/components/session/start-audio-prompt";
import { SlideRail } from "@/components/slides/slide-rail";
import { SlideStage, type PresenterStatus } from "@/components/slides/slide-stage";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useAgentEvents, type AgentEvents } from "@/hooks/use-agent-events";
import { useAgentSession, type AgentSessionError } from "@/hooks/use-agent-session";
import { useBulletHighlight } from "@/hooks/use-bullet-highlight";
import { useSessionReport } from "@/hooks/use-session-report";
import { useSlideNavigation } from "@/hooks/use-slide-navigation";
import { useSlideSync, type SlideSync } from "@/hooks/use-slide-sync";
import { useSlideTimeline } from "@/hooks/use-slide-timeline";
import type { Presentation } from "@/hooks/use-start-presentation";
import { getSlideCitations } from "@/lib/deck";
import type { Deck, SessionFacts } from "@/lib/types";

const BACK_LABEL = "Back to decks";

export interface SessionViewProps {
  presentation: Presentation;
  onExit: () => void;
}

export function SessionView({ presentation, onExit }: SessionViewProps) {
  const { session, error, setMicrophoneError } = useAgentSession(presentation.connection);

  return (
    <SessionProvider session={session}>
      <SessionScreen
        deck={presentation.deck}
        sessionError={error}
        onExit={onExit}
        onMicrophoneError={setMicrophoneError}
      />
    </SessionProvider>
  );
}

interface SessionScreenProps {
  deck: Deck;
  sessionError: AgentSessionError | null;
  onExit: () => void;
  onMicrophoneError: (message: string | null) => void;
}

/** Owns state that outlives the live session (events, slide timeline); swaps in the report. */
function SessionScreen({ deck, ...props }: SessionScreenProps) {
  const sync = useSlideSync(deck.id, deck.slides.length);
  const events = useAgentEvents();
  const getTimeline = useSlideTimeline(deck.slides, sync.index, sync.isSynced);
  const { complianceFlags } = events;
  const getFacts = useCallback(
    (): SessionFacts => ({ deckId: deck.id, ...getTimeline(), complianceFlags }),
    [deck.id, getTimeline, complianceFlags],
  );
  const report = useSessionReport(getFacts);

  if (report.state.status !== "idle") {
    return <SessionReportView deck={deck} state={report.state} onExit={props.onExit} />;
  }

  return (
    <>
      <RoomAudioRenderer />
      <ComplianceToast flag={complianceFlags.at(-1)} />
      <SessionLayout
        deck={deck}
        sync={sync}
        events={events}
        onEndWithReport={() => void report.requestReport()}
        {...props}
      />
    </>
  );
}

interface SessionLayoutProps extends SessionScreenProps {
  sync: SlideSync;
  events: AgentEvents;
  onEndWithReport: () => void;
}

function SessionLayout({
  deck,
  sync,
  events,
  sessionError,
  onExit,
  onEndWithReport,
  onMicrophoneError,
}: SessionLayoutProps) {
  const session = useSessionContext();
  const agent = useAgent();
  const { messages } = useSessionMessages(session);
  const { index, isSynced } = sync;
  const slide = deck.slides[index];
  const highlight = useBulletHighlight(slide, messages);
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
    // Fixed to the viewport on large screens so only the slide column and transcript scroll.
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:h-dvh lg:min-h-0 lg:py-6">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <BrandMark />
        <h1 className="sr-only">{deck.title}</h1>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_380px]">
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
            slide={slide}
            total={deck.slides.length}
            presenterStatus={presenterStatus}
            highlight={isSynced ? highlight : null}
            citations={getSlideCitations(deck, slide)}
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
            <ControlBar
              onEndWithReport={onEndWithReport}
              onLeave={onExit}
              onMicrophoneError={onMicrophoneError}
            />
            <p className="text-center text-xs text-ink-muted sm:text-left">{deck.disclaimer}</p>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-4">
          <div className="flex h-[28rem] min-h-0 flex-col lg:h-auto lg:flex-1">
            <PresenterPanel presenter={deck.presenter} messages={messages} />
          </div>
          <Card className="flex shrink-0 flex-col divide-y divide-line">
            <div className="p-5">
              <LatencyPanel latency={events.latency} />
            </div>
            <div className="p-5">
              <CompliancePanel flags={events.complianceFlags} />
            </div>
          </Card>
        </aside>
      </div>
    </div>
  );
}
