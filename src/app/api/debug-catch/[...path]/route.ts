export async function POST(req: Request) {
  const t0 = Date.now();
  const buf = await req.arrayBuffer();
  return Response.json({
    ok: true,
    url: req.url,
    bytes: buf.byteLength,
    ms: Date.now() - t0,
  });
}
export async function GET(req: Request) {
  return Response.json({ ok: true, url: req.url, method: "GET" });
}
