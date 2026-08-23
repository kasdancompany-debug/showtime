#!/usr/bin/env node
/**
 * Vote-path load test — simulates N concurrent phones registering as audience members and
 * casting a ballot, to validate the fan-out fix (see hooks/use-join-room.ts, .../use-operator-supabase-room.ts,
 * .../use-screen-supabase-display.ts) actually holds up under real concurrency.
 *
 * DOES NOT RUN AGAINST ANYTHING BY DEFAULT — you point it at a target with env vars. Do not run
 * this against a live production Supabase project without expecting real load and real rows
 * written to `audience_members` / `votes` for the event you target. Use a rehearsal/test event.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co \
 *   SUPABASE_ANON_KEY=eyJ... \
 *   TARGET_URL=http://localhost:3000 \
 *   EVENT_CODE=NIGHT1 \
 *   PHONES=150 \
 *   node scripts/load-test-votes.mjs
 *
 * Required env:
 *   SUPABASE_URL, SUPABASE_ANON_KEY   — same values as NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY
 *   TARGET_URL                        — origin serving POST /api/join/vote (local dev or a rehearsal deploy)
 *   EVENT_CODE                        — an event in "voting_open" status with a real current_node_id
 *
 * Optional env:
 *   PHONES=100                        — concurrent simulated phones (plan calls for 100–300)
 *   CHOICE_SPLIT=0.5                  — fraction voting "A" (rest vote "B")
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const TARGET_URL = process.env.TARGET_URL;
const EVENT_CODE = process.env.EVENT_CODE;
const PHONES = Number(process.env.PHONES ?? 100);
const CHOICE_SPLIT = Number(process.env.CHOICE_SPLIT ?? 0.5);

function fail(msg) {
  console.error(`[load-test] ${msg}`);
  process.exit(1);
}

if (!SUPABASE_URL) fail("Missing SUPABASE_URL");
if (!SUPABASE_ANON_KEY) fail("Missing SUPABASE_ANON_KEY");
if (!TARGET_URL) fail("Missing TARGET_URL");
if (!EVENT_CODE) fail("Missing EVENT_CODE");

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(error) {
  if (!error) return false;
  if (error.status === 429) return true;
  return /rate limit/i.test(error.message ?? "");
}

/** Mirrors lib/join/supabase-room.ts tryEnsureAnonymousSession's retry so this script measures
 *  what a real (patched) client would actually achieve, not just the first-attempt failure rate. */
async function signInWithRetry(client, maxAttempts = 5) {
  let lastError = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) {
      const delay = Math.random() * Math.min(6000, 400 * 2 ** (attempt - 1));
      await sleep(delay);
    }
    const { data, error } = await client.auth.signInAnonymously();
    if (!error) return { session: data.session, error: null, attempts: attempt + 1 };
    lastError = error;
    if (!isRateLimited(error)) break;
  }
  return { session: null, error: lastError, attempts: maxAttempts };
}

async function simulatePhone(index, eventId, nodeId, choice) {
  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const t0 = Date.now();
  const { session, error: signInErr } = await signInWithRetry(client);
  const signIn = { session };
  if (signInErr || !signIn.session) {
    return { index, phase: "signin", ok: false, error: signInErr?.message ?? "no session", ms: Date.now() - t0 };
  }
  const sessionId = signIn.session.user.id;
  const accessToken = signIn.session.access_token;

  const { error: memberErr } = await client
    .from("audience_members")
    .upsert(
      { event_id: eventId, session_id: sessionId, display_name: `LoadTest ${index}`, table_number: null },
      { onConflict: "event_id,session_id" },
    );
  if (memberErr) {
    return { index, phase: "join", ok: false, error: memberErr.message, ms: Date.now() - t0 };
  }

  const tVote = Date.now();
  let res;
  try {
    res = await fetch(`${TARGET_URL}/api/join/vote`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ eventId, storyNodeId: nodeId, sessionId, choice }),
    });
  } catch (e) {
    return { index, phase: "vote", ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - tVote };
  }
  const ms = Date.now() - tVote;
  if (res.status === 200) return { index, phase: "vote", ok: true, duplicate: false, ms };
  if (res.status === 409) return { index, phase: "vote", ok: true, duplicate: true, ms };
  const body = await res.text().catch(() => "");
  return { index, phase: "vote", ok: false, error: `HTTP ${res.status} ${body}`, ms };
}

async function main() {
  console.log(`[load-test] resolving event ${EVENT_CODE} via anon client…`);
  const bootstrap = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: event, error: eventErr } = await bootstrap
    .from("events")
    .select("id,status,current_node_id")
    .eq("code", EVENT_CODE.toUpperCase())
    .maybeSingle();

  if (eventErr) fail(`Could not look up event: ${eventErr.message}`);
  if (!event) fail(`No event with code ${EVENT_CODE}`);
  if (event.status !== "voting_open" || !event.current_node_id) {
    fail(`Event ${EVENT_CODE} is not in voting_open with a current node (status=${event.status}). Open a vote first.`);
  }

  console.log(`[load-test] event ${EVENT_CODE} → node ${event.current_node_id}, firing ${PHONES} simulated phones…`);
  const t0 = Date.now();
  const results = await Promise.all(
    Array.from({ length: PHONES }, (_, i) =>
      simulatePhone(i, event.id, event.current_node_id, i / PHONES < CHOICE_SPLIT ? "A" : "B"),
    ),
  );
  const wallMs = Date.now() - t0;

  const votePhase = results.filter((r) => r.phase === "vote");
  const ok = votePhase.filter((r) => r.ok && !r.duplicate);
  const dup = votePhase.filter((r) => r.ok && r.duplicate);
  const errored = results.filter((r) => !r.ok);
  const latencies = votePhase.filter((r) => r.ok).map((r) => r.ms).sort((a, b) => a - b);

  console.log("\n[load-test] results");
  console.log(`  phones simulated : ${PHONES}`);
  console.log(`  wall time        : ${wallMs}ms`);
  console.log(`  votes ok         : ${ok.length}`);
  console.log(`  votes duplicate  : ${dup.length}`);
  console.log(`  errors           : ${errored.length}`);
  if (latencies.length) {
    console.log(`  vote latency p50 : ${percentile(latencies, 50)}ms`);
    console.log(`  vote latency p95 : ${percentile(latencies, 95)}ms`);
    console.log(`  vote latency p99 : ${percentile(latencies, 99)}ms`);
  }
  if (errored.length) {
    console.log("\n[load-test] sample errors:");
    for (const r of errored.slice(0, 10)) console.log(`  #${r.index} [${r.phase}] ${r.error}`);
  }

  console.log(
    "\n[load-test] Cross-check against /host and /screen while this runs — with the debounce fix in place, both should stay responsive and both should settle on the same final tally shown above (ok votes count).",
  );
}

main().catch((e) => fail(e instanceof Error ? e.stack ?? e.message : String(e)));
