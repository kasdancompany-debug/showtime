/**
 * Deterministic simulation of many audience clients voting over a fixed window.
 * Used by tests to verify tally integrity, retry behavior, and latency stats — not wired to Supabase.
 */

export type VoteChoice = "A" | "B";

export type SimVoteEvent = {
  tMs: number;
  clientId: number;
  choice: VoteChoice;
  /** Milliseconds this delivery was delayed after its scheduled time (network latency). */
  latencyMs: number;
};

export type ClientSchedule = {
  id: number;
  choice: VoteChoice;
  intendedVoteAtMs: number;
  /** If true, first vote attempt at intendedVoteAt fails; retry happens after reconnectMs. */
  disconnectGlitch: boolean;
  reconnectDelayMs: number;
};

/** Mulberry32 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildClientSchedules(params: {
  seed: number;
  clientCount: number;
  windowMs: number;
  disconnectProbability: number;
  reconnectMinMs: number;
  reconnectMaxMs: number;
}): ClientSchedule[] {
  const rng = createRng(params.seed);
  const out: ClientSchedule[] = [];
  for (let id = 0; id < params.clientCount; id++) {
    const choice: VoteChoice = rng() < 0.5 ? "A" : "B";
    const intendedVoteAtMs = Math.floor(rng() * params.windowMs);
    const disconnectGlitch = rng() < params.disconnectProbability;
    const reconnectDelayMs =
      params.reconnectMinMs +
      Math.floor(rng() * Math.max(1, params.reconnectMaxMs - params.reconnectMinMs));
    out.push({ id, choice, intendedVoteAtMs, disconnectGlitch, reconnectDelayMs });
  }
  return out;
}

/** Inject a burst of votes in [burstStartMs, burstEndMs] for the first `count` clients (by id order). */
export function applyVoteBurst(schedules: ClientSchedule[], count: number, burstStartMs: number, burstEndMs: number): void {
  const rng = createRng(0xbeef1234);
  for (let i = 0; i < Math.min(count, schedules.length); i++) {
    schedules[i].intendedVoteAtMs =
      burstStartMs + Math.floor(rng() * Math.max(1, burstEndMs - burstStartMs));
  }
}

/**
 * Turn schedules into delivered vote events with optional latency jitter.
 * Glitch clients: first attempt dropped; vote arrives after reconnectDelayMs with optional extra latency.
 */
export function deliverVotes(params: {
  schedules: ClientSchedule[];
  /** Per-delivery latency sampled in [0, maxLatencyMs) */
  maxLatencyMs: number;
  seed: number;
}): SimVoteEvent[] {
  const rng = createRng(params.seed);
  const events: SimVoteEvent[] = [];

  for (const s of params.schedules) {
    const jitter = () => Math.floor(rng() * params.maxLatencyMs);
    if (!s.disconnectGlitch) {
      const latencyMs = jitter();
      events.push({
        tMs: s.intendedVoteAtMs + latencyMs,
        clientId: s.id,
        choice: s.choice,
        latencyMs,
      });
      continue;
    }
    const latencyMs = jitter();
    events.push({
      tMs: s.intendedVoteAtMs + s.reconnectDelayMs + latencyMs,
      clientId: s.id,
      choice: s.choice,
      latencyMs: s.reconnectDelayMs + latencyMs,
    });
  }

  events.sort((a, b) => a.tMs - b.tMs || a.clientId - b.clientId);
  return events;
}

export type AggregatorResult = {
  tallies: { a: number; b: number };
  /** Clients successfully counted */
  accepted: Set<number>;
  /** duplicate attempts */
  duplicatesIgnored: number;
};

/** One vote per clientId; duplicates ignored (like unique constraint). */
export function aggregateVotes(events: SimVoteEvent[]): AggregatorResult {
  const accepted = new Set<number>();
  let duplicatesIgnored = 0;
  let a = 0;
  let b = 0;

  for (const e of events) {
    if (accepted.has(e.clientId)) {
      duplicatesIgnored++;
      continue;
    }
    accepted.add(e.clientId);
    if (e.choice === "A") a++;
    else b++;
  }

  return { tallies: { a, b }, accepted, duplicatesIgnored };
}

export function latencyStats(events: SimVoteEvent[]) {
  if (events.length === 0) {
    return { min: 0, max: 0, mean: 0, p95: 0 };
  }
  const lat = events.map((e) => e.latencyMs).sort((x, y) => x - y);
  const sum = lat.reduce((s, x) => s + x, 0);
  const p95Idx = Math.floor(0.95 * (lat.length - 1));
  return {
    min: lat[0],
    max: lat[lat.length - 1],
    mean: sum / lat.length,
    p95: lat[p95Idx],
  };
}

/** Expected tallies from schedules (each client votes exactly once). */
export function expectedTallies(schedules: ClientSchedule[]): { a: number; b: number } {
  let a = 0;
  let b = 0;
  for (const s of schedules) {
    if (s.choice === "A") a++;
    else b++;
  }
  return { a, b };
}
