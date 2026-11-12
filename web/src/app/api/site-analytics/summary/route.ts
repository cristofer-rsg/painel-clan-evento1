import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type EventRow = {
  visitor_hash: string;
  page_path: string;
  referrer_host: string | null;
  device_type: string;
  country_code: string | null;
  region: string | null;
  city: string | null;
  created_at: string;
};

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!(await isAdminSessionValid(cookieStore.get(adminSessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const allowedDays = [1, 7, 30, 90];
  const requestedDays = Number(request.nextUrl.searchParams.get("days") || 7);
  const days = allowedDays.includes(requestedDays) ? requestedDays : 7;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  const envUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!envUrl || !serviceKey) return NextResponse.json({ error: "Integração de dados indisponível" }, { status: 503 });

  const url = new URL(`${envUrl.replace(/\/$/, "")}/rest/v1/site_analytics_events`);
  url.searchParams.set("select", "visitor_hash,page_path,referrer_host,device_type,country_code,region,city,created_at");
  url.searchParams.set("created_at", `gte.${from.toISOString()}`);
  url.searchParams.set("order", "created_at.asc");
  url.searchParams.set("limit", "50000");

  const response = await fetch(url, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
    cache: "no-store",
  });
  if (!response.ok) {
    console.error("Analytics summary query failed:", response.status);
    return NextResponse.json({ error: "Não foi possível consultar os dados" }, { status: 502 });
  }

  const events = await response.json() as EventRow[];
  const visitors = new Set(events.map((event) => event.visitor_hash));
  const pageCounts = new Map<string, number>();
  const referrerCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();
  const locationCounts = new Map<string, number>();
  const daily = new Map<string, number>();
  const activeVisitors = new Set<string>();
  const activeSince = Date.now() - 5 * 60 * 1000;

  for (const event of events) {
    pageCounts.set(event.page_path, (pageCounts.get(event.page_path) || 0) + 1);
    if (event.referrer_host) referrerCounts.set(event.referrer_host, (referrerCounts.get(event.referrer_host) || 0) + 1);
    deviceCounts.set(event.device_type, (deviceCounts.get(event.device_type) || 0) + 1);
    const place = [event.city, event.region, event.country_code].filter(Boolean).join(", ");
    if (place) locationCounts.set(place, (locationCounts.get(place) || 0) + 1);
    const day = event.created_at.slice(0, 10);
    daily.set(day, (daily.get(day) || 0) + 1);
    if (new Date(event.created_at).getTime() >= activeSince) activeVisitors.add(event.visitor_hash);
  }

  const daysList = Array.from({ length: days }, (_, index) => {
    const date = new Date(from);
    date.setDate(from.getDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { date: key, label: date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }), views: daily.get(key) || 0 };
  });

  const top = (map: Map<string, number>, limit = 6) => Array.from(map, ([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count).slice(0, limit);
  return NextResponse.json({
    period: { days, from: from.toISOString(), to: to.toISOString() },
    totals: { visitors: visitors.size, views: events.length, active: activeVisitors.size },
    daily: daysList,
    pages: top(pageCounts),
    referrers: top(referrerCounts),
    devices: top(deviceCounts, 4),
    locations: top(locationCounts),
    updatedAt: to.toISOString(),
    capped: events.length === 50000,
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
