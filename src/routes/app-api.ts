/**
 * Citizen-facing API (session-scoped). Every route except /auth/* and /personas requires the
 * simulated ID Austria session; the citizen id always comes from the verified cookie.
 *
 *   GET  /api/personas                 test identities for the login screen
 *   POST /api/auth/login               {personaId} → session cookie
 *   POST /api/auth/logout
 *   GET  /api/auth/me                  profile, memory, applied preferences, agent instance name
 *   POST /api/tools/:name              run a server tool for the Live voice channel
 *   POST /api/live/token               {mode, settings, formState} → ephemeral Gemini Live token
 *   POST /api/transcribe               {audio, mimeType} → text (dictation fallback)
 *   POST /api/translate                {kind:"form", formId, lang} | {kind:"ui", lang}
 *   GET/POST/DELETE /api/memory · PATCH/DELETE /api/memory/:id · POST /api/memory/ingest {transcript}
 *   GET/POST /api/conversations · PATCH/DELETE /api/conversations/:id   sidebar "Gespräche"
 *   GET /api/documents · GET /api/documents/:id                          "Meine Dokumente"
 *   POST /api/forms/:formId/draft      create / update the application draft ({values})
 *   POST /api/forms/:formId/submit     submit after the citizen confirmed ({values})
 *   GET  /api/appointments             the citizen's appointments ("Meine Termine")
 *   GET  /api/appointments/services    services that need an appointment
 *   GET  /api/appointments/slots       free slots (?serviceId=)
 *   POST /api/appointments/:slotId/book       after the citizen confirmed
 *   POST /api/appointments/:bookingId/cancel  after the citizen confirmed
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import { createLiveToken, LIVE_WS_URL, transcribeAudio } from "../ai/gemini";
import { buildSystemPrompt, loadCitizenContext } from "../agent/system-prompt";
import { executeServerTool, TOOL_SPECS } from "../agent/tools";
import { agentNameFor, clearSessionCookie, getSession, newSession, setSessionCookie, type Session } from "../auth/session";
import { decisionProvider, hasGemini, modelIds } from "../config";
import { GovError } from "../gov/errors";
import * as gov from "../gov/service";
import { preferencesFrom, runMemoryDecision } from "../memory/extract";
import { clearMemory, deleteMemoryItem, listMemory, updateMemoryItem, upsertMemory } from "../memory/store";
import { getAgentByName } from "agents";
import { createConversation, deleteConversation, isConversationId, listConversations, renameConversation, touchConversation } from "../conversations/store";
import { addDocument, getDocument, listDocuments, markCancelled } from "../documents/store";
import { buildLiveSetup } from "../live/setup";
import { getForm, missingRequired } from "../shared/forms";
import { isValidLanguageCode } from "../shared/languages";
import { DEFAULT_SETTINGS, govLang, type AssistantSettings, type FormState } from "../shared/types";
import { translateForm, translateUi } from "../translate";

type AppEnv = { Bindings: Env; Variables: { session: Session } };

export const appApi = new Hono<AppEnv>();

// ---------------------------------------------------------------------------------------------
// Login (simulated ID Austria)
// ---------------------------------------------------------------------------------------------

appApi.get("/personas", async (c) => c.json(await gov.listPersonas(c.env)));

appApi.post("/auth/login", async (c) => {
	const body = z.object({ personaId: z.string() }).safeParse(await c.req.json().catch(() => ({})));
	if (!body.success) throw new GovError(400, "personaId is required");
	const personas = await gov.listPersonas(c.env);
	if (!personas.some((p) => p.id === body.data.personaId)) throw new GovError(404, "Unknown persona");
	const session = newSession(body.data.personaId);
	await setSessionCookie(c, session);
	return c.json({ ok: true, agentName: agentNameFor(session) });
});

appApi.post("/auth/logout", (c) => {
	clearSessionCookie(c);
	return c.json({ ok: true });
});

// Everything below requires a session.
appApi.use("*", async (c, next) => {
	const session = await getSession(c);
	if (!session) return c.json({ error: "Not logged in" }, 401);
	c.set("session", session);
	await next();
});

appApi.get("/auth/me", async (c) => {
	const session = c.var.session;
	const context = await loadCitizenContext(c.env, session.pid);
	return c.json({
		agentName: agentNameFor(session),
		levelOfAssurance: session.loa,
		profile: context.profile,
		memory: context.memory,
		preferences: preferencesFrom(context.memory, context.profile.accessibility, context.profile.preferredLanguage),
		capabilities: { gemini: hasGemini(c.env), decisionModel: decisionProvider(c.env), models: modelIds(c.env) },
	});
});

// ---------------------------------------------------------------------------------------------
// Tools for the Live voice channel
// ---------------------------------------------------------------------------------------------

function settingsFrom(raw: unknown): AssistantSettings {
	const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === "object" ? raw : {}) } as AssistantSettings;
	if (!isValidLanguageCode(s.language)) s.language = DEFAULT_SETTINGS.language;
	return s;
}

appApi.post("/tools/:name", async (c) => {
	const name = c.req.param("name");
	if (TOOL_SPECS[name]?.side !== "server") throw new GovError(404, `Unknown server tool "${name}"`);
	const body = (await c.req.json().catch(() => ({}))) as { input?: unknown; settings?: unknown };
	const session = c.var.session;
	const result = await executeServerTool(name, body.input, {
		env: c.env,
		citizenId: session.pid,
		sessionId: `live-${session.sid}`,
		settings: settingsFrom(body.settings),
		mode: "live",
	});
	return c.json({ result });
});

// ---------------------------------------------------------------------------------------------
// Gemini Live: ephemeral tokens
// ---------------------------------------------------------------------------------------------

/** Max. tokens per session and minute (cheap protection against abuse of the paid API). */
const LIVE_TOKENS_PER_MINUTE = 6;

