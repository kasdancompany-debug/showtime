import Link from "next/link";
import { ArrowRight, Clapperboard, Monitor, QrCode, Sparkles } from "lucide-react";

import { DisplayHeading } from "@/components/cinematic/display-heading";
import { FilmGrain } from "@/components/cinematic/film-grain";
import { SpotlightWash } from "@/components/cinematic/spotlight";
import { StudioBadge } from "@/components/kasdan";
import { kcCopy } from "@/lib/design/kasdan-hollywood-tokens";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MOCK_EVENT } from "@/lib/mock-data";

const links = [
  {
    href: "/host",
    title: "Operator",
    desc: "Run playback, votes, and the next branch from one desk.",
    icon: Clapperboard,
  },
  {
    href: "/screen",
    title: "Room screen",
    desc: "Full-bleed cinematic UI for the wall or projector.",
    icon: Monitor,
  },
  {
    href: `/join/${MOCK_EVENT.eventCode}`,
    title: "Audience join",
    desc: `Local preview — join code ${MOCK_EVENT.eventCode} until Supabase is wired.`,
    icon: QrCode,
  },
  {
    href: "/admin/story",
    title: "Story builder",
    desc: "Nodes, media URLs, questions, and branch wiring.",
    icon: Sparkles,
  },
] as const;

export default function Home() {
  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-x-hidden">
      <SpotlightWash />
      <FilmGrain />
      <div className="relative z-[2] mx-auto flex w-full max-w-5xl flex-1 flex-col justify-center gap-12 px-5 py-8 sm:gap-14 sm:px-8 sm:py-12 lg:gap-16 lg:py-14">
        <section className="flex flex-col pt-2">
          <StudioBadge className="mb-5" showSeal />
          <p className="kc-eyebrow text-[var(--kc-champagne)]">{kcCopy.presents}</p>
          <DisplayHeading
            as="h1"
            className="mt-5 max-w-3xl text-[clamp(2.75rem,8vw,4.5rem)] font-normal leading-[1.05] tracking-tight sm:mt-6"
          >
            Showtime
          </DisplayHeading>
          <p className="mt-6 max-w-xl font-sans text-base leading-relaxed text-muted-foreground sm:text-lg">
            {kcCopy.tagline}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 sm:mt-10">
            <Link
              href="/host"
              className={cn(buttonVariants({ size: "lg" }), "inline-flex rounded-full px-7 text-base no-underline")}
            >
              Open operator <ArrowRight className="size-4" data-icon="inline-end" />
            </Link>
            <Link
              href="/screen"
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "inline-flex rounded-full border-[var(--bn-line)] bg-transparent px-7 text-base no-underline",
              )}
            >
              Preview screen
            </Link>
          </div>
        </section>

        <section aria-label="Destinations">
          <ul className="grid gap-4 sm:grid-cols-2">
            {links.map(({ href, title, desc, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  className="group flex h-full min-h-[8.5rem] flex-col rounded-2xl border border-[var(--bn-line)] bg-card/65 p-6 shadow-[0_0_0_1px_rgba(255,255,255,0.03)_inset] backdrop-blur-md transition hover:border-primary/35 hover:bg-card"
                >
                  <Icon className="size-5 shrink-0 text-primary" />
                  <span className="mt-4 font-heading text-xl font-normal text-foreground">{title}</span>
                  <span className="mt-2 flex-1 font-sans text-base leading-snug text-muted-foreground">{desc}</span>
                  <span className="mt-4 inline-flex items-center gap-1 font-mono text-xs font-medium text-primary opacity-80 transition group-hover:opacity-100">
                    Open <ArrowRight className="size-3" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
