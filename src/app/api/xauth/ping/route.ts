export async function POST(req: Request) {
  const t = await req.text();
  return Response.json({ ok: true, n: t.length });
}
export async function GET() { return Response.json({ ok: true }); }
