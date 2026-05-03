import type { StoryEnginePhase } from "@/lib/story-engine/engine-types";

/** High-level operator UX state for /host (vote-first; no in-app video transport). */
export type OperatorEventState =
  | "draft"
  | "ready"
  | "voting_open"
  | "voting_closed"
  | "winner_revealed"
  | "ended";

export type OperatorActionHandlers = {
  startEvent: () => void;
  play: () => void;
  pause: () => void;
  openVote: () => void;
  closeVote: () => void;
  revealWinner: () => void;
  advanceBranch: () => void;
  /** Mid-show “Reset vote / room” (confirm). */
  resetRoom: () => void;
  /** After “End show” — primary “Reset Event” (confirm). */
  resetAfterEnded: () => void;
  acknowledgeProjectionFault: () => void;
  endShow: () => void;
  overrideA: () => void;
  overrideB: () => void;
};

export type OperatorSecondaryAction = {
  id: string;
  label: string;
  handler: () => void;
  disabled: boolean;
  disabledReason: string | null;
};

export type NextOperatorActionResult = {
  state: OperatorEventState;
  primaryActionLabel: string;
  primaryActionHandler: (() => void) | null;
  helperText: string;
  allowedSecondaryActions: OperatorSecondaryAction[];
  disabledReason: string | null;
  /** Hide Play in the transport row when the primary button already resumes/plays. */
  hideTransportPlay: boolean;
  /** Hide Pause in the transport row when the primary button already pauses. */
  hideTransportPause: boolean;
};

export type OperatorActionContext = {
  handlers: OperatorActionHandlers;
  enginePhase: StoryEnginePhase;
  /** Seconds until ballot opens while countdown is running. */
  countdownSec: number;
  voteable: boolean;
  tieActive: boolean;
  /** Current beat has loadable preview (host desk). */
  hasPlayableMedia: boolean;
  /** Story passes production validation (media on every beat). */
  productionStoryOk: boolean;
  /** Transport playback flag (mirrors store playback.isPlaying). */
  playbackIsPlaying: boolean;
};

/**
 * Maps live store/engine signals to a single operator UX state.
 */
export function deriveOperatorEventState(input: {
  /** Ignored — kept for call-site compatibility; projection/video alerts removed. */
  projectionSurfaceFault?: string | null;
  showEnded: boolean;
  eventStarted: boolean;
  enginePhase: StoryEnginePhase;
  playbackIsPlaying?: boolean;
  playbackPositionSec?: number;
}): OperatorEventState {
  void input.projectionSurfaceFault;
  void input.playbackIsPlaying;
  void input.playbackPositionSec;
  if (input.showEnded) return "ended";
  if (!input.eventStarted) return "draft";

  const ep = input.enginePhase;

  if (ep === "countdown") return "ready";
  if (ep === "open") return "voting_open";
  if (ep === "awaiting_reveal" || ep === "tiebreak") return "voting_closed";
  if (ep === "revealed") return "winner_revealed";

  if (ep === "idle") return "ready";

  return "ready";
}

function secondaryEndShow(ctx: OperatorActionContext, eventStarted: boolean, showEnded: boolean): OperatorSecondaryAction | null {
  if (!eventStarted || showEnded) return null;
  return {
    id: "end_show",
    label: "End show",
    handler: ctx.handlers.endShow,
    disabled: false,
    disabledReason: null,
  };
}

function secondaryResetRoom(ctx: OperatorActionContext, eventStarted: boolean, showEnded: boolean): OperatorSecondaryAction | null {
  if (!eventStarted || showEnded) return null;
  return {
    id: "reset_room",
    label: "Reset vote / room",
    handler: ctx.handlers.resetRoom,
    disabled: false,
    disabledReason: null,
  };
}

function secondaryOverrides(
  ctx: OperatorActionContext,
  overrideAvailable: boolean,
): [OperatorSecondaryAction, OperatorSecondaryAction] {
  const reason = overrideAvailable ? null : "Only available while voting is open or when you need to break a tie.";

  const a: OperatorSecondaryAction = {
    id: "override_a",
    label: "Override → A",
    handler: ctx.handlers.overrideA,
    disabled: !overrideAvailable,
    disabledReason: reason,
  };
  const b: OperatorSecondaryAction = {
    id: "override_b",
    label: "Override → B",
    handler: ctx.handlers.overrideB,
    disabled: !overrideAvailable,
    disabledReason: reason,
  };
  return [a, b];
}

