import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";
const categories = ["Guerras", "Liga dos Clãs", "Doações", "Jogos do Clã", "Raide de Fim de Semana"];

function originIsValid(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin;
}
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
export async function PATCH(request: NextRequest) {
  if (!originIsValid(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const id = Number(body.id);
  const player = typeof body.player === "string" ? body.player.trim() : "";
  const category = typeof body.category === "string" ? body.category : "";
  const activity = typeof body.activity === "string" ? body.activity.trim() : "";
  const points = Number(body.points);
  if (!Number.isSafeInteger(id) || id <= 0 || !player || !category || activity.length > 300 || !Number.isInteger(points) || points < -200 || points > 200) {
    return NextResponse.json({ error: "Confira jogador, categoria, descrição e pontuação (-200 a 200)." }, { status: 400 });
  }
  try {
    const supabase = createSupabaseAdmin();
    const { data: current, error: currentError } = await supabase.from("events").select("category,player").eq("id", id).maybeSingle();
    if (currentError) throw currentError;
    if (!current) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    // Categorias legadas e não editáveis (como Capital do Clã) podem ser mantidas,
    // mas nunca escolhidas como uma nova categoria para outro lançamento.
    if (!categories.includes(category) && category !== current.category) {
      return NextResponse.json({ error: "Categoria não permitida." }, { status: 400 });
    }
    const { data, error } = await supabase.from("events")
      .update({ player, category, activity, points }).eq("id", id)
      .select("id,player,category,activity,points,created_at").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    return NextResponse.json({ event: data });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o lançamento." }, { status: 500 });
  }
}
export async function DELETE(request: NextRequest) {
  if (!originIsValid(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const id = Number(request.nextUrl.searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "ID inválido." }, { status: 400 });
  try {
    const { data, error } = await createSupabaseAdmin().from("events").delete().eq("id", id).select("id").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Lançamento não encontrado." }, { status: 404 });
    return NextResponse.json({ deleted: true, id: data.id });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir o lançamento." }, { status: 500 });
  }
}
