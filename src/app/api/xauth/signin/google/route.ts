import { NextResponse } from "next/server";

/** vinext hangs reading POST bodies on this nested path — use /api/xauth/google. */
export async function POST() {
  return NextResponse.json(
    {
      error: "Use POST /api/xauth/google",
      url: "/api/xauth/google",
    },
    { status: 308 },
  );
}

export async function GET() {
  return NextResponse.json({ ok: true, use: "/api/xauth/google" });
}
