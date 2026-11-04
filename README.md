# AI Trivia

A responsive trivia game built with React, Vite, TypeScript, and an Express backend. Real questions come from Open Trivia DB; OpenRouter provides short, friendly explanations after each checked answer.

## Secure setup

1. Create an API key in your OpenRouter account. Copy the **key value**, not a URL or model name.
2. In this Replit project, open **Tools → Secrets** and add `OPENROUTER_API_KEY`. Never put its value in chat, source files, or a `VITE_` variable.
3. The default model is `openrouter/free`, OpenRouter's free-model router. Optionally set `OPENROUTER_MODEL` to a supported model ID ending in `:free`. Paid models and automatic paid routers are rejected by the backend. Requests also set maximum input/output token prices to zero; there is no paid-model fallback. A valid OpenRouter API key is still required, and free models have usage limits and variable availability.
4. Restart the API workflow after changing environment settings. You do not need a key for Open Trivia DB.

The key stays on the server. The browser sends only opaque question and option IDs. The server looks up the true question and answer before contacting OpenRouter.

## Running

Use the managed Replit workflows:

- `artifacts/api-server: API Server` — Express API
- `artifacts/ai-trivia: web` — quiz UI

Package commands:

```sh
pnpm install
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
pnpm --filter @workspace/api-server test
```

The workflows provide routing, `PORT`, and `BASE_PATH`. Avoid starting a second dev server manually.

## Gameplay and data

- Four shuffled, HTML-entity-decoded answers per question.
- Correct-answer checking happens server-side.
- Questions and cached explanations are stored in PostgreSQL and expire after two hours. They survive API restarts and are available across instances.
- Score, accuracy, and streak are kept on the current device. Reset score clears only this device's statistics. They are not a competitive leaderboard.
- Question, answer-checking, and explanation loading/error states are separate. Explanation failures do not stop the user from continuing.
- Open Trivia DB requires spacing between requests. Retry controls respect the server's `retryAfter` delay.
- The API bounds input size, applies local abuse limits, deduplicates in-flight explanations, caches successful explanations, and returns safe errors without provider payloads or keys.
- Abuse counters are per API process (6 AI requests/minute per network address and 120/hour per process). The app uses only free models; usage limits can still cause retries. For high traffic, add shared rate limiting.

## API

Contract: `lib/api-spec/openapi.yaml`. Regenerate clients after modifying it.

- `GET /api/trivia/question`
- `POST /api/trivia/answer` — `{ questionId, answerId }`
- `POST /api/trivia/explanation` — `{ questionId, answerId }`
- `GET /api/healthz`

## Verification

`pnpm --filter @workspace/api-server test` tests mocked network failures, invalid JSON, rate limits, upstream errors, authentication, credits, unavailable models, and enforcement of free-only model routing.

Live checks successfully fetched Open Trivia DB questions, checked correct and incorrect answers, and generated a friendly explanation through `openrouter/free`. Invalid input, malformed JSON, expired questions, and rate-limit responses were also checked. Free-model availability and usage limits can still cause temporary explanation failures.

Browser verification also confirmed correct/wrong feedback, one score increment per question, persistence on reload, reset in an isolated browser, explanation retry without score changes, question retry countdowns, disabled Next during explanation loading, the help dialog, visible keyboard focus, and no horizontal overflow at phone/tablet/desktop widths. Controlled browser-side responses were used to verify explanation failures, recovery, loading, and question rate limits; these checks do not validate a replacement API key. All 16 service tests, the full workspace typecheck, and the API build passed.

### Rotating the OpenRouter key

Create a replacement at `https://openrouter.ai/settings/keys`, then save the full key value in the secure `OPENROUTER_API_KEY` secret field. Never paste it into chat or commit it. Restart the API and test a fresh, uncached question/explanation using the free-only routing policy. Revoke the old key only after the replacement succeeds. Review deployment secrets separately if the app is published.

## Publishing and the public URL

1. Select **Publish** in Replit to open the Publishing pane.
2. Review production secrets there and ensure `OPENROUTER_API_KEY` is configured for the published app. Check `OPENROUTER_MODEL` too if you changed it.
3. Publish the full project, including the web frontend and API backend; the frontend alone cannot generate AI explanations.
4. Replit applies the development database schema through its publishing flow. Do not run production DDL from application startup.
5. When publishing succeeds, use the stable public URL shown in the Publishing pane. The development preview URL is not the published URL.

The artifact configurations already include frontend static build settings and the API production build/run commands. Publishing remains a user action; no public URL exists until publishing completes.
