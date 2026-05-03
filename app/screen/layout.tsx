"use client";

import { useEffect } from "react";

import { ShowScreenShell } from "@/components/layout/show-screen-shell";

export default function ScreenRouteLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtml = html.style.overflow;
    const prevBody = body.style.overflow;
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    html.style.overscrollBehavior = "none";
    body.style.overscrollBehavior = "none";
    return () => {
      html.style.overflow = prevHtml;
      body.style.overflow = prevBody;
      html.style.overscrollBehavior = "";
      body.style.overscrollBehavior = "";
    };
  }, []);

  return <ShowScreenShell>{children}</ShowScreenShell>;
}
