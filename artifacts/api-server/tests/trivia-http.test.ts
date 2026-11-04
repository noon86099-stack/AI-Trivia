import test from "node:test";
import assert from "node:assert/strict";
import { fetchJson, TriviaError } from "../src/lib/trivia-http.ts";

const mock = (status: number, body = '{"ok":true}', headers: Record<string, string> = {}) =>
  (async () => new Response(body, { status, headers })) as typeof fetch;

test("valid service JSON passes through", async () => {
  assert.deepEqual(await fetchJson("https://example.test", {}, 100, "trivia", mock(200)), { ok: true });
});

for (const service of ["trivia", "ai"] as const) {
  test(`${service}: network failures are friendly and do not leak details`, async () => {
    const broken = (async () => { throw new Error("sensitive upstream detail"); }) as typeof fetch;
    await assert.rejects(fetchJson("https://example.test", {}, 100, service, broken), (error: unknown) => {
      assert.ok(error instanceof TriviaError);
      assert.equal(error.code, "NETWORK_ERROR");
      assert.doesNotMatch(error.message, /sensitive/);
      return true;
    });
  });
  test(`${service}: malformed JSON`, async () => {
    await assert.rejects(fetchJson("https://example.test", {}, 100, service, mock(200, "not json")), { code: "INVALID_RESPONSE", status: 502 });
  });
  test(`${service}: rate limits retain a retry delay`, async () => {
    await assert.rejects(fetchJson("https://example.test", {}, 100, service, mock(429, "", { "retry-after": "22" })), { code: "RATE_LIMITED", status: 429, retryAfter: 22 });
  });
  test(`${service}: server errors do not expose raw provider responses`, async () => {
    await assert.rejects(fetchJson("https://example.test", {}, 100, service, mock(500, "sensitive error")), { code: "UPSTREAM_ERROR", status: 502 });
  });
}
for (const status of [401, 403]) {
  test(`OpenRouter ${status} maps to friendly authentication failure`, async () => {
    await assert.rejects(fetchJson("https://example.test", {}, 100, "ai", mock(status)), { code: "AI_AUTH_ERROR", status: 503 });
  });
}
test("OpenRouter credits failure", async () => {
  await assert.rejects(fetchJson("https://example.test", {}, 100, "ai", mock(402)), { code: "AI_CREDITS_REQUIRED" });
});
test("unsupported model failure", async () => {
  await assert.rejects(fetchJson("https://example.test", {}, 100, "ai", mock(404)), { code: "AI_MODEL_ERROR" });
});
