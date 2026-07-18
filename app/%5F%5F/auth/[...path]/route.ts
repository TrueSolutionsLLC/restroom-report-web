import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const FIREBASE_AUTH_ORIGIN = "https://cleanstop-fa6ee.firebaseapp.com";

async function proxyFirebaseAuth(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const upstreamUrl = new URL(`/__/auth/${path.map(encodeURIComponent).join("/")}`, FIREBASE_AUTH_ORIGIN);
  upstreamUrl.search = request.nextUrl.search;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete("host");
  requestHeaders.delete("content-length");

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const upstream = await fetch(upstreamUrl, {
    method: request.method,
    headers: requestHeaders,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.set("cache-control", "no-store");

  const location = responseHeaders.get("location");
  if (location) {
    responseHeaders.set("location", location.replace(FIREBASE_AUTH_ORIGIN, request.nextUrl.origin));
  }

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const GET = proxyFirebaseAuth;
export const POST = proxyFirebaseAuth;
export const HEAD = proxyFirebaseAuth;
