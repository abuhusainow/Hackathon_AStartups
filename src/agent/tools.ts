/**
 * ONE tool registry for both channels:
 *   - text chat (AI SDK tools in the CitizenAssistant agent)
 *   - Gemini Live voice (function declarations in the ephemeral token, executed by the browser;
 *     server tools are forwarded to POST /api/tools/:name)
 *
 * Two kinds of tools:
 *   server  run in the Worker, talk to the mock government backend / memory
 *   client  run in the browser: open and fill the form on the right, translate it, change UI settings,
 *           ask the citizen to confirm a submission. They have no `execute` on the server – the browser
 *           returns their result (useAgentChat onToolCall / Live toolResponse).
 *
 * Security rule: `citizenId` ALWAYS comes from the verified session, never from the model's input.
 * Binding actions (submit, book) are client tools that open a confirmation dialog – the citizen
 * must click "Submit" themselves. The AI can never submit or book on its own.
 */
import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { toGeminiSchema } from "../ai/gemini";
import * as gov from "../gov/service";
import { upsertMemory, deleteMemoryKeys } from "../memory/store";
import { FORM_IDS } from "../shared/forms";
import { govLang, type AssistantSettings } from "../shared/types";

export type ToolContext = {
	env: Env;
	citizenId: string;
	sessionId: string;
	settings: AssistantSettings;
	/** "eval" replaces write tools and client tools with stubs that never execute. */
	mode: "chat" | "eval" | "live";
};

type ToolSpec = {
	description: string;
	input: z.ZodObject;
	side: "server" | "client";
	/** Changes something outside the conversation – stubbed in evals. */
	write?: boolean;
	execute?: (input: never, ctx: ToolContext) => Promise<unknown>;
};

const SERVICE_IDS = ["change-of-residence", "passport-renewal", "childcare-subsidy", "family-allowance"] as const;
const serviceId = z.enum(SERVICE_IDS).describe("Service id");

function spec<S extends z.ZodObject>(s: { description: string; input: S; side: "server" | "client"; write?: boolean; execute?: (input: z.infer<S>, ctx: ToolContext) => Promise<unknown> }): ToolSpec {
	return s as unknown as ToolSpec;
}

