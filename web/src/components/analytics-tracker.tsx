"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

function excludePrivateTraffic(event: BeforeSendEvent) {
  const path = event.url.split("?")[0];
  if (path === "/login" || path.startsWith("/admin")) return null;
  return event;
}

export default function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname || pathname === "/login" || pathname.startsWith("/admin") || pathname.startsWith("/api/")) return;
    void fetch("/api/site-analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: pathname }),
      credentials: "same-origin",
      keepalive: true,
    }).catch(() => {});
  }, [pathname]);

  return <Analytics beforeSend={excludePrivateTraffic} />;
}
