import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";

async function authorized(request: NextRequest) {
  return isAdminSessionValid(request.cookies.get(adminSessionCookie.name)?.value);
}

async function readBody(request: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return errorResponse("Não autorizado.", 401);
  try {
    const { data, error } = await createSupabaseAdmin().from("players")
      .select("name,player_tag,whatsapp,active,role,created_at").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ players: data ?? [] });
  } catch {
    return errorResponse("Não foi possível carregar os jogadores.", 500);
  }
}

export async function POST(request: NextRequest) {
  if (!(await authorized(request))) return errorResponse("Não autorizado.", 401);

  const body = await readBody(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) return errorResponse("Informe o nome do jogador.", 400);
  if (name.length > 80) return errorResponse("O nome deve ter no máximo 80 caracteres.", 400);

  try {
    const { data, error } = await createSupabaseAdmin()
      .from("players")
      .insert({ name, active: false, whatsapp: "Não" })
      .select("name,player_tag,whatsapp,active,role,created_at")
      .single();

    if (error?.code === "23505") return errorResponse("Já existe um cadastro com esse nome.", 409);
    if (error) throw error;

    return NextResponse.json({ player: data }, { status: 201 });
  } catch {
    return errorResponse("Não foi possível cadastrar o jogador.", 500);
  }
}

export async function PATCH(request: NextRequest) {
  if (!(await authorized(request))) return errorResponse("Não autorizado.", 401);

  const body = await readBody(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const playerTag = typeof body?.player_tag === "string" ? body.player_tag.trim() : "";
  const whatsapp = body?.whatsapp;

  if (!name && !playerTag) return errorResponse("Jogador não informado.", 400);
  if (whatsapp !== "Sim" && whatsapp !== "Não") {
    return errorResponse("Informe se o jogador está no grupo do WhatsApp.", 400);
  }

  try {
    let query = createSupabaseAdmin().from("players").update({ whatsapp });
    query = playerTag ? query.eq("player_tag", playerTag) : query.eq("name", name);
    const { data, error } = await query.select("name,player_tag,whatsapp,active,role,created_at").maybeSingle();

    if (error) throw error;
    if (!data) return errorResponse("Jogador não encontrado.", 404);

    return NextResponse.json({ player: data });
  } catch {
    return errorResponse("Não foi possível atualizar o jogador.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  if (!(await authorized(request))) return errorResponse("Não autorizado.", 401);

  const body = await readBody(request);
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  const playerTag = typeof body?.player_tag === "string" ? body.player_tag.trim() : "";
  if (!name && !playerTag) return errorResponse("Jogador não informado.", 400);

  try {
    let query = createSupabaseAdmin().from("players").delete();
    query = playerTag ? query.eq("player_tag", playerTag) : query.eq("name", name);
    const { data, error } = await query.select("name").maybeSingle();

    if (error?.code === "23503") {
      return errorResponse("Este jogador possui histórico vinculado e não pode ser excluído. Altere a situação para inativo pela sincronização do clã.", 409);
    }
    if (error) throw error;
    if (!data) return errorResponse("Jogador não encontrado.", 404);

    return NextResponse.json({ success: true, name: data.name });
  } catch {
    return errorResponse("Não foi possível excluir o jogador.", 500);
  }
}