export const TOOL_SPECS: Record<string, ToolSpec> = {
	// -------------------------------------------------------------------------------------------
	// Server tools
	// -------------------------------------------------------------------------------------------
	get_my_profile: spec({
		side: "server",
		description:
			"Get the logged-in citizen's full register data: name, addresses, documents with expiry status, household, residence status. Use it instead of asking for data you already have.",
		input: z.object({}),
		execute: async (_i, ctx) => gov.getCitizenProfile(ctx.env, ctx.citizenId),
	}),
	find_services: spec({
		side: "server",
		description: "Find the right public service for the citizen's request (keyword search, works with colloquial words and dialect).",
		input: z.object({ query: z.string().describe("The citizen's request in a few words") }),
		execute: async ({ query }, ctx) => gov.findServices(query, govLang(ctx.settings.language)),
	}),
	get_service_info: spec({
		side: "server",
		description:
			"Official facts about a service (requirements, authority, documents, next steps) with source URL. Base every factual answer about rules, deadlines or documents on this.",
		input: z.object({ serviceId }),
		execute: async ({ serviceId }, ctx) => gov.getServiceInfo(serviceId, govLang(ctx.settings.language)),
	}),
	check_eligibility: spec({
		side: "server",
		description: "Check whether the logged-in citizen is eligible for a service and which documents or data are missing.",
		input: z.object({ serviceId }),
		execute: async ({ serviceId }, ctx) => gov.checkEligibility(ctx.env, ctx.citizenId, serviceId),
	}),
	get_appointment_slots: spec({
		side: "server",
		description: "Free appointment slots for services that need a personal appointment (passport).",
		input: z.object({ serviceId }),
		execute: async ({ serviceId }, ctx) => gov.getAppointmentSlots(ctx.env, serviceId),
	}),
	create_handoff: spec({
		side: "server",
		write: true,
		description:
			"Hand the case over to a human case worker (call-back). Use it when the citizen asks for a person, when the case is too complex, or when you are unsure.",
		input: z.object({
			reason: z.string().describe("Why a human is needed"),
			summary: z.string().describe("Short summary of the case for the case worker, in German"),
			preferredChannel: z.enum(["phone", "email", "in_person"]).optional(),
		}),
		execute: async (i, ctx) =>
			gov.createHandoff(ctx.env, { citizenId: ctx.citizenId, sessionId: ctx.sessionId, ...i }, govLang(ctx.settings.language)),
	}),
	remember: spec({
		side: "server",
		description:
			"Store something the citizen explicitly asks you to remember (e.g. 'please always talk to me in Turkish', 'I can't read small text'). Background memory runs automatically – use this only for explicit requests.",
		input: z.object({
			key: z.string().describe("short snake_case key, e.g. preferred_language, text_size, vision, contact_preference"),
			value: z.string(),
			category: z.enum(["preference", "language", "barrier", "context"]),
		}),
		execute: async (i, ctx) => {
			await upsertMemory(ctx.env.GOV_DB, ctx.citizenId, [{ ...i, confidence: 1 }], "explicit");
			return { stored: true };
		},
	}),
	forget: spec({
		side: "server",
		description: "Delete a stored memory entry when the citizen asks you to forget something.",
		input: z.object({ key: z.string() }),
		execute: async ({ key }, ctx) => {
			await deleteMemoryKeys(ctx.env.GOV_DB, ctx.citizenId, [key]);
			return { deleted: key };
		},
	}),

	// -------------------------------------------------------------------------------------------
	// Client tools (executed in the browser)
	// -------------------------------------------------------------------------------------------
	open_form: spec({
		side: "client",
		description:
			"Open the official form for a service in the panel on the right. It is pre-filled automatically from the ID Austria register data. Returns the form fields (ids, German labels, required flag) and which required fields are still missing.",
		input: z.object({ formId: z.enum(FORM_IDS).describe("meldezettel = change of residence, familienbeihilfe = family allowance, reisepass = passport") }),
	}),
	fill_fields: spec({
		side: "client",
		description:
			"Fill one or more fields of the open form. Values in German / the format the form expects: dates as TT.MM.JJJJ, radio/select values exactly as one of the option values, checkboxes as 'yes' or 'no'. Only use values the citizen gave you or that come from their register data.",
		input: z.object({
			fields: z.array(z.object({ fieldId: z.string(), value: z.string() })).min(1),
		}),
	}),
	focus_field: spec({
		side: "client",
		description: "Highlight a field of the open form and scroll to it, to guide the citizen step by step. Optionally show a short hint next to it.",
		input: z.object({ fieldId: z.string(), hint: z.string().optional().describe("Short explanation in the citizen's language") }),
	}),
	get_form_state: spec({
		side: "client",
		description: "Read the current values of the open form (the citizen may have typed something themselves) and the missing required fields.",
		input: z.object({}),
	}),
	translate_form: spec({
		side: "client",
		description:
			"Lay a translation over the open form (all labels, headings and hints) in the given language. The original German form and its input fields stay unchanged and fillable.",
		input: z.object({ language: z.string().describe("BCP-47 code, e.g. en, uk, tr, ar, fa, bs, de-x-easy (Easy German)") }),
	}),
	show_original: spec({
		side: "client",
		description: "Remove the translation layer and show the original German form.",
		input: z.object({}),
	}),
	set_ui_preferences: spec({
		side: "client",
		description:
			"Change the app settings for the citizen: language, text size, high contrast, easy language, read answers aloud. Use it when the citizen asks for it or clearly needs it.",
		input: z.object({
			language: z.string().optional().describe("BCP-47 code"),
			textScale: z.number().min(1).max(2).optional().describe("1 = 100 %, 1.5 = 150 %, 2 = 200 %"),
			highContrast: z.boolean().optional(),
			easyLanguage: z.boolean().optional(),
			readAloud: z.boolean().optional(),
		}),
	}),
	request_submission: spec({
		side: "client",
		description:
			"When the form is complete: show the citizen a summary and ask them to confirm the binding submission (signed with ID Austria). Waits for the citizen's decision and returns the reference number or why it was not submitted.",
		input: z.object({}),
	}),
	request_appointment_booking: spec({
		side: "client",
		description: "Ask the citizen to confirm booking an appointment slot (from get_appointment_slots). Waits for the decision.",
		input: z.object({ slotId: z.string(), slotLabel: z.string().describe("Human readable time and office") }),
	}),
	close_form: spec({
		side: "client",
		description: "Close the form panel.",
		input: z.object({}),
	}),
};

