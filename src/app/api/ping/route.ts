export async function POST(req: Request) {
  const t = await req.text();
  return Response.json({ ok: true, n: t.length, where: "api/ping" });
}
