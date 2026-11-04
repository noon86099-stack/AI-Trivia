# AI Trivia

A mobile-friendly trivia game using real Open Trivia DB questions and secure server-side OpenRouter explanations.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- AI secret: `OPENROUTER_API_KEY`; optional `OPENROUTER_MODEL` defaults to `openrouter/free` and permits only explicit `:free` alternatives.
- Frontend workflow: `artifacts/ai-trivia: web`.
- Service tests: `pnpm --filter @workspace/api-server test`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/ai-trivia/src/pages/home.tsx`: game UI, local device score.
- `artifacts/api-server/src/routes/trivia.ts`: API boundary and safe errors.
- `artifacts/api-server/src/lib/trivia.ts`: external services and question lookup.
- `lib/db/src/schema/trivia-questions.ts`: expiring question and explanation storage.
- `lib/api-spec/openapi.yaml`: contract; regenerate clients after editing.
- `README.md`: setup, verification status, publishing.

## Architecture decisions

- Never send a correct answer to the frontend before checking: the backend owns answer validation and AI context.
- Store active questions in the database so restarts and multiple API instances do not interrupt a quiz.
- Scores are device-local rather than a trusted leaderboard; there is no account requirement.

## Product

Shuffled multiple-choice questions, answer feedback, score/accuracy/streak, AI explanation cards, independent loading and retry states, accessible mobile-first controls.

## User preferences

Use only free OpenRouter models, with no paid-model fallback. Use a user-provided secret, configurable free model, and friendly 2–4 sentence English explanations. Build a real app, not a mockup. Do not claim an integration works until tested.

## Gotchas

Open Trivia DB has a roughly five-second request interval. Keep retries explicit; do not refetch a game question automatically on focus/reconnect. Check production secrets when publishing. Local abuse limits are per process. Free-model restrictions must remain enforced server-side.

Allow enough model output tokens for hidden reasoning as well as the visible explanation. The free router can select reasoning models; a tiny token allowance can yield an empty explanation even with HTTP 200.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
