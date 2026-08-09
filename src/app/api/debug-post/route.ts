export async function POST(req: Request) {
  const t0 = Date.now();
  const buf = await req.arrayBuffer();
  return Response.json({
    ok: true,
    bytes: buf.byteLength,
    ms: Date.now() - t0,
    text: new TextDecoder().decode(buf).slice(0, 100),
  });
}
