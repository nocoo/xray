import { NextResponse } from "next/server";

/** Nested path hangs on POST body under vinext — use GET /api/xauth/google. */
export async function GET() {
  return NextResponse.redirect(new URL("/api/xauth/google", process.env.NEXTAUTH_URL ?? "https://xray.hexly.ai"));
}

export async function POST() {
  return NextResponse.json(
    { error: "Use GET /api/xauth/google" },
    { status: 405 },
  );
}
