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

const ingloriousPreviewOrigin = "https://inglorious-git-inglorious-basepath-preview-cristoferrsg-9877.vercel.app";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === "/Inglorious" || pathname.startsWith("/Inglorious/")) {
    const bypassSecret = process.env.INGLORIOUS_PREVIEW_BYPASS;
    if (!bypassSecret) {
      return new NextResponse("A integração de preview não está configurada.", { status: 503 });
    }

    const headers = new Headers(request.headers);
    headers.set("x-vercel-protection-bypass", bypassSecret);
    headers.set("x-vercel-set-bypass-cookie", "true");
    const destination = new URL(`${pathname}${search}`, ingloriousPreviewOrigin);
    return NextResponse.rewrite(destination, { request: { headers } });
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
