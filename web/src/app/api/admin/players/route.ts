import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";
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
      .select("name,player_tag,eligible,whatsapp,active,created_at").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ players: data ?? [] });
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
      .insert({ name, eligible: "Elegível", whatsapp: "Sim", active: false })
      .select("name,player_tag,eligible,whatsapp,active,created_at").single();
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
  const eligible = body.eligible;
  const whatsapp = body.whatsapp;
  if (!name || !["Elegível", "Inelegível"].includes(String(eligible)) || !["Sim", "Não"].includes(String(whatsapp))) {
    return NextResponse.json({ error: "Dados de jogador inválidos." }, { status: 400 });
  }
  try {
    const { data, error } = await createSupabaseAdmin().from("players")
      .update({ eligible, whatsapp }).eq("name", name)
      .select("name,player_tag,eligible,whatsapp,active,created_at").maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ error: "Jogador não encontrado." }, { status: 404 });
    return NextResponse.json({ player: data });
  } catch {
    return NextResponse.json({ error: "Não foi possível atualizar o jogador." }, { status: 500 });
  }
}
