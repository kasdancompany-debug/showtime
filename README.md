# Kasdan Co. Player — Showtime

Interactive branching screenings: operators run the live room from **`/host`**, the wall runs **`/screen`**, and guests join from QR links under **`/join`**.

Stack: [Next.js](https://nextjs.org), Supabase Realtime (optional but required for multi-device audiences), client-side story graph + playback sync.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Use **`/admin/story`** to build graphs, **`/host`** for show night, **`/screen`** on the projector machine.

Useful scripts:

- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript (`tsc --noEmit`)
- `npm run build` — production build

---

## Show Night Runbook

**T−60 minutes**

1. Confirm production env vars are set (see [Production Deployment](#production-deployment)).
2. Open **`/host`** on the operator machine; confirm the status bar shows **Live Supabase** (not local-preview-only) if you expect phones on the network.
3. Open **`/screen`** on the projector browser (same site origin as `/host`), full-screen if possible.
4. In **Room setup & diagnostics**, verify **Phone-safe** is **Yes** on the QR test card. If not, fix `NEXT_PUBLIC_JOIN_ORIGIN` and redeploy or restart, then refresh `/host`.
5. Run **Story builder** validation mentally: every beat has media, forks have labels and next beats, no broken branch pointers.
6. Scan the QR with one real phone; complete a test vote before doors.

**During the show**

- Drive playback from the left transport on `/host`; large actions on the right control voting only.
- Keep `/screen` focused; use **Resync projector** if picture drifts after a tab sleep or refresh.
- **Close vote** always confirms — intentional for live audiences.
- **Start event** warns if the graph fails production validation (missing media, broken branches). Fix in Story builder when possible; rehearsal-only overrides require explicit confirmation.

**After the show**

- Use **End show** when the presentation is finished (irreversible for that run).
- To reset the room for another screening without redeploying, use **Reset** from diagnostics when appropriate.

---

## Local Testing

**Operator + projector on one machine**

- `/host` and `/screen` in two tabs work with **local preview** sync (BroadcastChannel). You will see an amber **Local preview mode** banner on `/host`; remote phones will not join reliably without Supabase + join origin.

**Phones on the same LAN (development)**

1. Find the computer’s LAN IP (for example `ipconfig` on Windows).
2. Set `NEXT_PUBLIC_JOIN_ORIGIN=http://YOUR_LAN_IP:3000` in `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Restart `npm run dev`, allow inbound TCP **3000** through the firewall, ensure phones use the same Wi‑Fi.
5. Refresh `/host` and re-scan the QR.

**Tunnel (when LAN is awkward)**

1. Run the app locally, start a tunnel (for example `npm run tunnel:cf` if configured, or `cloudflared tunnel --url http://localhost:3000`).
2. Set `NEXT_PUBLIC_JOIN_ORIGIN` to the public HTTPS URL (no trailing slash), restart the dev server, refresh `/host`.

**Checks**

- QR test panel must report **Phone-safe: Yes** before inviting guests.
- Manual join path: **`/join`** or `{JOIN_ORIGIN}/join/{EVENT_CODE}`.

---

## Production Deployment

Typical host: Vercel (or any Node-compatible Next.js host).

**Environment variables (client)**

| Variable | Purpose |
| -------- | ------- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL for Realtime and event sync |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (publishable) |
| `NEXT_PUBLIC_JOIN_ORIGIN` | Canonical base URL for links and QR (no trailing slash), e.g. `https://your-show.vercel.app` |

Set values in the hosting dashboard, redeploy so client bundles pick up `NEXT_PUBLIC_*`.

**Operational checklist**

- Production URL matches `NEXT_PUBLIC_JOIN_ORIGIN`.
- HTTPS in production (phones block mixed content and flaky QR flows).
- Run `npm run build` in CI or locally before promoting a release.

---

## Emergency Recovery

| Symptom | What to try |
| ------- | ----------- |
| Phones cannot load the join page | Fix `NEXT_PUBLIC_JOIN_ORIGIN`, redeploy, hard-refresh `/host`, re-scan QR; verify HTTPS and DNS. |
| Realtime disconnected banner | Use **Retry realtime** in diagnostics; check Supabase status; reload `/host` and `/screen`. |
| Projector black / “paused — media fault” | Fix URL or local file for the current beat in Story builder on the **projector** machine; use **Resync projector** from `/host`. |
| Votes stuck / UI wedged | Confirm operator closed/reveal/advance sequence; avoid duplicate `/screen` tabs competing; refresh projector tab once if needed. |
| Wrong beat after an edit | Do not load a new saved film mid-show; finish or reset the night first. |

If the room is corrupted beyond quick fixes, use **Reset** (diagnostics) to return to draft at the opening beat, then reload `/screen`.

---

## Known Limits

- **End show** ends the current run; there is no “un-end” for that session.
- **Graph validation** on start treats missing video URLs / local keys as errors for production — rehearsal can override via confirmation.
- **Local preview** does not replace Supabase for real audiences; it is tabs-only sync.
- **QR codes** encode whatever join URL `/host` computes from env + event code — wrong `JOIN_ORIGIN` cannot be fixed by guests refreshing alone.
- **Projection** depends on the browser codecs and CORS rules for direct file URLs; YouTube embeds may fail on restrictive networks or offline rigs.
- Anonymous quick join and voting fairness assumptions are documented in-app; tighten flags for paid shows if your policy requires named attendees.

---

## Learn more

- [Next.js documentation](https://nextjs.org/docs)
