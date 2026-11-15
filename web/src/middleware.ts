import { NextRequest, NextResponse } from "next/server";

const appRouteRoots = [
  "/home",
  "/ranking",
  "/performance",
  "/history",
  "/rules",
  "/admin",
  "/login",
  "/player",
  "/api",
];

const ingloriousProductionOrigin = "https://inglorious.ghosthunt.com.br";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const ingloriousMatch = pathname.match(/^\/inglorious(?=\/|$)/i);
  if (ingloriousMatch) {
    const appPath = pathname.slice(ingloriousMatch[0].length) || "/";
    const destination = new URL(`/Inglorious${appPath}${search}`, ingloriousProductionOrigin);
    return NextResponse.redirect(destination, 307);
  }

  if (pathname === "/ghosthunt" || pathname.startsWith("/ghosthunt/")) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = pathname.replace(/^\/ghosthunt(?=\/|$)/, "") || "/home";
    return NextResponse.rewrite(rewrittenUrl);
  }

  const isGhostHuntRoute = appRouteRoots.some(
    (root) => pathname === root || pathname.startsWith(`${root}/`),
  );

  if (isGhostHuntRoute) {
    const redirectedUrl = request.nextUrl.clone();
    redirectedUrl.pathname = `/ghosthunt${pathname}`;
    return NextResponse.redirect(redirectedUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
