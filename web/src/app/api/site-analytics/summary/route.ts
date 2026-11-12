import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  from.setUTCDate(from.getUTCDate() - (days - 1));
  from.setUTCHours(0, 0, 0, 0);

  const envUrl = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SECRET_KEY;
  if (!envUrl || !serviceKey) return NextResponse.json({ error: "Integração de dados indisponível" }, { status: 503 });

  const response = await fetch(`${envUrl.replace(/\/$/, "")}/rest/v1/rpc/site_analytics_summary`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_active_since: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    console.error("Analytics summary query failed:", response.status);
    return NextResponse.json({ error: "Não foi possível consultar os dados" }, { status: 502 });
  }

  const summary = await response.json();
  return NextResponse.json({
    period: { days, from: from.toISOString(), to: to.toISOString() },
    ...summary,
    updatedAt: to.toISOString(),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
