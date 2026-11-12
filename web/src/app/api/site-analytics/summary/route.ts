import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseDate(value: string | null, endOfDay = false) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  if (!(await isAdminSessionValid(cookieStore.get(adminSessionCookie.name)?.value))) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const startParam = request.nextUrl.searchParams.get("from");
  const endParam = request.nextUrl.searchParams.get("to");
  let from: Date;
  let to = new Date();
  let days: number;

  if (startParam || endParam) {
    const customFrom = parseDate(startParam);
    const customTo = parseDate(endParam, true);
    if (!customFrom || !customTo || customFrom > customTo) {
      return NextResponse.json({ error: "Selecione um intervalo de datas válido." }, { status: 400 });
    }
    days = Math.floor((customTo.getTime() - customFrom.getTime()) / 86_400_000) + 1;
    if (days > 365) return NextResponse.json({ error: "O período personalizado pode ter no máximo 365 dias." }, { status: 400 });
    from = customFrom;
    to = customTo;
  } else {
    const allowedDays = [1, 7, 30, 90];
    const requestedDays = Number(request.nextUrl.searchParams.get("days") || 7);
    days = allowedDays.includes(requestedDays) ? requestedDays : 7;
    from = new Date(to);
    from.setUTCDate(from.getUTCDate() - (days - 1));
    from.setUTCHours(0, 0, 0, 0);
  }

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
    updatedAt: new Date().toISOString(),
  }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
}
