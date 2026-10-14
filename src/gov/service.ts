/**
 * Business logic of the mock e-government backend.
 *
 * Used in two places:
 *   - the Hono REST API (src/gov/routes.ts) – for the frontend, curl and other teams' tools
 *   - the agent tools (src/agent/tools.ts) – the AI calls these functions directly
 *
 * 👉 EXTEND HERE: this is where you would connect a real API instead of the mock database.
 */
import type { Language } from "../shared/types";
import { getKnowledge } from "../knowledge";
import { HUMAN_CONTACT } from "./data/contact";
import { getServiceDefinition, SERVICES } from "./data/services";
import {
	dbBookSlot,
	dbGetApplication,
	dbGetCitizen,
	dbGetDraft,
	dbGetSlot,
	dbInsertApplication,
	dbInsertHandoff,
	dbListCitizens,
	dbListFreeSlots,
	dbUpdateApplication,
	ensureSeeded,
} from "./db";
import { GovError, MockOutageError } from "./errors";
import type { Application, Citizen, FormField, ServiceDefinition } from "./types";

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Today's date in Vienna (YYYY-MM-DD). */
export function today(): string {
	return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Vienna" }).format(new Date());
}

function nowVienna(): string {
	// "2026-10-20 09:30" -> "2026-10-20T09:30"
	return new Intl.DateTimeFormat("sv-SE", {
		timeZone: "Europe/Vienna",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	})
		.format(new Date())
		.replace(" ", "T");
}

function newId(prefix: string): string {
	return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

function referenceNumber(prefix: string): string {
	const year = new Date().getFullYear();
	const n = Math.floor(100000 + Math.random() * 900000);
	return `${prefix}-${year}-${n}`;
}

export type SimulateMode = "slow" | "error" | undefined;

/**
 * Simulates a real-world government backend: random latency and outages.
 * Configure with MOCK_FAILURE_RATE (0–1) and MOCK_LATENCY_MS in wrangler.jsonc,
 * or per request with ?simulate=slow|error on the REST API.
 */
export async function simulateBackend(env: Env, mode?: SimulateMode): Promise<void> {
	const latency = mode === "slow" ? 4000 : Number(env.MOCK_LATENCY_MS ?? 0);
	if (latency > 0) await new Promise((r) => setTimeout(r, latency));
	const failureRate = Number(env.MOCK_FAILURE_RATE ?? 0);
	if (mode === "error" || (failureRate > 0 && Math.random() < failureRate)) throw new MockOutageError();
}

async function ready(env: Env, mode?: SimulateMode) {
	await ensureSeeded(env.GOV_DB);
	await simulateBackend(env, mode);
	return env.GOV_DB;
}

function requireService(serviceId: string): ServiceDefinition {
	const def = getServiceDefinition(serviceId);
	if (!def) throw new GovError(404, `Unknown service "${serviceId}". Available: ${SERVICES.map((s) => s.id).join(", ")}`);
	return def;
}

async function requireCitizen(env: Env, citizenId: string): Promise<Citizen> {
	const citizen = await dbGetCitizen(env.GOV_DB, citizenId);
	if (!citizen) throw new GovError(404, `Unknown citizen "${citizenId}"`);
	return citizen;
}

function localizeField(f: FormField, lang: Language) {
	return {
		id: f.id,
		label: f.label[lang],
		type: f.type,
		required: f.required,
		...(f.mustBeTrue ? { mustBe: "yes" } : {}),
		...(f.options ? { options: f.options.map((o) => ({ value: o.value, label: o.label[lang] })) } : {}),
		...(f.hint ? { hint: f.hint[lang] } : {}),
	};
}

/** Server-side validation: which required fields are missing or invalid? */
export function validateApplicationData(def: ServiceDefinition, data: Record<string, string>, lang: Language = "en") {
	const problems: string[] = [];
	for (const f of def.fields) {
		const value = (data[f.id] ?? "").trim();
		if (f.required && !value) {
			problems.push(`Missing: ${f.label[lang]} (${f.id})`);
			continue;
		}
		if (!value) continue;
		if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push(`${f.label[lang]} (${f.id}) must be a date in format YYYY-MM-DD`);
		if (f.type === "select" && f.options && !f.options.some((o) => o.value === value))
			problems.push(`${f.label[lang]} (${f.id}) must be one of: ${f.options.map((o) => o.value).join(", ")}`);
		if (f.type === "boolean" && !["yes", "no"].includes(value)) problems.push(`${f.label[lang]} (${f.id}) must be "yes" or "no"`);
		if (f.mustBeTrue && value !== "yes") problems.push(`${f.label[lang]} (${f.id}) is required to submit`);
	}
	return problems;
}

/** Only keep known field ids, convert booleans to "yes"/"no". */
function cleanData(def: ServiceDefinition, data: Record<string, unknown>): Record<string, string> {
	const clean: Record<string, string> = {};
	for (const f of def.fields) {
		const v = data[f.id];
		if (v === undefined || v === null || v === "") continue;
		clean[f.id] = typeof v === "boolean" ? (v ? "yes" : "no") : String(v).trim();
	}
	return clean;
}

function applicationView(app: Application, def: ServiceDefinition, lang: Language) {
	const missing = validateApplicationData(def, app.data, lang);
	return {
		applicationId: app.id,
		serviceId: app.serviceId,
		serviceName: def.name[lang],
		status: app.status,
		data: app.data,
		missingOrInvalid: missing,
		readyToSubmit: app.status === "draft" && missing.length === 0,
		referenceNumber: app.referenceNumber,
	};
}

// ---------------------------------------------------------------------------------------------
// Citizens
// ---------------------------------------------------------------------------------------------

export async function listPersonas(env: Env) {
	await ensureSeeded(env.GOV_DB);
	const citizens = await dbListCitizens(env.GOV_DB);
	return citizens.map((c) => ({
		id: c.id,
		name: `${c.firstName} ${c.lastName}`,
		preferredLanguage: c.preferredLanguage,
		languages: c.languages,
		accessibility: c.accessibility,
		scenarioHint: c.scenarioHint,
	}));
}

export async function getCitizenProfile(env: Env, citizenId: string, mode?: SimulateMode) {
	await ready(env, mode);
	const citizen = await requireCitizen(env, citizenId);
	const t = today();
	return {
		...citizen,
		documents: citizen.documents.map((d) => ({ ...d, status: d.validUntil === null || d.validUntil >= t ? "valid" : "expired" })),
		today: t,
	};
}

// ---------------------------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------------------------

export function listServices(lang: Language = "de") {
	return SERVICES.map((s) => ({
		id: s.id,
		name: s.name[lang],
		summary: s.summary[lang],
		implementation: s.implementation,
	}));
}

/** Very simple keyword search. 👉 EXTEND HERE: semantic search with embeddings / AI Search. */
export function findServices(query: string, lang: Language = "de") {
	const words = query.toLowerCase().normalize("NFC").split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2);
	const scored = SERVICES.map((s) => {
		const haystack = [...s.keywords, s.name.de, s.name.en].join(" ").toLowerCase();
		const score = words.filter((w) => haystack.includes(w) || s.keywords.some((k) => w.includes(k))).length;
		return { s, score };
	})
		.filter((x) => x.score > 0)
		.sort((a, b) => b.score - a.score);
	return {
		query,
		matches: scored.map(({ s, score }) => ({ id: s.id, name: s.name[lang], summary: s.summary[lang], score })),
		allServices: scored.length === 0 ? listServices(lang) : undefined,
	};
}

