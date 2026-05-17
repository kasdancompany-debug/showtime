"use client";



import type { ReactNode } from "react";



import { cn } from "@/lib/utils";



/**

 * Wraps Showtime surfaces with Kasdan Co. Hollywood CSS variables and base typography.

 */

export function KasdanHollywoodTheme({

  children,

  className,

}: {

  children: ReactNode;

  className?: string;

}) {

  return (

    <div

      className={cn(

        "kasdan-hollywood relative flex min-h-dvh flex-1 flex-col bg-[var(--kc-piano)] text-[var(--kc-cream)] antialiased supports-[min-height:100dvh]:min-h-[100dvh]",

        className,

      )}

    >

      {children}

    </div>

  );

}

