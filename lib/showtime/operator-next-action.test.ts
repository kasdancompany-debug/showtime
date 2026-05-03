import { describe, expect, it, vi } from "vitest";

import {
  deriveOperatorEventState,
  getNextOperatorAction,
  type OperatorActionHandlers,
  type OperatorActionContext,
} from "./operator-next-action";

function noopHandlers(): OperatorActionHandlers {
  return {
    startEvent: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    openVote: vi.fn(),
    closeVote: vi.fn(),
    revealWinner: vi.fn(),
    advanceBranch: vi.fn(),
    resetRoom: vi.fn(),
    resetAfterEnded: vi.fn(),
    acknowledgeProjectionFault: vi.fn(),
    endShow: vi.fn(),
    overrideA: vi.fn(),
    overrideB: vi.fn(),
  };
}

function ctx(partial: Partial<OperatorActionContext> & { handlers?: OperatorActionHandlers }): OperatorActionContext {
  return {
    handlers: partial.handlers ?? noopHandlers(),
    enginePhase: partial.enginePhase ?? "idle",
    countdownSec: partial.countdownSec ?? 10,
    voteable: partial.voteable ?? false,
    tieActive: partial.tieActive ?? false,
    hasPlayableMedia: partial.hasPlayableMedia ?? true,
    productionStoryOk: partial.productionStoryOk ?? true,
    playbackIsPlaying: partial.playbackIsPlaying ?? false,
  };
}

describe("deriveOperatorEventState", () => {
  const base = {
    projectionSurfaceFault: null as string | null,
    showEnded: false,
    eventStarted: true,
    enginePhase: "idle" as const,
    playbackIsPlaying: false,
    playbackPositionSec: 0,
  };

  it("prefers projection fault over other signals", () => {
    expect(
      deriveOperatorEventState({
        ...base,
        projectionSurfaceFault: "decode failed",
        showEnded: true,
        eventStarted: false,
      }),
    ).toBe("error");
  });

  it("maps show ended", () => {
    expect(deriveOperatorEventState({ ...base, showEnded: true })).toBe("ended");
  });

  it("maps draft when event not started", () => {
    expect(deriveOperatorEventState({ ...base, eventStarted: false })).toBe("draft");
  });

  it("maps engine phases", () => {
    expect(deriveOperatorEventState({ ...base, enginePhase: "countdown" })).toBe("ready");
    expect(deriveOperatorEventState({ ...base, enginePhase: "open" })).toBe("voting_open");
    expect(deriveOperatorEventState({ ...base, enginePhase: "awaiting_reveal" })).toBe("voting_closed");
    expect(deriveOperatorEventState({ ...base, enginePhase: "tiebreak" })).toBe("voting_closed");
    expect(deriveOperatorEventState({ ...base, enginePhase: "revealed" })).toBe("winner_revealed");
  });

  it("maps idle playback to playing, ready, or paused", () => {
    expect(
      deriveOperatorEventState({ ...base, enginePhase: "idle", playbackIsPlaying: true }),
    ).toBe("playing");
    expect(
      deriveOperatorEventState({
        ...base,
        enginePhase: "idle",
        playbackIsPlaying: false,
        playbackPositionSec: 0,
      }),
    ).toBe("ready");
    expect(
      deriveOperatorEventState({
        ...base,
        enginePhase: "idle",
        playbackIsPlaying: false,
        playbackPositionSec: 10,
      }),
    ).toBe("paused");
  });
});

describe("getNextOperatorAction", () => {
  it("draft blocks start when production checks fail", () => {
    const h = noopHandlers();
    const r = getNextOperatorAction(
      "draft",
      ctx({ handlers: h, productionStoryOk: false, enginePhase: "idle" }),
    );
    expect(r.primaryActionLabel).toBe("Start Event");
    expect(r.primaryActionHandler).toBeNull();
    expect(r.disabledReason).toContain("Story builder");
    expect(r.allowedSecondaryActions).toHaveLength(0);
  });

  it("playing + voteable opens vote", () => {
    const h = noopHandlers();
    const r = getNextOperatorAction("playing", ctx({ handlers: h, voteable: true, enginePhase: "idle" }));
    expect(r.primaryActionLabel).toBe("Open Vote");
    expect(r.primaryActionHandler).toBe(h.openVote);
    expect(r.hideTransportPause).toBe(false);
  });

  it("playing without voteable pauses and can hide transport pause duplicate", () => {
    const h = noopHandlers();
    const r = getNextOperatorAction(
      "playing",
      ctx({ handlers: h, voteable: false, hasPlayableMedia: true, enginePhase: "idle" }),
    );
    expect(r.primaryActionLabel).toBe("Pause");
    expect(r.primaryActionHandler).toBe(h.pause);
    expect(r.hideTransportPause).toBe(true);
  });

  it("follows example labels for core vote flow", () => {
    const h = noopHandlers();
    expect(getNextOperatorAction("voting_open", ctx({ handlers: h, enginePhase: "open" })).primaryActionLabel).toBe(
      "Close Vote",
    );
    expect(
      getNextOperatorAction("voting_closed", ctx({ handlers: h, enginePhase: "awaiting_reveal", tieActive: false }))
        .primaryActionLabel,
    ).toBe("Reveal Winner");
    expect(
      getNextOperatorAction("winner_revealed", ctx({ handlers: h, enginePhase: "revealed" })).primaryActionLabel,
    ).toBe("Advance Branch");
    expect(getNextOperatorAction("ended", ctx({ handlers: h, enginePhase: "idle" })).primaryActionLabel).toBe(
      "Reset Event",
    );
  });

  it("tie blocks reveal until override", () => {
    const h = noopHandlers();
    const r = getNextOperatorAction(
      "voting_closed",
      ctx({ handlers: h, enginePhase: "tiebreak", tieActive: true }),
    );
    expect(r.primaryActionLabel).toBe("Break tie first");
    expect(r.primaryActionHandler).toBeNull();
    expect(r.disabledReason).toContain("tie");
    const overrides = r.allowedSecondaryActions.filter((a) => a.id.startsWith("override_"));
    expect(overrides.every((a) => !a.disabled)).toBe(true);
  });
});
