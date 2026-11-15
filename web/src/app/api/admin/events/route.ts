import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";
async function authorized(request: NextRequest) {
  return isAdminSessionValid(request.cookies.get(adminSessionCookie.name)?.value);
}
function monthRange(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(monthKey + "-01T00:00:00-03:00");
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const end = new Date(nextYear + "-" + String(nextMonth).padStart(2, "0") + "-01T00:00:00-03:00");
  return { start: start.toISOString(), end: end.toISOString() };
}
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const month = request.nextUrl.searchParams.get("month") ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return NextResponse.json({ error: "Informe o mês no formato AAAA-MM." }, { status: 400 });
  try {
    const bounds = monthRange(month);
    const supabase = createSupabaseAdmin();
    const rows: unknown[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabase.from("events")
        .select("id,player,category,activity,points,created_at")
        .gte("created_at", bounds.start).lt("created_at", bounds.end)
        .order("created_at", { ascending: false }).range(offset, offset + 999);
      if (error) throw error;
      const page = data ?? [];
      rows.push(...page);
      if (page.length < 1000) break;
    }
    return NextResponse.json({ month, events: rows });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os lançamentos." }, { status: 500 });
  }
}
