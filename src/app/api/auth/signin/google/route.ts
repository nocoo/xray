export async function POST(req: Request) {
  const t0 = Date.now();
  const text = await req.text();
  return Response.json({
    ok: true,
    bytes: text.length,
    ms: Date.now() - t0,
    preview: text.slice(0, 80),
  });
}

export async function GET() {
  return Response.json({ ok: true, method: "GET" });
}
