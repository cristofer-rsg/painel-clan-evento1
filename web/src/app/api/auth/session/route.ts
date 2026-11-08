import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { adminSessionCookie, createAdminSession, isAdminSessionValid } from "@/lib/ghost-hunt/session";

export const dynamic = "force-dynamic";

function originIsValid(request: NextRequest) {
  const origin = request.headers.get("origin");
  return !origin || origin === request.nextUrl.origin;
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get(adminSessionCookie.name)?.value;
  const authenticated = await isAdminSessionValid(token);
  return NextResponse.json({ authenticated, role: authenticated ? "admin" : null });
}

export async function POST(request: NextRequest) {
  if (!originIsValid(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }

  let password = "";
  try {
    const body = await request.json();
    password = typeof body?.password === "string" ? body.password : "";
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const expectedPassword = process.env.ADMIN_PASSWORD;
  if (!expectedPassword) {
    return NextResponse.json({ error: "A senha administrativa ainda não foi configurada no servidor." }, { status: 503 });
  }

  const supplied = Buffer.from(password);
  const expected = Buffer.from(expectedPassword);
  const valid = supplied.length === expected.length && timingSafeEqual(supplied, expected);
  if (!valid) {
    return NextResponse.json({ error: "Senha administrativa incorreta." }, { status: 401 });
  }

  try {
    const token = await createAdminSession();
    const response = NextResponse.json({ authenticated: true, role: "admin" });
    response.cookies.set(adminSessionCookie.name, token, {
      httpOnly: adminSessionCookie.httpOnly,
      secure: adminSessionCookie.secure,
      sameSite: adminSessionCookie.sameSite,
      path: adminSessionCookie.path,
      maxAge: adminSessionCookie.maxAge,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "A sessão segura não está configurada corretamente." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!originIsValid(request)) {
    return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(adminSessionCookie.name, "", {
    httpOnly: true,
    secure: adminSessionCookie.secure,
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