async function rateLimit(c: Context<AppEnv>, bucket: string, limit: number) {
	const key = `rl:${bucket}:${c.var.session.sid}:${Math.floor(Date.now() / 60_000)}`;
	const count = Number((await c.env.CACHE.get(key)) ?? 0);
	if (count >= limit) throw new GovError(429, "Too many requests, please wait a minute.");
	await c.env.CACHE.put(key, String(count + 1), { expirationTtl: 120 });
}

appApi.post("/live/token", async (c) => {
	if (!hasGemini(c.env)) throw new GovError(503, "Voice is not available: GEMINI_API_KEY is not configured.");
	const body = (await c.req.json().catch(() => ({}))) as { mode?: string; settings?: unknown; formState?: FormState | null; attempt?: number };
	const mode = body.mode === "dictation" ? "dictation" : "voice";
	await rateLimit(c, `live-${mode}`, LIVE_TOKENS_PER_MINUTE);
	const session = c.var.session;
	const context = mode === "voice" ? await loadCitizenContext(c.env, session.pid) : null;
	const setup = buildLiveSetup(c.env, {
		mode,
		settings: settingsFrom(body.settings),
		context: context!,
		formState: body.formState && getForm(body.formState.formId) ? body.formState : null,
		attempt: Number(body.attempt) || 0,
	});
	const { token, expireTime } = await createLiveToken(c.env, setup);
	return c.json({ token, expireTime, wsUrl: LIVE_WS_URL, model: setup.model, mode });
});

appApi.post("/transcribe", async (c) => {
	const body = z
		.object({ audio: z.string().max(8_000_000), mimeType: z.string().default("audio/webm"), language: z.string().optional() })
		.safeParse(await c.req.json().catch(() => ({})));
	if (!body.success) throw new GovError(400, "audio (base64) is required");
	await rateLimit(c, "transcribe", 20);
	const text = await transcribeAudio(c.env, modelIds(c.env).text, body.data.audio, body.data.mimeType, body.data.language);
	return c.json({ text });
});

// ---------------------------------------------------------------------------------------------
// Translation layer
// ---------------------------------------------------------------------------------------------

appApi.post("/translate", async (c) => {
	const body = (await c.req.json().catch(() => ({}))) as { kind?: string; formId?: string; lang?: string };
	if (!isValidLanguageCode(body.lang)) throw new GovError(400, "lang must be a language code like uk, tr, ar");
	if (!hasGemini(c.env) && body.lang !== "de" && body.lang !== "en") throw new GovError(503, "Translation needs GEMINI_API_KEY.");
	if (body.kind === "ui") return c.json(await translateUi(c.env, body.lang));
	if (body.kind === "form" && body.formId) {
		if (!getForm(body.formId)) throw new GovError(404, `Unknown form "${body.formId}"`);
		return c.json(await translateForm(c.env, body.formId, body.lang));
	}
	throw new GovError(400, 'kind must be "form" (with formId) or "ui"');
});

// ---------------------------------------------------------------------------------------------
// Memory (transparency + voice transcripts)
// ---------------------------------------------------------------------------------------------

appApi.get("/memory", async (c) => c.json(await listMemory(c.env.GOV_DB, c.var.session.pid)));

appApi.delete("/memory", async (c) => {
	await clearMemory(c.env.GOV_DB, c.var.session.pid);
	return c.json({ ok: true });
});

