"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RoomAudioRenderer,
  SessionProvider,
  useAgent,
  useSessionContext,
  useSessionMessages,
} from "@livekit/components-react";
import { ArrowLeft } from "lucide-react";
import { SessionReportView } from "@/components/report/session-report-view";
import { ComplianceToast } from "@/components/session/compliance-toast";
import { ControlBar } from "@/components/session/control-bar";
import { InsightsCard } from "@/components/session/insights-card";
import { PresenterPanel } from "@/components/session/presenter-panel";
import { StartAudioPrompt } from "@/components/session/start-audio-prompt";
import { SuggestedQuestions } from "@/components/session/suggested-questions";
import { SlideRail } from "@/components/slides/slide-rail";
import { SlideStage, type PresenterStatus } from "@/components/slides/slide-stage";
import { Alert } from "@/components/ui/alert";
import { BrandMark } from "@/components/ui/brand-mark";
import { Button } from "@/components/ui/button";
import { useAgentEvents, type AgentEvents } from "@/hooks/use-agent-events";
import { useAgentSession, type AgentSessionError } from "@/hooks/use-agent-session";
import { useDeckProgress } from "@/hooks/use-deck-progress";
import { useElapsedFlag } from "@/hooks/use-elapsed-flag";
import { useNarrationMark } from "@/hooks/use-narration-mark";
import { useSessionReport } from "@/hooks/use-session-report";
import { useSlideNavigation } from "@/hooks/use-slide-navigation";
import { useSlideSync, type SlideSync } from "@/hooks/use-slide-sync";
import { useSlideTimeline } from "@/hooks/use-slide-timeline";
import type { Presentation } from "@/hooks/use-start-presentation";
import { getSlideCitations } from "@/lib/deck";
import { interruptedPoint, questionJumpTo, type SessionSpan } from "@/lib/timeline";
import type { Deck, SessionErrorCode, SessionFacts } from "@/lib/types";

const BACK_LABEL = "Back to decks";
// A warm agent joins within a few seconds; longer than this is usually a cold start.
const AGENT_SLOW_MS = 6_000;

