import type { StoryEnginePhase } from "@/lib/story-engine/engine-types";

/** High-level operator UX state for /host (one obvious next step). */
export type OperatorEventState =
  | "draft"
  | "ready"
  | "playing"
  | "paused"
  | "voting_open"
  | "voting_closed"
  | "winner_revealed"
  | "advancing"
  | "ended"
  | "error";

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
  projectionSurfaceFault: string | null;
  showEnded: boolean;
  eventStarted: boolean;
  enginePhase: StoryEnginePhase;
  playbackIsPlaying: boolean;
  playbackPositionSec: number;
}): OperatorEventState {
  if (input.projectionSurfaceFault?.trim()) return "error";
  if (input.showEnded) return "ended";
  if (!input.eventStarted) return "draft";

  const ep = input.enginePhase;

  if (ep === "countdown") return "ready";
  if (ep === "open") return "voting_open";
  if (ep === "awaiting_reveal" || ep === "tiebreak") return "voting_closed";
  if (ep === "revealed") return "winner_revealed";

  if (ep === "idle") {
    if (input.playbackIsPlaying) return "playing";
    const atHead = input.playbackPositionSec <= 0.5;
    return atHead ? "ready" : "paused";
  }

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
    case "error": {
      return {
        state: eventState,
        primaryActionLabel: "Dismiss alert",
        primaryActionHandler: handlers.acknowledgeProjectionFault,
        helperText: "Clear the projection warning after you’ve fixed the issue on /screen or in Story builder.",
        allowedSecondaryActions: [],
        disabledReason: null,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
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
        ? "Fix story problems in Story builder — every beat needs video before you can start."
        : null;
      return {
        state: eventState,
        primaryActionLabel: "Start Event",
        primaryActionHandler: blocked ? null : handlers.startEvent,
        helperText: blocked
          ? "This story doesn’t pass production checks (usually missing video on a beat)."
          : "Unlock the room for /screen and phones, then roll the opening beat.",
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

      const noMedia = !ctx.hasPlayableMedia;
      return {
        state: eventState,
        primaryActionLabel: "Play",
        primaryActionHandler: noMedia ? null : handlers.play,
        helperText: noMedia
          ? "Add a video URL or local file to this beat in Story builder before you roll."
          : "Roll this beat on /screen when you’re ready.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: noMedia ? "No playable video on this beat yet." : null,
        hideTransportPlay: !noMedia,
        hideTransportPause: false,
      };
    }
    case "paused": {
      const noMedia = !ctx.hasPlayableMedia;
      return {
        state: eventState,
        primaryActionLabel: "Resume",
        primaryActionHandler: noMedia ? null : handlers.play,
        helperText: noMedia
          ? "You need media on this beat before playback can continue."
          : "Resume playback on the current beat.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: noMedia ? "No playable video on this beat yet." : null,
        hideTransportPlay: !noMedia,
        hideTransportPause: false,
      };
    }
    case "playing": {
      if (ctx.voteable) {
        return {
          state: eventState,
          primaryActionLabel: "Open Vote",
          primaryActionHandler: handlers.openVote,
          helperText: "When you reach the fork, open voting so phones can pick A or B.",
          allowedSecondaryActions: baseSecondaries(true, false, false),
          disabledReason: null,
          hideTransportPlay: false,
          hideTransportPause: false,
        };
      }
      const noMedia = !ctx.hasPlayableMedia;
      return {
        state: eventState,
        primaryActionLabel: "Pause",
        primaryActionHandler: noMedia ? null : handlers.pause,
        helperText: "Pause the reel when you need to talk to the room or fix something.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: noMedia ? "No playable video on this beat yet." : null,
        hideTransportPlay: false,
        hideTransportPause: !noMedia,
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
        helperText: "Move the playhead into the winning clip.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: null,
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    case "advancing": {
      return {
        state: eventState,
        primaryActionLabel: "Continue",
        primaryActionHandler: null,
        helperText: "Follow playback on /screen — reserved for future automation.",
        allowedSecondaryActions: baseSecondaries(true, false, false),
        disabledReason: "Nothing to tap here yet — follow playback on /screen.",
        hideTransportPlay: false,
        hideTransportPause: false,
      };
    }
    default: {
      const _exhaustive: never = eventState;
      return _exhaustive;
    }
  }
}
