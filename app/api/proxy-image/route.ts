// app/api/proxy-image/route.ts
// Server-side proxy to fetch external images that block CORS.
// Usage: GET /api/proxy-image?url=https://...
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" }, // some servers reject headless requests
    });
    if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: 502 });

    const buffer = await res.arrayBuffer();
    const contentType = res.headers.get("content-type") ?? "image/png";

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400", // cache 24h
      },
    });
  } catch (e) {
    return NextResponse.json({ error: "Failed to fetch image" }, { status: 500 });
  }
}