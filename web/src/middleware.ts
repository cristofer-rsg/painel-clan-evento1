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

const ingloriousProductionOrigin = "https://inglorious-cristoferrsg-9877.vercel.app";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/Inglorious" || pathname.startsWith("/Inglorious/")) {
    const destination = new URL(`${pathname}${search}`, ingloriousProductionOrigin);
    return NextResponse.rewrite(destination);
  }

  if (pathname === "/ghosthunt") return NextResponse.next();

  if (pathname.startsWith("/ghosthunt/")) {
    const rewrittenUrl = request.nextUrl.clone();
    rewrittenUrl.pathname = pathname.replace(/^\/ghosthunt(?=\/|$)/, "");
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
