import { afterEach, describe, expect, test, vi } from "vitest";
import app from "../index.js";
import { externalBinding } from "../test/external-binding.js";
import { identityHeaders, localIdentityBindings } from "../test/signed-identity.js";
import { createSqliteD1 } from "../test/sqlite-d1.js";
import { chatCompletion, translateAndSummarize } from "./ai-client.js";
import { externalFetch } from "./external.js";

afterEach(() => vi.unstubAllGlobals());

describe("external response boundary", () => {
	test("preserves request data and binding receiver and never retries failed bindings on public fetch", async () => {
		const publicFetch = vi.fn(async () => Response.json({}));
		vi.stubGlobal("fetch", publicFetch);
		const controller = new AbortController();
		const init = {
			method: "POST",
			headers: { authorization: "Bearer fixture" },
			body: "payload",
			redirect: "manual",
			signal: controller.signal,
		} as const;
		const binding = externalBinding(async function (input, received) {
			expect(this).toBe(binding);
			expect(input).toBe("https://provider.example.com/path");
			expect(received).toBe(init);
			return new Response("upstream", { status: 429 });
		});
		const response = await externalFetch(
			{ XRAY_EXTERNAL: binding },
			"https://provider.example.com/path",
			init,
		);
		expect(response.status).toBe(429);
		expect(await response.text()).toBe("upstream");
		await expect(
			externalFetch(
				{
					XRAY_EXTERNAL: externalBinding(async () => {
						throw new Error("denied");
					}),
				},
				"https://unknown.example.com",
			),
		).rejects.toThrow("denied");
		expect(publicFetch).not.toHaveBeenCalled();
		await externalFetch({}, "https://provider.example.com/path", init);
		expect(publicFetch).toHaveBeenCalledWith("https://provider.example.com/path", init);
	});

	test("translation and summary construct provider requests and parse actual responses", async () => {
		vi.stubGlobal("fetch", () => {
			throw new Error("Unexpected public egress");
		});
		const requests: Request[] = [];
		const env = {
			XRAY_EXTERNAL: externalBinding(async (input, init) => {
				const request = new Request(input, init);
				requests.push(request.clone());
				return Response.json({
					choices: [
						{
							message: {
								content: requests.length === 1 ? "[翻译]\n正文\n[引用翻译]\n引用" : "Summary",
							},
						},
					],
				});
			}),
		};
		const signal = new AbortController().signal;
		const result = await translateAndSummarize(
			{
				text: "Post",
				quotedText: "Reference",
				apiKey: "fixture-key",
				model: "fixture-model",
				summaryPrompt: "Summarize",
				signal,
			},
			env,
		);
		expect(result).toEqual({
			translatedText: "正文",
			quotedTranslatedText: "引用",
			summaryText: "Summary",
		});
		expect(requests).toHaveLength(2);
		for (const request of requests) {
			expect(request.url).toBe("https://api.openai.com/v1/chat/completions");
			expect(request.method).toBe("POST");
			expect(request.headers.get("authorization")).toBe("Bearer fixture-key");
			expect(await request.json()).toMatchObject({
				model: "fixture-model",
				messages: [
					{ role: "system" },
					{ role: "user", content: "POST:\nPost\n\nREFERENCED:\nReference" },
				],
			});
		}
		await expect(
			chatCompletion(
				{ apiKey: "fixture", messages: [] },
				{
					XRAY_EXTERNAL: externalBinding(
						async () => new Response("model unavailable", { status: 503 }),
					),
				},
			),
		).rejects.toThrow("upstream 503: model unavailable");
	});

	test("AI test uses signed identity and reports external status and malformed responses", async () => {
		vi.stubGlobal("fetch", () => {
			throw new Error("Unexpected public egress");
		});
		for (const [response, expected] of [
			[Response.json({ choices: [{ message: { content: "ok" } }] }), { ok: true, status: 200 }],
			[
				new Response("rate limited", { status: 429 }),
				{ ok: false, status: 429, error: "rate limited" },
			],
			[new Response("not JSON"), { ok: false, error: "upstream response is not JSON" }],
		] as const) {
			const env = {
				DB: createSqliteD1(),
				ENVIRONMENT: "test",
				...localIdentityBindings,
				XRAY_EXTERNAL: externalBinding(async (input, init) => {
					const request = new Request(input, init);
					expect(request.headers.get("authorization")).toBe("Bearer draft-key");
					expect(await request.json()).toMatchObject({ model: "draft-model", max_tokens: 8 });
					expect(init?.signal).toBeInstanceOf(AbortSignal);
					return response;
				}),
			};
			const result = await app.request(
				"/api/ai-config/test",
				{
					method: "POST",
					headers: {
						host: "localhost",
						origin: "http://localhost",
						...identityHeaders(),
						"content-type": "application/json",
					},
					body: JSON.stringify({ provider: "openai", apiKey: "draft-key", model: "draft-model" }),
				},
				env,
			);
			expect(result.status).toBe(200);
			expect(await result.json()).toMatchObject({ data: expected });
		}
	});

	test("signed dashboard request uses presentation time without changing the authentication clock", async () => {
		const env = {
			DB: createSqliteD1(),
			ENVIRONMENT: "test",
			...localIdentityBindings,
			XRAY_PRESENTATION_TIME: "2000-01-14T12:00:00.000Z",
		};
		const result = await app.request(
			"/api/dashboard",
			{ headers: { host: "localhost", ...identityHeaders() } },
			env,
		);
		expect(result.status).toBe(200);
		const { data } = (await result.json()) as { data: { contentTrend: { date: string }[] } };
		expect(data.contentTrend).toHaveLength(14);
		expect(data.contentTrend[0]?.date).toBe("2000-01-01");
		expect(data.contentTrend[13]?.date).toBe("2000-01-14");
	});
});
