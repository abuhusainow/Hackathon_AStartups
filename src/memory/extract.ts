/**
 * The "decision model" for the memory.
 *
 * After every chat answer and at the end of every voice session, a separate model looks at the latest
 * turns and the existing memory and decides what is worth remembering about the citizen – and what is
 * outdated. Runs in the background (waitUntil), so it never slows down the conversation.
 */
import { generateText } from "ai";
import { z } from "zod";
import { getDecisionModel } from "../config";
import type { AccessibilityProfile, AssistantSettings, MemoryItem } from "../shared/types";
import { deleteMemoryKeys, listMemory, saveSummary, upsertMemory } from "./store";

export type TranscriptTurn = { role: "user" | "assistant"; text: string };

/** Keys the UI understands and applies automatically (language, text size, …). */
export const PREFERENCE_KEYS = {
	preferred_language: "BCP-47 code of the language the citizen wants to use, e.g. uk, tr, ar, en, de, de-x-easy",
	text_size: "Text size multiplier the citizen asked for: 1, 1.25, 1.5, 1.75 or 2",
	high_contrast: '"true" if the citizen needs high contrast',
	easy_language: '"true" if the citizen wants plain / easy language',
	prefers_voice: '"true" if the citizen prefers talking instead of typing',
	read_aloud: '"true" if answers should be read aloud',
} as const;

const DecisionSchema = z.object({
	upserts: z
		.array(
			z.object({
				key: z.string().min(1).max(60),
				value: z.string().min(1).max(500),
				category: z.enum(["preference", "language", "barrier", "context"]),
				confidence: z.number().min(0).max(1).optional(),
			}),
		)
		.default([]),
	deletes: z.array(z.string()).default([]),
	summary: z.string().max(1000).optional(),
});

export type MemoryDecision = z.infer<typeof DecisionSchema>;

const SYSTEM = `You are the memory component of IDA, the citizen-service assistant of the Austrian public administration.
You decide which facts about the citizen should be remembered for future conversations, so the citizen never has to repeat them.

Remember ONLY what the citizen said or clearly showed themselves and what helps to serve them better:
- category "language": languages they speak, how well they speak German, preferred language
- category "barrier": barriers they told you about (e.g. visual impairment, hard of hearing, dyslexia, limited mobility, low digital skills, cannot read small text). Store the need, not a diagnosis.
- category "preference": how they want to be served (short answers, voice, easy language, call-back by phone, prefers a human, text size, contrast)
- category "context": stable life situation relevant to public services (e.g. "has two children", "just moved to Vienna", "self-employed", "is a displaced person from Ukraine")

Language preference: only store preferred_language when the citizen explicitly asks for a language ("please talk to me in Turkish") or consistently writes in it.
A request to translate a form or a single message in another language is NOT a language preference.
Never store data that belongs to a single application (new address, move-in date, landlord, document numbers, form answers) – that lives in the form and the official registers – and never the citizen's name.
Never store: passwords, ID / passport / social security numbers, IBANs (they are in the official registers), other people's sensitive data,
anything the assistant said that the citizen did not confirm, guesses, one-off requests ("wants to renew passport today"), or emotional states.

Use these exact keys when they apply (the app applies them automatically):
${Object.entries(PREFERENCE_KEYS)
	.map(([k, d]) => `- ${k}: ${d}`)
	.join("\n")}
Otherwise use short snake_case English keys (e.g. "german_level", "vision", "hearing", "children", "contact_preference").
Values are short phrases in the language the citizen used (the citizen reads them on the page "Was IDA sich merkt"); for the fixed keys above use the formats given.
If the citizen mentions a barrier that a setting can solve, ALSO set the matching key (e.g. "cannot read small text" → vision + text_size "1.5"; "please simpler" → easy_language "true").
If a new statement contradicts an existing memory, upsert the new value (same key). Put keys that are no longer true into "deletes".
If nothing new is worth remembering, return empty arrays.
Also write "summary": 1–2 sentences (English) about what the citizen wanted in this conversation and how far they got.

Answer with JSON only, no prose: {"upserts":[{"key":"...","value":"...","category":"...","confidence":0.9}],"deletes":["..."],"summary":"..."}`;

