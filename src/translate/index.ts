/**
 * Translation layer for forms and UI texts.
 *
 * Efficient by design:
 *   - ONE Gemini call per form and language (all texts of the form as a batch, structured JSON output)
 *   - cached in KV ("form:<id>:v<version>:<lang>") → every later request is instant and free
 *   - the original German form is never changed – the frontend only lays the translation over it
 */
import { generateJson } from "../ai/gemini";
import { modelIds } from "../config";
import { collectTexts, getForm } from "../shared/forms";
import { languageName } from "../shared/languages";
import { UI_STRINGS, UI_STRINGS_VERSION } from "../shared/ui-strings";

const CACHE_TTL_SECONDS = 60 * 60 * 24 * 30;
const BATCH_SIZE = 120;

export type TranslationResult = { lang: string; texts: Record<string, string>; cached: boolean };

function instructions(lang: string, purpose: "form" | "ui"): string {
	const easy = lang === "de-x-easy";
	const target = easy ? "German in Easy Read (Leichte Sprache)" : languageName(lang);
	return `You translate texts of the Austrian public administration from German into ${target}.
Rules:
- Translate every item. Keep the same "id". Return only the JSON.
- Keep translations about as short as the original – they are laid over ${purpose === "form" ? "the labels of a printed form" : "buttons and labels of a web app"}.
- Keep numbers, dates, placeholders like TT.MM.JJJJ (translate to the local date pattern only as a hint, e.g. "DD.MM.YYYY"), §-references and law abbreviations (MeldeG, FLAG, ZMR).
- For official Austrian terms without a real equivalent, add the German term in parentheses once, e.g. "Main residence (Hauptwohnsitz)", "registration form (Meldezettel)". This helps the citizen at the authority.
- Use a polite, clear register. ${easy ? "Easy Read: very short sentences, common words, explain difficult words." : "No slang."}
- Do not add, remove or reorder items. Do not invent content.`;
}

async function translateBatch(env: Env, items: { id: string; text: string }[], lang: string, purpose: "form" | "ui") {
	const result = await generateJson<{ translations: { id: string; text: string }[] }>(env, [modelIds(env).translate, ...modelIds(env).textFallbacks], {
		system: instructions(lang, purpose),
		prompt: JSON.stringify({ targetLanguage: lang, items }),
		schema: {
			type: "object",
			properties: {
				translations: {
					type: "array",
					items: { type: "object", properties: { id: { type: "string" }, text: { type: "string" } }, required: ["id", "text"] },
				},
			},
			required: ["translations"],
		},
		temperature: 0.1,
	});
	return result.translations ?? [];
}

/** Translates a map of texts. Missing items fall back to the original (never breaks the UI). */
export async function translateTexts(env: Env, texts: Record<string, string>, lang: string, purpose: "form" | "ui"): Promise<Record<string, string>> {
	const items = Object.entries(texts).map(([id, text]) => ({ id, text }));
	const batches: { id: string; text: string }[][] = [];
	for (let i = 0; i < items.length; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));
	const results = await Promise.all(batches.map((b) => translateBatch(env, b, lang, purpose)));
	const out: Record<string, string> = {};
	for (const t of results.flat()) if (t?.id in texts && typeof t.text === "string" && t.text.trim()) out[t.id] = t.text.trim();
	return out;
}

async function cached(env: Env, key: string, compute: () => Promise<Record<string, string>>): Promise<{ texts: Record<string, string>; cached: boolean }> {
	const hit = await env.CACHE.get<Record<string, string>>(key, "json").catch(() => null);
	if (hit) return { texts: hit, cached: true };
	const texts = await compute();
	// Only cache complete results.
	if (Object.keys(texts).length > 0) await env.CACHE.put(key, JSON.stringify(texts), { expirationTtl: CACHE_TTL_SECONDS }).catch(() => {});
	return { texts, cached: false };
}

export async function translateForm(env: Env, formId: string, lang: string): Promise<TranslationResult> {
	const form = getForm(formId);
	if (!form) throw new Error(`Unknown form "${formId}"`);
	const source = collectTexts(form);
	if (lang === "de") return { lang, texts: source, cached: true };
	const { texts, cached: wasCached } = await cached(env, `form:${form.id}:v${form.version}:${lang}`, () => translateTexts(env, source, lang, "form"));
	return { lang, texts, cached: wasCached };
}

/** UI texts for languages other than German and English (those two are maintained by hand). */
export async function translateUi(env: Env, lang: string): Promise<TranslationResult> {
	if (lang === "de" || lang === "en") return { lang, texts: UI_STRINGS[lang], cached: true };
	const { texts, cached: wasCached } = await cached(env, `ui:v${UI_STRINGS_VERSION}:${lang}`, () => translateTexts(env, UI_STRINGS.de, lang, "ui"));
	return { lang, texts: { ...UI_STRINGS.en, ...texts }, cached: wasCached };
}
