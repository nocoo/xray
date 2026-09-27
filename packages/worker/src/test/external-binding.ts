export function externalBinding(fetch: Fetcher["fetch"]): Fetcher {
	return {
		fetch,
		connect() {
			throw new Error("Unexpected socket connection in L1");
		},
	};
}

export const successfulExternal = externalBinding(async (input, init) => {
	const request = new Request(input, init);
	if (new URL(request.url).pathname.endsWith("/chat/completions")) {
		return Response.json({ choices: [{ message: { content: "译" } }] });
	}
	if (new URL(request.url).pathname === "/api/authors/profile") return Response.json({});
	if (request.url === "https://localhost/api/webhook/x")
		return Response.json({ shortUrl: "https://zhe.to/x", slug: "x", originalUrl: "u" });
	throw new Error("Unexpected external request in L1");
});