const memoryEntrySchema = z.object({
	key: z.string().min(1).max(60).optional(),
	value: z.string().min(1).max(500).optional(),
	category: z.enum(["preference", "language", "barrier", "context"]).optional(),
});

/** The citizen adds an entry themselves ("Was IDA sich merkt"). */
appApi.post("/memory", async (c) => {
	const body = memoryEntrySchema.safeParse(await c.req.json().catch(() => ({})));
	if (!body.success || !body.data.key || !body.data.value) throw new GovError(400, "key and value are required");
	await upsertMemory(c.env.GOV_DB, c.var.session.pid, [{ key: body.data.key, value: body.data.value, category: body.data.category ?? "preference", confidence: 1 }], "explicit");
	return c.json(await listMemory(c.env.GOV_DB, c.var.session.pid));
});

/** The citizen corrects an entry. */
appApi.patch("/memory/:id", async (c) => {
	const body = memoryEntrySchema.safeParse(await c.req.json().catch(() => ({})));
	if (!body.success) throw new GovError(400, body.error.message);
	const ok = await updateMemoryItem(c.env.GOV_DB, c.var.session.pid, c.req.param("id"), body.data);
	return c.json({ ok }, ok ? 200 : 404);
});

appApi.delete("/memory/:id", async (c) => {
	const ok = await deleteMemoryItem(c.env.GOV_DB, c.var.session.pid, c.req.param("id"));
	return c.json({ ok }, ok ? 200 : 404);
});

/** Called by the browser at the end of a voice session with the live transcript. */
appApi.post("/memory/ingest", async (c) => {
	const body = z
		.object({ transcript: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(4000) })).max(200) })
		.safeParse(await c.req.json().catch(() => ({})));
	if (!body.success) throw new GovError(400, "transcript is required");
	const session = c.var.session;
	c.executionCtx.waitUntil(
		runMemoryDecision(c.env, { citizenId: session.pid, sessionId: `live-${session.sid}`, transcript: body.data.transcript, source: "voice" }).catch((err) =>
			console.error("[memory error]", err),
		),
	);
	return c.json({ ok: true });
});

// ---------------------------------------------------------------------------------------------
// Forms → applications (draft, submit after the citizen confirmed)
// ---------------------------------------------------------------------------------------------

function formOr404(formId: string) {
	const form = getForm(formId);
	if (!form) throw new GovError(404, `Unknown form "${formId}"`);
	return form;
}

const valuesSchema = z.object({ values: z.record(z.string(), z.string()).default({}), lang: z.string().optional() });

appApi.post("/forms/:formId/draft", async (c) => {
	const form = formOr404(c.req.param("formId"));
	const body = valuesSchema.parse(await c.req.json().catch(() => ({})));
	const lang = govLang(body.lang);
	const app = await gov.startApplication(c.env, c.var.session.pid, form.serviceId, form.toServiceData(body.values), lang);
	return c.json({ ...app, formMissing: missingRequired(form, body.values) });
});

appApi.post("/forms/:formId/submit", async (c) => {
	const form = formOr404(c.req.param("formId"));
	const body = valuesSchema.parse(await c.req.json().catch(() => ({})));
	const lang = govLang(body.lang);
	const missing = missingRequired(form, body.values);
	if (missing.length) throw new GovError(400, `Required fields missing: ${missing.join(", ")}`);
	// Always write the latest form values into the draft, then submit (server-side validation).
	const pid = c.var.session.pid;
	const draft = await gov.startApplication(c.env, pid, form.serviceId, form.toServiceData(body.values), lang);
	const result = await gov.submitApplication(c.env, draft.applicationId, lang);

	// "Meine Dokumente": a copy of the submitted (German) form + the confirmation of the authority.
	const profile = await gov.getCitizenProfile(c.env, pid);
	const citizenName = `${profile.firstName} ${profile.lastName}`;
	const applicationDocId = await addDocument(c.env.GOV_DB, pid, {
		kind: "application",
		title: form.title,
		formId: form.id,
		serviceId: form.serviceId,
		referenceNumber: result.referenceNumber ?? undefined,
		data: { values: body.values, submittedAt: result.submittedAt, authority: result.authority },
	});
	const isRegistration = form.serviceId === "change-of-residence";
	const confirmationDocId = await addDocument(c.env.GOV_DB, pid, {
		kind: "confirmation",
		title: isRegistration ? "Meldebestätigung" : `Eingangsbestätigung – ${result.serviceName}`,
		serviceId: form.serviceId,
		referenceNumber: result.referenceNumber ?? undefined,
		data: {
			type: isRegistration ? "registration" : "receipt",
			citizenName,
			birthDate: profile.birthDate,
			serviceName: result.serviceName,
			authority: result.authority,
			issuedAt: result.submittedAt,
			details: result.data,
			nextSteps: result.nextSteps,
		},
	});
	return c.json({ ...result, applicationDocId, confirmationDocId });
});