export function getServiceInfo(serviceId: string, lang: Language = "de") {
	const def = requireService(serviceId);
	const knowledge = getKnowledge(serviceId);
	return {
		id: def.id,
		name: def.name[lang],
		summary: def.summary[lang],
		authority: def.authority[lang],
		implementation: def.implementation,
		requiresAppointment: def.requiresAppointment,
		facts: knowledge?.content[lang] ?? null,
		sourceUrl: knowledge?.sourceUrl ?? null,
		factsVerified: knowledge?.verified ?? false,
		formFields: def.fields.map((f) => localizeField(f, lang)),
		nextSteps: def.nextSteps[lang],
	};
}

export async function checkEligibility(env: Env, citizenId: string, serviceId: string, mode?: SimulateMode) {
	await ready(env, mode);
	const def = requireService(serviceId);
	const citizen = await requireCitizen(env, citizenId);
	return {
		serviceId,
		implementation: def.implementation,
		...def.eligibility(citizen, today()),
	};
}

// ---------------------------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------------------------

/** Creates a draft (pre-filled from the profile) or returns the existing draft and merges new data. */
export async function startApplication(
	env: Env,
	citizenId: string,
	serviceId: string,
	data: Record<string, unknown> = {},
	lang: Language = "de",
	mode?: SimulateMode,
) {
	const db = await ready(env, mode);
	const def = requireService(serviceId);
	const citizen = await requireCitizen(env, citizenId);
	const existing = await dbGetDraft(db, citizenId, serviceId);
	if (existing) {
		existing.data = { ...existing.data, ...cleanData(def, data) };
		await dbUpdateApplication(db, existing);
		return applicationView(existing, def, lang);
	}
	const app: Application = {
		id: newId("app"),
		citizenId,
		serviceId,
		status: "draft",
		data: { ...def.prefill(citizen, today()), ...cleanData(def, data) },
		referenceNumber: null,
		createdAt: new Date().toISOString(),
		submittedAt: null,
	};
	await dbInsertApplication(db, app);
	return applicationView(app, def, lang);
}

