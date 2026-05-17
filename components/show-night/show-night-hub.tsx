"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Loader2,
  Monitor,
  Play,
  Settings2,
} from "lucide-react";

import { StudioBadge } from "@/components/kasdan";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useJoinBaseUrl } from "@/hooks/use-join-base-url";
import { useScreenPresenceFromSync } from "@/hooks/use-screen-presence-from-sync";
import { useShowtimeConnection } from "@/hooks/use-showtime-connection";
import { getJoinUrl } from "@/lib/join/get-join-url";
import { MOCK_EVENT } from "@/lib/mock-data";
import {
  goLiveViaApi,
  goLiveViaClient,
  openShowNightSurfaces,
  resolveGoLiveCode,
} from "@/lib/showtime/go-live";
import { NIGHT1_EVENT_CODE } from "@/lib/showtime/night1-demo-graph";
import { readStoredOperatorCode, writeStoredOperatorCode } from "@/lib/showtime/operator-session";
import { getShowtimeSyncMode } from "@/lib/showtime/sync-mode";
import { useMockEventStore } from "@/lib/store/mock-event-store";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { EventRow } from "@/lib/supabase/event-room";
import { cn } from "@/lib/utils";

export function ShowNightHub() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const syncMode = useMemo(() => getShowtimeSyncMode(), []);
  const isLive = syncMode === "live_supabase";
  const { snapshot, reachability } = useShowtimeConnection();
  const joinBase = useJoinBaseUrl();

  const [code, setCode] = useState(NIGHT1_EVENT_CODE);
  const [titleDraft, setTitleDraft] = useState("");
  const [event, setEvent] = useState<EventRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [errorLine, setErrorLine] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [wentLive, setWentLive] = useState(false);
  const seededRef = useRef(false);

  const { screenLikelyConnected } = useScreenPresenceFromSync(event?.id);

  const resolvedCode = useMemo(() => resolveGoLiveCode(code, titleDraft), [code, titleDraft]);

  const joinUrl = useMemo(() => {
    const c = event?.code ?? (resolvedCode.length >= 3 ? resolvedCode : "");
    if (!c || !joinBase.joinBaseUrl) return "";
    return getJoinUrl(c, joinBase.joinBaseUrl);
  }, [event?.code, resolvedCode, joinBase.joinBaseUrl]);

  const joinWarning = snapshot.warnings.some((w) => w.id.startsWith("join_origin"));

  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const stored = readStoredOperatorCode();
    if (stored) setCode(stored);
  }, []);

  const goLive = useCallback(async () => {
    const c = resolvedCode;
    setErrorLine(null);
    setStatusLine(null);
    setBusy(true);

    if (c.length < 3) {
      setErrorLine("Enter a show code (e.g. NIGHT1) or a title we can turn into a code.");
      setBusy(false);
      return;
    }

    writeStoredOperatorCode(c);
    setCode(c);

    try {
      if (!isLive || !supabase) {
        const store = useMockEventStore.getState();
        store.syncSupabaseEventMeta({
          eventId: MOCK_EVENT.id,
          code: c,
          title: titleDraft.trim() || MOCK_EVENT.title,
        });
        store.rehearsalResetToOpeningBeat();
        store.startEvent();
        setStatusLine("Rehearsal mode — operator and projector opened on this computer. Add Supabase env for real phones.");
        setWentLive(true);
        openShowNightSurfaces(c);
        return;
      }

      setStatusLine("Arming the room…");
      const api = await goLiveViaApi({
        code: c,
        title: titleDraft.trim() || undefined,
        installDemo: c === NIGHT1_EVENT_CODE,
      });

      let armedEvent: EventRow | undefined = api.event;
      let hasVideo = api.hasOpeningVideo ?? false;

      if (!api.ok) {
        if (api.useClientFallback) {
          const clientResult = await goLiveViaClient(supabase, {
            code: c,
            title: titleDraft.trim() || undefined,
          });
          armedEvent = clientResult.event;
          hasVideo = clientResult.hasOpeningVideo;
        } else {
          throw new Error(api.error ?? "Go live failed.");
        }
      }

      if (!armedEvent) {
        throw new Error("Go live did not return a show.");
      }

      setEvent(armedEvent);
      setWentLive(true);

      const videoNote = hasVideo
        ? "Opening reel is loaded on the projector — tap Play on the operator desk when the room is ready."
        : "Show is live. Assign a video to the opening beat in the builder, then tap Play on the operator desk.";

      setStatusLine(
        joinWarning
          ? `${videoNote} Tip: set NEXT_PUBLIC_JOIN_ORIGIN so phones on Wi‑Fi can join.`
          : videoNote,
      );

      openShowNightSurfaces(c);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Go live failed.";
      setErrorLine(msg);
      if (/anonymous/i.test(msg)) {
        setErrorLine(
          `${msg} Enable Anonymous sign-in once in Supabase (Authentication → Providers), refresh, and tap Go live again.`,
        );
      }
    } finally {
      setBusy(false);
    }
  }, [resolvedCode, titleDraft, isLive, supabase, joinWarning]);

  const copyJoinLink = useCallback(() => {
    if (!joinUrl) return;
    void navigator.clipboard.writeText(joinUrl).then(() => {
      setLinkCopied(true);
      window.setTimeout(() => setLinkCopied(false), 2000);
    });
  }, [joinUrl]);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-5 py-10">
      <header className="space-y-3 text-center sm:text-left">
        <StudioBadge showSeal href="/" className="mx-auto sm:mx-0" />
        <h1 className="font-heading text-3xl font-semibold tracking-tight">Show night</h1>
        <p className="text-muted-foreground leading-relaxed">
          One button: load your show, open the operator desk and projector, arm the opening beat. No Supabase dashboard during the show.
        </p>
      </header>

      <Card className="border-primary/25 shadow-lg ring-1 ring-primary/10">
        <CardHeader className="pb-2 text-center sm:text-left">
          <CardTitle className="font-heading text-xl">Go live</CardTitle>
          <CardDescription>
            {isLive
              ? "Uses your server keys to set up the room — you stay in the app."
              : "Rehearsal on this computer (add Supabase env for 200 phones)."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="show-night-code">Show code</Label>
            <Input
              id="show-night-code"
              className="font-mono text-lg uppercase tracking-wide"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder={NIGHT1_EVENT_CODE}
              disabled={busy}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="show-night-title">Title (only if this code is new)</Label>
            <Input
              id="show-night-title"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              placeholder="Optional — e.g. Davey does it"
              disabled={busy}
            />
          </div>

          <Button
            type="button"
            size="lg"
            className="h-14 w-full text-lg font-semibold"
            disabled={busy || resolvedCode.length < 3}
            onClick={() => void goLive()}
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 size-5 animate-spin" />
                Going live…
              </>
            ) : (
              <>
                <Play className="mr-2 size-5 fill-current" />
                Go live
              </>
            )}
          </Button>

          {isLive && process.env.NODE_ENV === "development" ? (
            <p className="text-muted-foreground text-center text-[11px] leading-relaxed">
              First time? Code <span className="font-mono">{NIGHT1_EVENT_CODE}</span> installs the full demo graph automatically.
            </p>
          ) : null}

          {statusLine ? (
            <p className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm leading-relaxed text-emerald-950 dark:text-emerald-50" role="status">
              <CheckCircle2 className="mr-1.5 inline size-4" aria-hidden />
              {statusLine}
            </p>
          ) : null}

          {errorLine ? (
            <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm leading-relaxed" role="alert">
              <AlertTriangle className="mr-1.5 inline size-4" aria-hidden />
              {errorLine}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {wentLive ? (
        <Card size="sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">During the show</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="space-y-2 text-sm">
              <li className="flex gap-2">
                <Monitor className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>
                  Projector:{" "}
                  {screenLikelyConnected ? (
                    <span className="text-emerald-600 dark:text-emerald-400">connected</span>
                  ) : (
                    <span className="text-amber-600">open /screen on the projector if you closed it</span>
                  )}
                </span>
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span>Operator desk: run the show from the tab we opened (Play → vote → reveal → next).</span>
              </li>
            </ul>
            <Button type="button" variant="outline" className="w-full" disabled={!joinUrl} onClick={copyJoinLink}>
              <Copy className="mr-2 size-4" />
              {linkCopied ? "Copied audience link" : "Copy audience link for phones"}
            </Button>
            {joinUrl ? <p className="break-all text-center font-mono text-[10px] text-muted-foreground">{joinUrl}</p> : null}
            {joinWarning ? (
              <p className="text-xs text-amber-700 dark:text-amber-200">
                Phones may not reach this link until you set <span className="font-mono">NEXT_PUBLIC_JOIN_ORIGIN</span> to your LAN or public URL and restart the dev server.
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <Card size="sm" className="border-border/60 bg-muted/20">
          <CardContent className="pt-4">
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li>
                <strong className="text-foreground">Live backend:</strong>{" "}
                {isLive
                  ? reachability === "unreachable"
                    ? "Cannot reach Supabase — check .env.local"
                    : "Connected"
                  : "Rehearsal only (no Supabase keys)"}
              </li>
              <li>
                <strong className="text-foreground">One-time setup:</strong>{" "}
                <span className="font-mono">SUPABASE_SERVICE_ROLE_KEY</span> in .env.local lets Go live arm the room without touching the dashboard.
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap justify-center gap-2 border-t border-border/60 pt-4 sm:justify-start">
        <Link href="/admin/story" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          <Settings2 className="mr-1 size-4" />
          Edit show
        </Link>
        <Link href="/test-run" className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Technical checklist
        </Link>
      </div>
    </div>
  );
}