export const CLIENT_TOOL_NAMES = Object.entries(TOOL_SPECS)
	.filter(([, s]) => s.side === "client")
	.map(([n]) => n);

/** Write tools never execute during `pnpm evals`. */
export const EVAL_STUBBED_TOOLS = Object.entries(TOOL_SPECS)
	.filter(([, s]) => s.write)
	.map(([n]) => n);

/** Stub results for client tools in eval mode (there is no browser). */
function evalClientStub(name: string, input: Record<string, unknown>): unknown {
	switch (name) {
		case "open_form":
			return { opened: true, formId: input.formId, note: "Eval mode: form opened (simulated), pre-filled from the profile." };
		case "request_submission":
		case "request_appointment_booking":
			return { status: "not_executed", note: "Eval mode: nothing was submitted or booked." };
		default:
			return { ok: true, note: "Eval mode: simulated browser action." };
	}
}

/** AI SDK tools for the text chat (and the evals). */
export function buildTools(ctx: ToolContext): ToolSet {
	const tools: ToolSet = {};
	for (const [name, s] of Object.entries(TOOL_SPECS)) {
		if (s.side === "client") {
			tools[name] =
				ctx.mode === "eval"
					? tool({ description: s.description, inputSchema: s.input, execute: async (i) => evalClientStub(name, i as Record<string, unknown>) })
					: tool({ description: s.description, inputSchema: s.input }); // no execute → handled by the browser
			continue;
		}
		const stubbed = ctx.mode === "eval" && s.write;
		tools[name] = tool({
			description: s.description,
			inputSchema: s.input,
			execute: async (input) => {
				if (stubbed) return { status: "not_executed", note: "Eval mode: nothing was changed." };
				try {
					return await s.execute!(input as never, ctx);
				} catch (err) {
					// Tell the model what went wrong so it can explain it to the citizen (e.g. simulated outage).
					return { error: err instanceof Error ? err.message : String(err) };
				}
			},
		});
	}
	return tools;
}

/** Executes a server tool for the Live voice channel (POST /api/tools/:name). */
export async function executeServerTool(name: string, rawInput: unknown, ctx: ToolContext) {
	const s = TOOL_SPECS[name];
	if (!s || s.side !== "server" || !s.execute) throw new Error(`Unknown server tool "${name}"`);
	const parsed = s.input.safeParse(rawInput ?? {});
	if (!parsed.success) return { error: `Invalid input: ${parsed.error.message}` };
	try {
		return await s.execute(parsed.data as never, ctx);
	} catch (err) {
		return { error: err instanceof Error ? err.message : String(err) };
	}
}

/** Gemini Live function declarations for all tools (server + client). */
export function liveFunctionDeclarations() {
	return Object.entries(TOOL_SPECS).map(([name, s]) => {
		const schema = toGeminiSchema(z.toJSONSchema(s.input) as Record<string, unknown>) as { properties?: unknown };
		return {
			name,
			description: s.description,
			...(schema.properties ? { parameters: schema } : {}),
		};
	});
}

export function toolSide(name: string): "server" | "client" | undefined {
	return TOOL_SPECS[name]?.side;
}