const BLOCKED_KEY = /(application|applying|apply|antrag|request|current_|form|appointment|termin|booking|address|adresse|landlord|move|moved|date|name|reference|iban|svnr|social_security|passport_number|id_number|document_number)/;

/** Keys the app understands are always fine; everything that looks like one-off case data is dropped. */
export function keepMemoryKey(key: string): boolean {
	const k = key.toLowerCase();
	return k in PREFERENCE_KEYS || !BLOCKED_KEY.test(k);
}

/** Extracts the first JSON object from a model answer (some models wrap JSON in prose or code fences). */
export function parseDecision(text: string): MemoryDecision | null {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		const parsed = DecisionSchema.safeParse(JSON.parse(text.slice(start, end + 1)));
		return parsed.success ? parsed.data : null;
	} catch {
		return null;
	}
}

export async function runMemoryDecision(
	env: Env,
	input: { citizenId: string; sessionId: string; transcript: TranscriptTurn[]; source: MemoryItem["source"] },
): Promise<MemoryDecision | null> {
	const turns = input.transcript.filter((t) => t.text.trim()).slice(-12);
	if (!turns.some((t) => t.role === "user")) return null;
	const existing = await listMemory(env.GOV_DB, input.citizenId);
	const { model, provider } = await getDecisionModel(env, { app: "ida-memory", persona: input.citizenId, session: input.sessionId });

	const result = await generateText({
		model,
		system: SYSTEM,
		prompt: `Existing memory:\n${JSON.stringify(existing.map(({ key, value, category }) => ({ key, value, category })))}\n\nLatest conversation (${input.source}):\n${turns
			.map((t) => `${t.role === "user" ? "CITIZEN" : "IDA"}: ${t.text.slice(0, 2000)}`)
			.join("\n")}`,
		temperature: 0,
		maxOutputTokens: 1200,
	});

	const decision = parseDecision(result.text);
	if (!decision) {
		console.warn(`[memory] ${provider} returned no valid decision`, result.text.slice(0, 300));
		return null;
	}
	// Safety net for the rules above: never keep one-off application data or identifiers.
	decision.upserts = decision.upserts.filter((u) => keepMemoryKey(u.key));
	if (decision.upserts.length) await upsertMemory(env.GOV_DB, input.citizenId, decision.upserts, input.source);
	if (decision.deletes.length) await deleteMemoryKeys(env.GOV_DB, input.citizenId, decision.deletes);
	if (decision.summary) await saveSummary(env.GOV_DB, input.citizenId, input.sessionId, decision.summary);
	console.log(`[memory] ${provider}: +${decision.upserts.length} -${decision.deletes.length} for ${input.citizenId}`);
	return decision;
}

/**
 * Settings the UI should apply for this citizen: persona accessibility needs (simulated register data)
 * overridden by what the citizen told IDA (memory).
 */
export function preferencesFrom(memory: MemoryItem[], accessibility: AccessibilityProfile, preferredLanguage: string): Partial<AssistantSettings> {
	const get = (k: string) => memory.find((m) => m.key === k)?.value?.trim().toLowerCase();
	const truthy = (v: string | undefined) => v === "true" || v === "yes" || v === "ja";
	const prefs: Partial<AssistantSettings> = { language: preferredLanguage };
	if (accessibility.vision) Object.assign(prefs, { textScale: 1.5, contrast: "high" });
	if (accessibility.cognitive === "easy_language") prefs.easyLanguage = true;
	if (accessibility.vision === "blind") prefs.preferVoice = true;

	// Barriers told to IDA → sensible defaults (explicit settings below win).
	if (memory.some((m) => m.category === "barrier" && /vision|sight|see|read/.test(`${m.key} ${m.value}`.toLowerCase()))) {
		prefs.textScale = Math.max(prefs.textScale ?? 1, 1.5);
	}

	const lang = get("preferred_language");
	if (lang && /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/.test(lang)) prefs.language = lang;
	const size = Number(get("text_size"));
	if (size >= 1 && size <= 2) prefs.textScale = size;
	if (get("high_contrast") !== undefined) prefs.contrast = truthy(get("high_contrast")) ? "high" : "normal";
	if (get("easy_language") !== undefined) prefs.easyLanguage = truthy(get("easy_language"));
	if (get("prefers_voice") !== undefined) prefs.preferVoice = truthy(get("prefers_voice"));
	return prefs;
}
