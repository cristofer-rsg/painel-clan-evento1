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

const ingloriousOrigin = "https://inglorious.ghosthunt.com.br";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/Inglorious" || pathname.startsWith("/Inglorious/")) {
    const destination = new URL(`${pathname}${search}`, ingloriousOrigin);
    return NextResponse.rewrite(destination);
  }

  // Keep the exact /ghosthunt entry URL on its own App Router page.
  // Only nested paths are rewritten to the existing Ghost Hunt routes.
  if (pathname.startsWith("/ghosthunt/")) {
    const rewrittenUrl = request.nextUrl.clone();
    const nestedPath = pathname.replace(/^\\/ghosthunt\\/?/, "");
    rewrittenUrl.pathname = nestedPath ? `/${nestedPath}` : "/home";
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
