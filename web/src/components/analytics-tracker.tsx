"use client";

import { Analytics, type BeforeSendEvent } from "@vercel/analytics/next";

function excludePrivateTraffic(event: BeforeSendEvent) {
  const path = event.url.split("?")[0];
  if (path === "/login" || path.startsWith("/admin")) return null;
  return event;
}

export default function AnalyticsTracker() {
  return <Analytics beforeSend={excludePrivateTraffic} />;
}
