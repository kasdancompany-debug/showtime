import { describe, expect, it } from "vitest";

import {
  aggregateVotes,
  applyVoteBurst,
  buildClientSchedules,
  createRng,
  deliverVotes,
  expectedTallies,
  latencyStats,
} from "./audience-vote-sim";

describe("audience vote simulation (150 users / 60s window)", () => {
  it("matches ground-truth final tally with random times + spikes + reconnect path", () => {
    const windowMs = 60_000;
    const clientCount = 150;
    const schedules = buildClientSchedules({
      seed: 42,
      clientCount,
      windowMs,
      disconnectProbability: 0.12,
      reconnectMinMs: 400,
      reconnectMaxMs: 2200,
    });

    // Sudden spike: 50 votes squeezed into 2 seconds mid-poll
    applyVoteBurst(schedules, 50, 31_000, 33_000);

    const events = deliverVotes({
      schedules,
      maxLatencyMs: 180,
      seed: 99,
    });

    const expected = expectedTallies(schedules);
    const { tallies, accepted, duplicatesIgnored } = aggregateVotes(events);

    expect(accepted.size).toBe(clientCount);
    expect(duplicatesIgnored).toBe(0);
    expect(tallies.a).toBe(expected.a);
    expect(tallies.b).toBe(expected.b);
    expect(tallies.a + tallies.b).toBe(clientCount);

    const stats = latencyStats(events);
    expect(stats.mean).toBeGreaterThanOrEqual(0);
    expect(stats.p95).toBeLessThanOrEqual(3500); // reconnect + jitter upper bound sanity
  });

  it("reports duplicate suppression when duplicate deliveries exist", () => {
    const schedules = buildClientSchedules({
      seed: 7,
      clientCount: 20,
      windowMs: 10_000,
      disconnectProbability: 0,
      reconnectMinMs: 100,
      reconnectMaxMs: 200,
    });
    const base = deliverVotes({ schedules, maxLatencyMs: 20, seed: 1 });
    const dup = [...base, { ...base[0], tMs: base[0].tMs + 5, latencyMs: base[0].latencyMs + 5 }];
    const { duplicatesIgnored, tallies } = aggregateVotes(dup);
    expect(duplicatesIgnored).toBe(1);
    expect(tallies.a + tallies.b).toBe(20);
  });

  it("RNG is deterministic for the same seed", () => {
    const a = buildClientSchedules({
      seed: 123,
      clientCount: 30,
      windowMs: 60_000,
      disconnectProbability: 0.2,
      reconnectMinMs: 100,
      reconnectMaxMs: 500,
    });
    const b = buildClientSchedules({
      seed: 123,
      clientCount: 30,
      windowMs: 60_000,
      disconnectProbability: 0.2,
      reconnectMinMs: 100,
      reconnectMaxMs: 500,
    });
    expect(a.map((x) => x.intendedVoteAtMs)).toEqual(b.map((x) => x.intendedVoteAtMs));
    expect(a.map((x) => x.choice)).toEqual(b.map((x) => x.choice));
  });
});

describe("simulation notes — bottlenecks & optimizations (see assertions above)", () => {
  it("documents throughput findings via latency histogram snapshot", () => {
    const schedules = buildClientSchedules({
      seed: 2026,
      clientCount: 150,
      windowMs: 60_000,
      disconnectProbability: 0.15,
      reconnectMinMs: 300,
      reconnectMaxMs: 2500,
    });
    applyVoteBurst(schedules, 50, 12_000, 14_000);
    const events = deliverVotes({ schedules, maxLatencyMs: 220, seed: 11 });
    const stats = latencyStats(events);

    // Spot-check: engineered spike should still preserve every vote in aggregateVotes (no loss).
    const { accepted } = aggregateVotes(events);
    expect(accepted.size).toBe(150);

    expect(stats).toMatchObject({
      min: expect.any(Number),
      max: expect.any(Number),
      mean: expect.any(Number),
      p95: expect.any(Number),
    });

    console.info("[audience-vote-sim] latency snapshot (delivery delay incl. reconnect)", stats);

    const rng = createRng(1);
    let sum = 0;
    const N = 10_000;
    for (let i = 0; i < N; i++) sum += rng();
    expect(sum / N).toBeGreaterThan(0.45);
    expect(sum / N).toBeLessThan(0.55);
  });
});
