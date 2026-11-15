import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { adminSessionCookie, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";
async function authorized(request: NextRequest) {
  return isAdminSessionValid(request.cookies.get(adminSessionCookie.name)?.value);
}
export async function GET(request: NextRequest) {
  if (!(await authorized(request))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  try {
    const { data, error } = await createSupabaseAdmin().from("players")
      .select("name,player_tag,whatsapp,active,role,created_at").order("name", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ players: data ?? [] });
  } catch {
    return NextResponse.json({ error: "Não foi possível carregar os jogadores." }, { status: 500 });
  }
}
