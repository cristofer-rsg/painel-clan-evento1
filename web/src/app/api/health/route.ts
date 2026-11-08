import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const configured = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
  return NextResponse.json({
    app: "ghost-hunt-web",
    status: "ok",
    supabaseConfigured: configured,
    timestamp: new Date().toISOString(),
  });
}
