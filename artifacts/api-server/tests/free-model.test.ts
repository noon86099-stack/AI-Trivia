import test from "node:test";
import assert from "node:assert/strict";
import { freeModelRouting } from "../src/lib/free-model.ts";

test("defaults only to OpenRouter's free-model router", () => {
  assert.equal(freeModelRouting().model, "openrouter/free");
  assert.equal(freeModelRouting("  ").model, "openrouter/free");
});
test("allows explicit free variants with no paid model fallbacks", () => {
  const routing = freeModelRouting(" vendor/example:free ");
  assert.equal(routing.model, "vendor/example:free");
  assert.deepEqual(routing.provider.max_price, { prompt: 0, completion: 0 });
  assert.equal("models" in routing, false);
});
test("rejects paid models, auto routers and appended paid fallbacks", () => {
  for (const model of ["openai/gpt-4o-mini", "openrouter/auto", "vendor/example", "vendor/example:free,openai/gpt-4o-mini", "vendor/example:free/paid"]) {
    assert.throws(() => freeModelRouting(model), RangeError);
  }
});
