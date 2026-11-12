import { createHmac, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export const runtime = "nodejs";
const visitorCookie = "gh_analytics_visitor";

function getDeviceType(userAgent: string) {
  if (/ipad|tablet|kindle|silk/i.test(userAgent)) return "tablet";
  if (/mobile|android|iphone|ipod/i.test(userAgent)) return "mobile";
  if (/windows|macintosh|linux|x11/i.test(userAgent)) return "desktop";
  return "unknown";
}

function safeHeader(value: string | null, max = 100) {
  return value?.replace(/[\r\n\0]/g, "").trim().slice(0, max) || null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const pagePath = typeof body?.path === "string" ? body.path : "";
    if (!pagePath.startsWith("/") || pagePath.startsWith("//") || pagePath.startsWith("/admin") || pagePath === "/login" || pagePath.startsWith("/api/")) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const envUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SECRET_KEY;
    const hashSecret = process.env.GHOST_HUNT_SESSION_SECRET;
    if (!envUrl || !serviceKey || !hashSecret) return NextResponse.json({ ok: false }, { status: 503 });

    const cookieStore = await cookies();
    let visitorId = cookieStore.get(visitorCookie)?.value;
    const isNewVisitor = !visitorId || !/^[0-9a-f-]{36}$/i.test(visitorId);
    if (isNewVisitor) visitorId = randomUUID();
    const visitorHash = createHmac("sha256", hashSecret).update(visitorId!).digest("hex");

    const referer = request.headers.get("referer");
    let referrerHost: string | null = null;
    try {
      if (referer) {
        const host = new URL(referer).hostname.toLowerCase();
        if (host !== request.nextUrl.hostname.toLowerCase()) referrerHost = host.slice(0, 120);
      }
    } catch {}

    const row = {
      visitor_hash: visitorHash,
      page_path: pagePath.slice(0, 300),
      referrer_host: referrerHost,
      device_type: getDeviceType(request.headers.get("user-agent") || ""),
      country_code: safeHeader(request.headers.get("x-vercel-ip-country"), 2),
      region: safeHeader(request.headers.get("x-vercel-ip-country-region"), 80),
      city: safeHeader(request.headers.get("x-vercel-ip-city"), 100),
    };

    const response = await fetch(`${envUrl.replace(/\/$/, "")}/rest/v1/site_analytics_events`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
      cache: "no-store",
    });
    if (!response.ok) {
      console.error("Analytics event could not be stored:", response.status);
      return NextResponse.json({ ok: false }, { status: 502 });
    }

    const result = NextResponse.json({ ok: true });
    if (isNewVisitor) result.cookies.set(visitorCookie, visitorId!, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    return result;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