// ---------------------------------------------------------------------------------------------
// Conversations (sidebar) and documents ("Meine Dokumente")
// ---------------------------------------------------------------------------------------------

appApi.get("/conversations", async (c) => c.json(await listConversations(c.env.GOV_DB, c.var.session.pid)));

appApi.post("/conversations", async (c) => c.json(await createConversation(c.env.GOV_DB, c.var.session.pid)));

/** Sets the title (e.g. for a conversation that only happened by voice) or renames it. */
appApi.patch("/conversations/:id", async (c) => {
	const id = c.req.param("id");
	const body = z.object({ title: z.string().min(1).max(200), ifEmpty: z.boolean().optional() }).safeParse(await c.req.json().catch(() => ({})));
	if (!isConversationId(id) || !body.success) throw new GovError(400, "Invalid conversation or title");
	// ifEmpty: only set a title if there is none yet (voice conversations); otherwise rename.
	await touchConversation(c.env.GOV_DB, c.var.session.pid, id, body.data.title);
	if (body.data.ifEmpty) return c.json({ ok: true });
	return c.json({ ok: await renameConversation(c.env.GOV_DB, c.var.session.pid, id, body.data.title) });
});

appApi.delete("/conversations/:id", async (c) => {
	const pid = c.var.session.pid;
	const id = c.req.param("id");
	if (!isConversationId(id)) throw new GovError(400, "Invalid conversation");
	const ok = await deleteConversation(c.env.GOV_DB, pid, id);
	// Also delete the stored messages in the chat agent (only the citizen's own instance).
	try {
		const agent = await getAgentByName(c.env.CitizenAssistant, `${pid}--${id}`);
		await agent.wipeConversation();
	} catch (err) {
		console.warn("[conversations] could not wipe messages", err);
	}
	return c.json({ ok }, ok ? 200 : 404);
});

appApi.get("/documents", async (c) => c.json(await listDocuments(c.env.GOV_DB, c.var.session.pid)));

appApi.get("/documents/:id", async (c) => {
	const doc = await getDocument(c.env.GOV_DB, c.var.session.pid, c.req.param("id"));
	if (!doc) throw new GovError(404, "Unknown document");
	return c.json(doc);
});

// ---------------------------------------------------------------------------------------------
// Appointments ("Meine Termine" + visual slot picker)
// ---------------------------------------------------------------------------------------------

appApi.get("/appointments", async (c) => c.json(await gov.listMyAppointments(c.env, c.var.session.pid, govLang(c.req.query("lang")))));

appApi.get("/appointments/services", (c) => c.json(gov.appointmentServices(govLang(c.req.query("lang")))));

appApi.get("/appointments/slots", async (c) => {
	const serviceId = c.req.query("serviceId") ?? "passport-renewal";
	return c.json(await gov.getAppointmentSlots(c.env, serviceId, Math.min(40, Number(c.req.query("limit")) || 24)));
});

appApi.post("/appointments/:bookingId/cancel", async (c) => {
	const result = await gov.cancelAppointment(c.env, c.var.session.pid, c.req.param("bookingId"));
	await markCancelled(c.env.GOV_DB, c.var.session.pid, result.referenceNumber);
	return c.json(result);
});

appApi.post("/appointments/:slotId/book", async (c) => {
	const lang = govLang(c.req.query("lang"));
	const result = await gov.bookAppointment(c.env, c.var.session.pid, c.req.param("slotId"), lang);
	const profile = await gov.getCitizenProfile(c.env, c.var.session.pid);
	const confirmationDocId = await addDocument(c.env.GOV_DB, c.var.session.pid, {
		kind: "confirmation",
		title: `Terminbestätigung – ${result.serviceName}`,
		referenceNumber: result.referenceNumber,
		data: {
			type: "appointment",
			citizenName: `${profile.firstName} ${profile.lastName}`,
			serviceName: result.serviceName,
			authority: result.office,
			office: result.office,
			slotTime: result.slotTime,
			issuedAt: new Date().toISOString(),
			nextSteps: result.nextSteps,
		},
	});
	return c.json({ ...result, confirmationDocId });
});

/** Debug helper: the system prompt the assistant currently gets (useful for the technical documentation). */
appApi.get("/debug/system-prompt", async (c) => {
	const context = await loadCitizenContext(c.env, c.var.session.pid);
	return c.text(buildSystemPrompt({ settings: DEFAULT_SETTINGS, context, channel: "chat", today: gov.today() }));
});