/**
 * Single source of truth for the obvious next operator step on /host.
 */
export function getNextOperatorAction(
  eventState: OperatorEventState,
  ctx: OperatorActionContext,
): NextOperatorActionResult {
  const { handlers } = ctx;

  const baseSecondaries = (
    eventStarted: boolean,
    showEnded: boolean,
    overrideAvailable: boolean,
  ): OperatorSecondaryAction[] => {
    const out: OperatorSecondaryAction[] = [];
    const es = secondaryEndShow(ctx, eventStarted, showEnded);
    const rr = secondaryResetRoom(ctx, eventStarted, showEnded);
    if (es) out.push(es);
    if (rr) out.push(rr);
    const [oa, ob] = secondaryOverrides(ctx, overrideAvailable);
    out.push(oa, ob);
    return out;
  };

  switch (eventState) {
    case "ended": {
      return {
        state: eventState,
        primaryActionLabel: "Reset Event",
        primaryActionHandler: handlers.resetAfterEnded,
        helperText: "Return the room to draft at the opening beat so you can run another show.",
        allowedSecondaryActions: [],
        disabledReason: null,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    case "draft": {
      const blocked = !ctx.productionStoryOk;
      const disabledReason = blocked
        ? "Fix story problems in Story builder — clip names, vote copy, and branches must validate before you can start."
        : null;
      return {
        state: eventState,
        primaryActionLabel: "Start Event",
        primaryActionHandler: blocked ? null : handlers.startEvent,
        helperText: blocked
          ? "This story doesn’t pass checks (usually a missing operator clip name or branch wiring)."
          : "Unlock the room for /screen and phones, then run the opening beat from your player.",
        allowedSecondaryActions: [],
        disabledReason,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    case "ready": {
      if (ctx.enginePhase === "countdown") {
        return {
          state: eventState,
          primaryActionLabel: `Wait (${ctx.countdownSec}s)`,
          primaryActionHandler: null,
          helperText: "Countdown is running — the ballot opens automatically when it hits zero.",
          allowedSecondaryActions: baseSecondaries(true, false, false),
          disabledReason: "Wait for the countdown to finish.",
          hideTransportPlay: false,
          hideTransportPause: false,
        };
      }

      if (ctx.voteable) {
        return {
          state: eventState,
          primaryActionLabel: "Open Vote",
          primaryActionHandler: handlers.openVote,
          helperText: "Open the ballot when you’re ready for the audience to choose.",
          allowedSecondaryActions: baseSecondaries(true, false, false),
          disabledReason: null,
          hideTransportPlay: false,
          hideTransportPause: false,
        };
      }

      return {
        state: eventState,
        primaryActionLabel: "At segment",
        primaryActionHandler: null,
        helperText:
          "Play the current clip file on your projector deck. When you reach a fork, tap Open Vote — this app does not start or sync video files.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: null,
        hideTransportPlay: true,
        hideTransportPause: true,
      };
    }
    case "voting_open": {
      return {
        state: eventState,
        primaryActionLabel: "Close Vote",
        primaryActionHandler: handlers.closeVote,
        helperText: "Close voting when time is up or everyone has voted.",
        allowedSecondaryActions: baseSecondaries(true, false, true),
        disabledReason: null,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    case "voting_closed": {
      if (ctx.tieActive) {
        return {
          state: eventState,
          primaryActionLabel: "Break tie first",
          primaryActionHandler: null,
          helperText: "Scores are tied — use Override A or B below to pick the winner.",
          allowedSecondaryActions: baseSecondaries(true, false, true),
          disabledReason: "Reveal becomes available after you break the tie.",
          hideTransportPlay: false,
          hideTransportPause: false,
        };
      }
      return {
        state: eventState,
        primaryActionLabel: "Reveal Winner",
        primaryActionHandler: handlers.revealWinner,
        helperText: "Show the room which branch won before you advance.",
        allowedSecondaryActions: baseSecondaries(true, false, true),
        disabledReason: null,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    case "winner_revealed": {
      return {
        state: eventState,
        primaryActionLabel: "Advance Branch",
        primaryActionHandler: handlers.advanceBranch,
        helperText: "After the room has read the winner, advance so the next clip name is active for the operator.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: null,
        hideTransportPlay: true,
        hideTransportPause: true,
      };
    }
    default: {
      const _exhaustive: never = eventState;
      return _exhaustive;
    }
  }
}
