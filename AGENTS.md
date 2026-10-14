# Notes for coding agents (and humans)

This is **IDA**, an accessible AI citizen-service platform for Austrian authorities, built on the
Challenge 3 hackathon starter. See README.md and docs/TECHNICAL.md for the overview, docs/SETUP.md for setup.

## Project map

- `src/index.ts`: Hono app. `/api/*` citizen API, `/api/gov/*` mock backend, `/api/evals/chat`, `/agents/*` (only the logged-in citizen's agent).
- `src/routes/app-api.ts`: simulated ID Austria login, Live tokens, server tools for voice, translation, memory, form submission.
- `src/auth/session.ts`: signed session cookie; agent instance name = `<personaId>--<sessionId>`.
- `src/config.ts`: model ids (vars in `wrangler.jsonc`), Gemini fallback chain + circuit breaker, decision model selection.
- `src/agent/citizen-assistant.ts`: `AIChatAgent` Durable Object. State = `AssistantSettings` (language, text size, contrast, easy language, voice).
- `src/agent/tools.ts`: ONE tool registry for text chat and Gemini Live (server tools + browser "client" tools).
- `src/agent/system-prompt.ts`: shared system prompt (chat + voice) incl. profile, memory and form state.
- `src/live/setup.ts`: Gemini Live session setup locked into ephemeral tokens.
- `src/memory/`: long-term memory (D1) + decision model.
- `src/translate/`: form/UI translation layer (Gemini JSON output, KV cache).
- `src/shared/forms/`: HTML replicas of official forms (text ids for the overlay, prefill, mapping to services).
- `src/gov/`: mock backend (template). `src/knowledge/`: service facts with source URLs.
- `frontend/`: React. `screens/Portal.tsx` (chat, voice, split view), `components/FormPanel.tsx` (form + overlay),
  `lib/form-store.ts` (form state + client tool executor), `lib/gemini-live.ts` + `lib/audio.ts` (Live client).
- UI texts: `src/shared/ui-strings.ts` (German + English by hand, other languages translated on demand).
- `evals/`: scenarios (`scenarios.json`) + runner (`run.ts`).

## Rules for new code

- **New tools:** add them to `TOOL_SPECS` in `src/agent/tools.ts` (and the name to `src/shared/tool-names.ts`). Server tools call `src/gov/service.ts` directly; browser tools are executed in `frontend/lib/form-store.ts`.
- **`citizenId` always comes from the session** (`settings.personaId`), never from a tool's input schema. Otherwise the model can be talked into reading other citizens' data.
- **Write tools** (anything that changes data) get `write: true` in `TOOL_SPECS`, so `pnpm evals` never executes them. Binding actions (submit, book) must stay client tools with a confirmation dialog.
- **Never commit secrets.** Keys live in `.dev.vars` (gitignored) and `wrangler secret put`.
- **Never invent legal facts** (fees, deadlines, documents). Facts live in `src/knowledge/` with a source URL. Mark unverified facts as such.
- **All data is fictional.** Don't add real personal data.
- Keep code simple and commented: teams have mixed skill levels.
- Mark extension points with `// 👉 EXTEND HERE`.

## Don't break the setup

These caused real bugs while building the template:

- **Don't upgrade dependencies** (`pnpm update`, `@latest`, changing versions in `package.json`) unless the team asks. All versions are pinned on purpose.
- **`workers-ai-provider@4.0.0` is patched** (`patches/`, registered in `pnpm-workspace.yaml`). Without the patch, Workers AI streams every chunk twice: doubled text in the chat and broken tool calls. If you upgrade it, check whether the bug is fixed upstream and then remove the patch, otherwise `pnpm install` fails.
- **Models are vars in `wrangler.jsonc`** (Gemini for chat/voice/dictation/translation; Workers AI `@cf/zai-org/glm-4.7-flash` as fallback and memory model). `@cf/meta/llama-4-scout-17b-16e-instruct` often writes tool calls as plain text – avoid it.
- **Without a Cloudflare login** (CI, containers): `CF_REMOTE_BINDINGS=false pnpm dev`; tests always run without remote bindings.
- **After changing bindings in `wrangler.jsonc`, run `pnpm cf-typegen`** and commit `worker-configuration.d.ts`. Otherwise you get errors like `Property 'GOV_DB' does not exist on type 'Env'`.
- **`@ai-sdk/react` must stay installed.** It's an optional peer of `agents` / `@cloudflare/ai-chat`, and the frontend crashes without it.
- **If the browser shows stale code after dependency changes**, delete `node_modules/.vite` and restart `pnpm dev`.

## How to check your work

1. `npx tsc --noEmit` (Worker) and `npx tsc --noEmit -p frontend/tsconfig.json` (frontend)
2. `pnpm test` (backend unit tests, no AI)
3. `pnpm evals` (needs `pnpm dev` running): after every change to the prompt, the tools or the model.
   Model answers vary, so run them more than once before trusting a result.
4. For every new feature or bug fix in the assistant's behaviour, add a scenario to `evals/scenarios.json`.
5. The evals use the non-streaming path. Streaming bugs only show up in the browser chat, so test it there too.

| Command | Purpose |
|---|---|
| `pnpm dev` | Local development (Vite + Worker), http://localhost:5173 |
| `pnpm run deploy` | Build and deploy |
| `pnpm cf-typegen` | Generate `Env` types |
| `pnpm test` | Backend unit tests |
| `pnpm evals` | AI scenario tests (`pnpm evals <id>` for single scenarios) |

## Cloudflare docs

Your knowledge of Cloudflare APIs may be outdated. Retrieve current docs before changing Workers, D1,
Workers AI, AI Gateway or Agents SDK code:

- If available, use the Cloudflare MCP servers or Cloudflare skills (see "Working with a coding agent" in README.md).
- Agents SDK: https://developers.cloudflare.com/agents/llms.txt
- Workers: https://developers.cloudflare.com/workers/
- Workers AI models: https://developers.cloudflare.com/workers-ai/models/