const SESSION_ERROR_TITLES: Record<SessionErrorCode, string> = {
  quota_exceeded: "Voice service limit reached",
  provider_error: "Voice service unavailable",
  internal: "The presenter stopped unexpectedly",
};

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
  const sync = useSlideSync(deck);
  useDeckProgress(deck.id, deck.slides.length, sync);
  const events = useAgentEvents();
  const getTimeline = useSlideTimeline(deck.slides, sync.index, sync.isSynced);
  const { complianceFlags } = events;
  const getFacts = useCallback(
    (): SessionFacts => ({ deckId: deck.id, ...getTimeline(), complianceFlags }),
    [deck.id, getTimeline, complianceFlags],
  );
  const report = useSessionReport(getFacts);
  // When the presenter first synced, and on which slide: the start of the report timeline.
  const start = useRef<{ at: number; slide: number } | null>(null);
  const [span, setSpan] = useState<SessionSpan | null>(null);

  useEffect(() => {
    if (sync.isSynced && start.current === null) {
      start.current = { at: Date.now(), slide: sync.index };
    }
  }, [sync.isSynced, sync.index]);

  const endWithReport = () => {
    if (start.current) {
      setSpan({ startedAt: start.current.at, endedAt: Date.now(), startSlide: start.current.slide });
    }
    void report.requestReport();
  };

  if (report.state.status !== "idle") {
    return (
      <SessionReportView
        deck={deck}
        state={report.state}
        timeline={events.timeline}
        span={span}
        onExit={props.onExit}
      />
    );
  }

  return (
    <>
      <RoomAudioRenderer />
      <ComplianceToast flag={complianceFlags.at(-1)} />
      <SessionLayout
        deck={deck}
        sync={sync}
        events={events}
        onEndWithReport={endWithReport}
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
  const { messages, send } = useSessionMessages(session);
  const { index, isSynced } = sync;
  const slide = deck.slides[index];
  const navigation = useSlideNavigation();
  const narration = useNarrationMark(index, sync.pointIndex, events.timeline.length);
  const [wasConnected, setWasConnected] = useState(false);
  const [agentWasConnected, setAgentWasConnected] = useState(false);

  if (session.isConnected && !wasConnected) setWasConnected(true);
  if (agent.isConnected && !agentWasConnected) setAgentWasConnected(true);
  const agentError = events.sessionError;
  const droppedConnection = wasConnected && !session.isConnected;
  const connectionFailed = sessionError?.kind === "connection";
  // The agent's own error report explains its departure better than useAgent's failure.
  const agentFailed = agent.state === "failed" && !connectionFailed && !agentError;
  const unavailable =
    agent.state === "failed" || connectionFailed || droppedConnection || Boolean(agentError);
  // In the room but no presenter yet: past a few seconds that's an agent cold start.
  const awaitingAgent = !unavailable && session.isConnected && !agent.isConnected;
  const agentSlow = useElapsedFlag(awaitingAgent, AGENT_SLOW_MS);
  const presenterStatus: PresenterStatus = unavailable
    ? "unavailable"
    : isSynced
      ? "live"
      : agentSlow
        ? "waking"
        : "connecting";

  const backAction = (
    <Button variant="secondary" size="sm" onClick={onExit}>
      <ArrowLeft aria-hidden />
      {BACK_LABEL}
    </Button>
  );

  return (
    // Fixed to the viewport on large screens so only the slide column and transcript scroll.
    // lg:flex-none stops the body's flex column from overriding h-dvh with content height.
    <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-5 px-4 py-4 sm:px-6 lg:h-dvh lg:min-h-0 lg:flex-none lg:py-6">
      <header className="flex shrink-0 items-center justify-between gap-4">
        <Button variant="ghost" size="sm" className="-ml-3" onClick={onExit}>
          <ArrowLeft aria-hidden />
          All decks
        </Button>
        <h1 className="sr-only">{deck.title}</h1>
        <BrandMark />
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(0,1fr)_380px]">
        <main className="flex min-w-0 flex-col gap-4 lg:min-h-0 lg:overflow-y-auto">
          {agentError && (
            <Alert title={SESSION_ERROR_TITLES[agentError.code]} action={backAction}>
              {agentError.message}
            </Alert>
          )}
          {agentFailed &&
            (agentWasConnected ? (
              <Alert title="Presenter disconnected" action={backAction}>
                The presenter left the session unexpectedly. Your progress is saved, so you can
                resume from the deck list.
              </Alert>
            ) : (
              <Alert title="The presenter couldn't join" action={backAction}>
                {agent.failureReasons.join(" ")} Make sure the agent worker is running (uv run
                synthio-agent dev).
              </Alert>
            ))}
          {droppedConnection && agent.state !== "failed" && !connectionFailed && !agentError && (
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
            activePoint={sync.pointIndex}
            pausedPoint={interruptedPoint(events.timeline, index, narration)}
            jump={questionJumpTo(events.timeline, index, narration)}
            citations={getSlideCitations(deck, slide)}
          />

          <SlideRail
            slides={deck.slides}
            currentIndex={index}
            presented={sync.presented}
            pendingIndex={navigation.pendingIndex}
            disabled={!navigation.canNavigate}
            onSelect={(target) => void navigation.navigate(target)}
          />
          {navigation.error && (
            <p role="alert" className="text-center text-sm text-danger">
              {navigation.error}
            </p>
          )}

          <SuggestedQuestions
            questions={deck.suggestedQuestions}
            onAsk={send}
            disabled={presenterStatus !== "live"}
          />

          <div className="mt-auto space-y-3 pt-1">
            <StartAudioPrompt />
            <ControlBar
              onEndWithReport={onEndWithReport}
              onMicrophoneError={onMicrophoneError}
            />
            <p className="text-center text-xs text-ink-muted sm:text-left">{deck.disclaimer}</p>
          </div>
        </main>

        <aside className="flex min-h-0 flex-col gap-4">
          {/* The presenter card takes all remaining height; the insights card never grows. */}
          <div className="flex h-[28rem] min-h-0 flex-col lg:h-auto lg:flex-1">
            <PresenterPanel
              presenter={deck.presenter}
              messages={messages}
              timeline={events.timeline}
              slides={deck.slides}
            />
          </div>
          <InsightsCard latency={events.latency} complianceFlags={events.complianceFlags} />
        </aside>
      </div>
    </div>
  );
}
