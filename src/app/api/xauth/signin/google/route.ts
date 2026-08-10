// Temporary diagnostic: no Auth import — isolate vinext body-read hang.
export async function POST(req: Request) {
  const t0 = Date.now();
  try {
    const text = await req.text();
    return Response.json({
      ok: true,
      bytes: text.length,
      ms: Date.now() - t0,
      preview: text.slice(0, 100),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        ms: Date.now() - t0,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  return Response.json({ ok: true, method: "GET" });
}
