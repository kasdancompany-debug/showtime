"use client";

import { useState } from "react";

import { resetShowtimeDeviceAndReload } from "@/lib/join/device-reset";
import type { AudienceRegistrationStatus } from "@/lib/join/ensure-audience-participant";
import type { JoinMobileTransport } from "@/hooks/use-join-mobile-vote";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Props = {
  roomCode: string;
  role: "audience";
  participantId: string | null;
  audienceMemberId: string | null;
  registrationStatus: AudienceRegistrationStatus;
  transport: JoinMobileTransport;
  voteEligible: boolean;
  voteBlockReason: string | null;
  joined: boolean;
  className?: string;
};

export function JoinDebugFooter({
  roomCode,
  role,
  participantId,
  audienceMemberId,
  registrationStatus,
  transport,
  voteEligible,
  voteBlockReason,
  joined,
  className,
}: Props) {
  const [resetting, setResetting] = useState(false);

  async function onReset() {
    setResetting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await resetShowtimeDeviceAndReload(supabase);
    } catch {
      setResetting(false);
    }
  }

  return (
    <footer
      className={cn(
        "shrink-0 border-t border-[color-mix(in_oklch,var(--kc-gold)_18%,transparent)] bg-black/90 px-3 py-2 font-mono text-[10px] leading-relaxed text-[color-mix(in_oklch,var(--kc-champagne)_75%,transparent)]",
        className,
      )}
      aria-label="Join debug"
    >
      <div className="mx-auto flex max-w-lg flex-col gap-1.5">
        <p>
          <span className="text-[var(--kc-gold-bright)]">room</span> {roomCode.toUpperCase()}
          <span className="mx-2 text-[var(--kc-cream-dim)]">·</span>
          <span className="text-[var(--kc-gold-bright)]">role</span> {role}
        </p>
        <p className="break-all">
          <span className="text-[var(--kc-gold-bright)]">participantId</span> {participantId ?? "—"}
        </p>
        <p className="break-all">
          <span className="text-[var(--kc-gold-bright)]">memberId</span> {audienceMemberId ?? "—"}
        </p>
        <p>
          <span className="text-[var(--kc-gold-bright)]">registration</span> {registrationStatus}
          <span className="mx-2 text-[var(--kc-cream-dim)]">·</span>
          <span className="text-[var(--kc-gold-bright)]">joined</span> {joined ? "yes" : "no"}
          <span className="mx-2 text-[var(--kc-cream-dim)]">·</span>
          <span className="text-[var(--kc-gold-bright)]">rt</span> {transport}
        </p>
        <p>
          <span className="text-[var(--kc-gold-bright)]">vote</span>{" "}
          {voteEligible ? (
            <span className="text-[color-mix(in_oklch,var(--kc-cream)_90%,transparent)]">eligible</span>
          ) : (
            <span className="text-[color-mix(in_oklch,var(--kc-velvet)_35%,var(--kc-cream))]">
              blocked{voteBlockReason ? ` — ${voteBlockReason}` : ""}
            </span>
          )}
        </p>
        <button
          type="button"
          disabled={resetting}
          onClick={() => void onReset()}
          className="mt-1 w-fit rounded border border-[color-mix(in_oklch,var(--kc-gold)_30%,transparent)] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--kc-champagne)] hover:bg-white/5 disabled:opacity-50"
        >
          {resetting ? "Resetting…" : "Reset this device for testing"}
        </button>
      </div>
    </footer>
  );
}
