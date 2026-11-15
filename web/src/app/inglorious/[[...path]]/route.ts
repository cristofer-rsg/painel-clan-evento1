const UPSTREAM_ORIGIN = "https://inglorious.ghosthunt.com.br";
const UPSTREAM_BASE_PATH = "/Inglorious";

type RouteContext = {
  params: Promise<{ path?: string[] }>;
};

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "content-encoding",
  "host",
]);

function mapUpstreamPath(pathname: string): string | null {
  if (!pathname.toLowerCase().startsWith(UPSTREAM_BASE_PATH.toLowerCase())) return null;
  const suffix = pathname.slice(UPSTREAM_BASE_PATH.length);
  return suffix ? `/inglorious${suffix}` : "/inglorious";
}

function mapRedirectLocation(location: string, requestUrl: URL): string {
  const target = new URL(location, UPSTREAM_ORIGIN);
  const upstreamHost = new URL(UPSTREAM_ORIGIN).host;

  if (target.host === upstreamHost) {
    const publicPath = mapUpstreamPath(target.pathname);
    if (publicPath) {
      target.pathname = publicPath;
      target.host = requestUrl.host;
      target.protocol = requestUrl.protocol;
    }
  } else if (target.origin === requestUrl.origin) {
    const publicPath = mapUpstreamPath(target.pathname);
    if (publicPath) target.pathname = publicPath;
  }

  return target.toString();
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const incomingUrl = new URL(request.url);
  const suffix = path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "";
  const upstreamUrl = new URL(`${UPSTREAM_BASE_PATH}${suffix}${incomingUrl.search}`, UPSTREAM_ORIGIN);
  const isImmutableAsset = request.method === "GET" && path[0] === "_next" && path[1] === "static";
  const isPublicPage =
    request.method === "GET" &&
    (path.length === 0 || ["ranking", "performance", "rules", "clan-time"].includes(path[0])) &&
    !request.headers.has("cookie") &&
    !request.headers.has("authorization");

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
  headers.delete("x-inglorious-proxy");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: isImmutableAsset ? "force-cache" : "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = new Headers(upstream.headers);
  for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);

  const location = upstream.headers.get("location");
  if (location) {
    responseHeaders.set("location", mapRedirectLocation(location, incomingUrl));
    responseHeaders.delete("refresh");
  }

  const canCachePublicPage =
    isPublicPage &&
    upstream.status === 200 &&
    !upstream.headers.has("set-cookie");

  responseHeaders.set(
    "cache-control",
    isImmutableAsset
      ? "public, max-age=31536000, s-maxage=31536000, immutable"
      : canCachePublicPage
        ? "public, max-age=0, s-maxage=10, stale-while-revalidate=20"
        : "private, no-store, max-age=0",
  );

  // Hashed Next.js assets are immutable and do not contain the upstream base path.
  // Stream them directly to avoid buffering and rewriting every CSS/JS request.
  if (isImmutableAsset || request.method === "HEAD") {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  const contentType = responseHeaders.get("content-type") ?? "";
  const shouldRewriteBody =
    contentType.startsWith("text/") ||
    contentType.includes("javascript") ||
    contentType.includes("json");

  if (!shouldRewriteBody) {
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders,
    });
  }

  const body = await upstream.text();
  const rewrittenBody = body.replaceAll(UPSTREAM_BASE_PATH, "/inglorious");
  return new Response(rewrittenBody, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
