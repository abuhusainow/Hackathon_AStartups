/**
 * Worker entry point – a Hono app (https://hono.dev).
 *
 *   /api/*                Citizen API: simulated ID Austria login, Live tokens, translation, memory, forms
 *   /api/gov/*            Mock e-government REST API (src/gov/routes.ts) – stands in for real registers
 *   /api/evals/chat       Non-streaming assistant endpoint for automated tests (evals/run.ts)
 *   /agents/*             WebSocket of the chat agent (Agents SDK) – only for the logged-in citizen
 *   everything else       React frontend (static assets, built by Vite)
 */
import { routeAgentRequest } from "agents";
import { Hono } from "hono";
import { z } from "zod";
import { runAssistant } from "./agent/run-assistant";
import { personaFromAgentName, sessionFromRequest } from "./auth/session";
import { decisionProvider, hasGemini, modelIds } from "./config";
import { GovError } from "./gov/errors";
import { govRoutes } from "./gov/routes";
import { appApi } from "./routes/app-api";

// The Durable Object class must be exported from the entry point.
export { CitizenAssistant } from "./agent/citizen-assistant";

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) =>
	c.json({ status: "ok", gemini: hasGemini(c.env), models: modelIds(c.env), decisionModel: decisionProvider(c.env) }),
);

app.route("/api/gov", govRoutes);

// Used by `pnpm evals`. Write tools and browser tools never execute here.
app.post("/api/evals/chat", async (c) => {
	const input = z
		.object({
			messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() })).min(1),
			settings: z
				.object({
					personaId: z.string().optional(),
					language: z.string().optional(),
					easyLanguage: z.boolean().optional(),
				})
				.optional(),
		})
		.safeParse(await c.req.json().catch(() => ({})));
	if (!input.success) throw new GovError(400, `Invalid body: ${input.error.message}`);
	const { personaId, ...settings } = input.data.settings ?? {};
	return c.json(await runAssistant(c.env, input.data.messages, { personaId, settings }));
});

app.route("/api", appApi);

// Chat agent (WebSocket). The instance name must belong to the logged-in citizen: "<personaId>--<sessionId>".
app.all("/agents/*", async (c) => {
	const session = await sessionFromRequest(c.env, c.req.raw);
	if (!session) return c.json({ error: "Not logged in" }, 401);
	const name = decodeURIComponent(new URL(c.req.url).pathname.split("/")[3] ?? "");
	if (personaFromAgentName(name) !== session.pid) return c.json({ error: "This conversation belongs to another citizen" }, 403);
	return (await routeAgentRequest(c.req.raw, c.env)) ?? c.text("Agent not found", 404);
});

app.notFound((c) => c.json({ error: "Not found" }, 404));

// Expected errors (bad input, unknown ids, simulated outages) become clean JSON responses.
app.onError((err, c) => {
	if (err instanceof GovError) return c.json({ error: err.message }, err.status);
	console.error("[unhandled error]", err);
	return c.json({ error: "Internal error", detail: err instanceof Error ? err.message : String(err) }, 500);
});

export default app;
