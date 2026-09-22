import type { LinkPreview } from "@xray/shared";
import { describe, expect, test } from "vitest";
import { dataOf, ingestHeaders, jsonFetch, rawHttp } from "./helpers.js";

describe("article link preview HTTP boundaries", () => {
 test("browser tenant ownership and stored Markdown membership gate preview requests", async () => {
  const channelResponse = await jsonFetch("/api/channels", { method: "POST", body: JSON.stringify({ name: `Preview ${crypto.randomUUID()}` }) });
  expect(channelResponse.status).toBe(201);
  const channel = dataOf<{ id: number }>(channelResponse.body);
  const keyResponse = await jsonFetch(`/api/channels/${channel.id}/keys`, { method: "POST", body: JSON.stringify({ label: "Preview producer" }) });
  expect(keyResponse.status).toBe(201);
  const key = dataOf<{ token: string }>(keyResponse.body);
  const submitted = await rawHttp("/api/v1/ingest/articles", {
   method: "POST", headers: ingestHeaders(key.token), body: JSON.stringify({
    external_id: "preview-report", title: "Linked report", report_date: "2026-09-22",
    markdown: "[HTTP](http://example.com/story#section)\n\n[Private](https://127.0.0.1/private)\n\n![Image](https://example.com/image.png)\n\n`https://example.com/code`",
   }),
  });
  expect(submitted.status).toBe(201);
  const { id } = dataOf<{ id: number }>(JSON.parse(submitted.text));
  const path = `/api/channels/${channel.id}/articles/${id}/link-preview`;
  const response = await jsonFetch(`/api/channels/${channel.id}/articles/${id}/link-preview?url=${encodeURIComponent("http://example.com/story#different")}`);
  expect(response.status).toBe(200);
  expect(dataOf<LinkPreview>(response.body)).toEqual({ url: "http://example.com/story", title: null, description: null, imageUrl: null, siteName: null });
  expect(response.res.headers.get("cache-control")).toBe("private, no-store");
  const local = await jsonFetch(`${path}?url=${encodeURIComponent("https://127.0.0.1/private")}`);
  expect(local.status).toBe(200);
  expect(dataOf<LinkPreview>(local.body).title).toBeNull();
  for (const url of ["", "bad", "https://example.com/unlisted", "https://example.com/image.png", "https://example.com/code", "javascript:alert(1)", "https://user:password@example.com/story", "x".repeat(4097)]) {
   expect((await jsonFetch(`${path}?url=${encodeURIComponent(url)}`)).status).toBe(400);
  }
  expect((await jsonFetch(`${path}?url=${encodeURIComponent("http://example.com/story")}`, { headers: { "x-test-actor": "b" } })).status).toBe(404);
  expect((await rawHttp(`${path}?url=${encodeURIComponent("http://example.com/story")}`, { headers: ingestHeaders(key.token) })).status).toBe(404);
  expect((await jsonFetch(`/api/channels/${channel.id}/articles/99999999/link-preview?url=https://example.com`)).status).toBe(404);
  expect((await jsonFetch("/api/channels/99999999/articles/1/link-preview?url=https://example.com")).status).toBe(404);
  const edited = await jsonFetch(`/api/channels/${channel.id}/articles/${id}`, { method: "PATCH", body: JSON.stringify({ title: "Removed link", report_date: "2026-09-22", markdown: "No links remain." }) });
  expect(edited.status).toBe(200);
  expect((await jsonFetch(`${path}?url=${encodeURIComponent("http://example.com/story")}`)).status).toBe(400);
 });
});
