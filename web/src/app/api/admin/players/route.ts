import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";

// Tags oficiais dos quatro cargos de liderança: nunca podem receber premiação.
const LEADERSHIP_TAGS = new Set(["#L8GV8C2Y", "#P8CCGYU0", "#QU0GC0VLU", "#9CLLGV8CC"]);
function originIsValid(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === request.nextUrl.origin;
}
async function authorized(request: NextRequest) {
  return isAdminSessionValid(request.cookies.get(adminSessionCookie.name)?.value);
}
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { data, error } = await createSupabaseAdmin().from("players")
      .select("name,player_tag,whatsapp,eligible,active,created_at").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ players: (data ?? []).map((player) => ({ ...player, eligible: LEADERSHIP_TAGS.has(String(player.player_tag ?? "").trim().toUpperCase()) ? "Inelegível" : player.eligible })) });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os jogadores." }, { status: 500 });
  }
}
export async function POST(request: NextRequest) {
  if (!originIsValid(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 80) return NextResponse.json({ error: "Informe um nome válido (até 80 caracteres)." }, { status: 400 });
  try {
    const { data, error } = await createSupabaseAdmin().from("players")
      .insert({ name, eligible: "Inelegível", whatsapp: "Não", active: false })
      .select("name,player_tag,whatsapp,eligible,active,created_at").single();
    if (error) {
      if (error.code === "23505") return NextResponse.json({ error: "Esse jogador já está cadastrado." }, { status: 409 });
      throw error;
    }
    return NextResponse.json({ player: data }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Não foi possível cadastrar o jogador." }, { status: 500 });
  }
}
export async function PATCH(request: NextRequest) {
  if (!originIsValid(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const playerTag = typeof body.player_tag === "string" ? body.player_tag.trim() : "";
  const hasWhatsapp = Object.prototype.hasOwnProperty.call(body, "whatsapp");
  const hasEligible = Object.prototype.hasOwnProperty.call(body, "eligible");
  const whatsapp = body.whatsapp;
  const eligible = body.eligible;
  if (!name || name.length > 80
    || (!hasWhatsapp && !hasEligible)
    || (hasWhatsapp && !["Sim", "Não"].includes(String(whatsapp)))
    || (hasEligible && !["Elegível", "Inelegível"].includes(String(eligible)))) {
    return NextResponse.json({ error: "Dados de jogador inválidos." }, { status: 400 });
  }
  try {
    const supabase = createSupabaseAdmin();
    const changes: Record<string, string> = {};
    if (hasWhatsapp) changes.whatsapp = String(whatsapp);
    if (hasEligible) {
      if (LEADERSHIP_TAGS.has(playerTag.toUpperCase()) && eligible === "Elegível") {
        return NextResponse.json({ error: "Líderes e co-líderes não podem ser elegíveis para premiação." }, { status: 409 });
      }
      changes.eligible = String(eligible);
    }
    let query = supabase.from("players").update(changes).select("name,player_tag,eligible,whatsapp,active,created_at");
    if (playerTag) {
      query = query.eq("player_tag", playerTag);
    } else {
      // Compatibilidade com registros antigos sem TAG: o nome só pode identificar
      // o jogador quando for único; nomes repetidos exigem a TAG.
      query = query.eq("name", name).is("player_tag", null);
    }
    const { data, error } = await query.maybeSingle();
    if (error) {
      if (error.code === "PGRST116") return NextResponse.json({ error: "Nome duplicado: atualize o jogador pela TAG." }, { status: 409 });
      throw error;
    }
    if (!data) return NextResponse.json({ error: "Jogador não encontrado para a TAG informada." }, { status: 404 });
    if (data.name !== name) return NextResponse.json({ error: "A TAG não corresponde ao nome informado." }, { status: 409 });
    return NextResponse.json({ player: data });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o jogador." }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!originIsValid(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Requisição inválida." }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const playerTag = typeof body.player_tag === "string" ? body.player_tag.trim() : "";
  if (!name || name.length > 80) return NextResponse.json({ error: "Jogador inválido." }, { status: 400 });
  try {
    const supabase = createSupabaseAdmin();
    let query = supabase.from("players").delete().eq("name", name);
    if (playerTag) query = query.eq("player_tag", playerTag);
    else query = query.is("player_tag", null);
    const { data, error } = await query.select("name,player_tag").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Jogador não encontrado." }, { status: 404 });
    return NextResponse.json({ deleted: data });
  } catch {
    return NextResponse.json({ error: "Não foi possível excluir o jogador." }, { status: 500 });
  }
}