export async function updateApplication(env: Env, applicationId: string, data: Record<string, unknown>, lang: Language = "de", mode?: SimulateMode) {
	const db = await ready(env, mode);
	const app = await dbGetApplication(db, applicationId);
	if (!app) throw new GovError(404, `Unknown application "${applicationId}"`);
	if (app.status !== "draft") throw new GovError(409, "This application was already submitted and cannot be changed.");
	const def = requireService(app.serviceId);
	app.data = { ...app.data, ...cleanData(def, data) };
	await dbUpdateApplication(db, app);
	return applicationView(app, def, lang);
}

export async function getApplication(env: Env, applicationId: string, lang: Language = "de") {
	const db = await ready(env);
	const app = await dbGetApplication(db, applicationId);
	if (!app) throw new GovError(404, `Unknown application "${applicationId}"`);
	return applicationView(app, requireService(app.serviceId), lang);
}

/**
 * Submits an application. Validates server-side – never trust the AI to have checked everything.
 * Returns a structured result (reference number, next steps) that the frontend shows as a card.
 */
export async function submitApplication(env: Env, applicationId: string, lang: Language = "de", mode?: SimulateMode) {
	const db = await ready(env, mode);
	const app = await dbGetApplication(db, applicationId);
	if (!app) throw new GovError(404, `Unknown application "${applicationId}"`);
	const def = requireService(app.serviceId);
	if (app.status === "submitted") throw new GovError(409, `Already submitted with reference number ${app.referenceNumber}.`);
	const problems = validateApplicationData(def, app.data, lang);
	if (problems.length > 0) throw new GovError(400, `Cannot submit, please fix: ${problems.join("; ")}`);

	app.status = "submitted";
	app.referenceNumber = referenceNumber(def.referencePrefix);
	app.submittedAt = new Date().toISOString();
	await dbUpdateApplication(db, app);

	// Side effect for the main use case: update the citizen's registered address.
	if (def.id === "change-of-residence") {
		const column = app.data.residence_type === "secondary" ? "secondary_address" : "primary_address";
		await db.prepare(`UPDATE citizens SET ${column} = ? WHERE id = ?`).bind(app.data.new_address, app.citizenId).run();
	}

	return {
		type: "submission_result" as const,
		success: true,
		referenceNumber: app.referenceNumber,
		serviceId: def.id,
		serviceName: def.name[lang],
		authority: def.authority[lang],
		submittedAt: app.submittedAt,
		data: app.data,
		nextSteps: def.nextSteps[lang],
		mock: true,
	};
}

// ---------------------------------------------------------------------------------------------
// Appointments
// ---------------------------------------------------------------------------------------------

export async function getAppointmentSlots(env: Env, serviceId: string, limit = 6, mode?: SimulateMode) {
	const db = await ready(env, mode);
	const def = requireService(serviceId);
	if (!def.requiresAppointment) return { serviceId, requiresAppointment: false, slots: [] };
	const slots = await dbListFreeSlots(db, serviceId, nowVienna(), limit);
	return { serviceId, requiresAppointment: true, slots: slots.map(({ citizenId, ...s }) => s) };
}

export async function bookAppointment(env: Env, citizenId: string, slotId: string, lang: Language = "de", mode?: SimulateMode) {
	const db = await ready(env, mode);
	await requireCitizen(env, citizenId);
	const slot = await dbGetSlot(db, slotId);
	if (!slot) throw new GovError(404, `Unknown appointment slot "${slotId}"`);
	const booked = await dbBookSlot(db, slotId, citizenId);
	if (!booked) throw new GovError(409, "This slot was just taken. Please choose another slot.");
	const def = requireService(slot.serviceId);
	return {
		type: "booking_result" as const,
		success: true,
		referenceNumber: `TERMIN-${slot.id.slice(-3)}-${Math.floor(1000 + Math.random() * 9000)}`,
		serviceName: def.name[lang],
		office: slot.office,
		slotTime: slot.slotTime,
		nextSteps: def.nextSteps[lang],
		mock: true,
	};
}

// ---------------------------------------------------------------------------------------------
// Human handoff
// ---------------------------------------------------------------------------------------------

export async function createHandoff(
	env: Env,
	input: { citizenId?: string | null; sessionId?: string | null; reason: string; summary: string; preferredChannel?: string | null },
	lang: Language = "de",
) {
	// Never simulate failures here: the human fallback must always work.
	await ensureSeeded(env.GOV_DB);
	const handoff = {
		id: newId("hand"),
		citizenId: input.citizenId ?? null,
		sessionId: input.sessionId ?? null,
		reason: input.reason,
		summary: input.summary,
		preferredChannel: input.preferredChannel ?? null,
		createdAt: new Date().toISOString(),
	};
	await dbInsertHandoff(env.GOV_DB, handoff);
	return {
		type: "handoff_result" as const,
		ticketId: handoff.id,
		phone: HUMAN_CONTACT.phone,
		hours: HUMAN_CONTACT.hours[lang],
		office: HUMAN_CONTACT.office[lang],
		message: HUMAN_CONTACT.callbackPromise[lang],
	};
}
