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

function mapRedirectLocation(location: string, requestUrl: URL): string {
  const target = new URL(location, UPSTREAM_ORIGIN);
  const upstreamHost = new URL(UPSTREAM_ORIGIN).host;

  if (target.host === upstreamHost && target.pathname.toLowerCase().startsWith(UPSTREAM_BASE_PATH.toLowerCase())) {
    const publicPath = target.pathname.slice(UPSTREAM_BASE_PATH.length) || "/";
    target.pathname = `/inglorious${publicPath === "/" ? "/" : publicPath}`;
    target.host = requestUrl.host;
    target.protocol = requestUrl.protocol;
  } else if (target.origin === requestUrl.origin && target.pathname.toLowerCase().startsWith("/inglorious")) {
    target.pathname = `/inglorious${target.pathname.slice("/inglorious".length)}`;
  }

  return target.toString();
}

async function proxy(request: Request, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  const incomingUrl = new URL(request.url);
  const suffix = path.length > 0 ? `/${path.map(encodeURIComponent).join("/")}` : "/";
  const upstreamUrl = new URL(`${UPSTREAM_BASE_PATH}${suffix}${incomingUrl.search}`, UPSTREAM_ORIGIN);

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP_HEADERS) headers.delete(header);
  headers.set("x-forwarded-host", incomingUrl.host);
  headers.set("x-forwarded-proto", incomingUrl.protocol.replace(":", ""));
  headers.delete("x-inglorious-proxy");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
    cache: "no-store",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = new Headers(upstream.headers);

  for (const header of HOP_BY_HOP_HEADERS) responseHeaders.delete(header);

  const location = upstream.headers.get("location");
  if (location) responseHeaders.set("location", mapRedirectLocation(location, incomingUrl));

  responseHeaders.set("cache-control", "no-store");

  return new Response(upstream.body, {
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
