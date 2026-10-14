/**
 * Thin REST helpers for the Gemini API (things the AI SDK does not cover: ephemeral tokens for the
 * Live API, structured JSON output with a JSON schema, audio transcription).
 * Docs: https://ai.google.dev/gemini-api/docs
 */
import { GEMINI_API_BASE } from "../config";

export class GeminiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function geminiFetch<T>(env: Env, path: string, body: unknown): Promise<T> {
	if (!env.GEMINI_API_KEY) throw new GeminiError(503, "GEMINI_API_KEY is not configured");
	const res = await fetch(`${GEMINI_API_BASE}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
		body: JSON.stringify(body),
	});
	if (!res.ok) {
		const text = await res.text();
		throw new GeminiError(res.status, `Gemini ${path} failed (${res.status}): ${text.slice(0, 500)}`);
	}
	return res.json() as Promise<T>;
}

type GenerateResponse = { candidates?: { content?: { parts?: { text?: string }[] } }[] };

/** Models that just failed are skipped for a while (circuit breaker). */
const skipUntil = new Map<string, number>();

/** Generates JSON that follows `schema` (JSON Schema). `models` are tried in order if one is overloaded. */
export async function generateJson<T>(
	env: Env,
	models: string | string[],
	opts: { system?: string; prompt: string; schema: Record<string, unknown>; temperature?: number },
): Promise<T> {
	const all = Array.isArray(models) ? models : [models];
	const healthy = all.filter((m) => (skipUntil.get(m) ?? 0) < Date.now());
	let lastError: unknown;
	for (const model of healthy.length ? healthy : all) {
		try {
			return await generateJsonOnce<T>(env, model, opts);
		} catch (err) {
			lastError = err;
			if (!(err instanceof GeminiError) || ![429, 500, 502, 503, 504].includes(err.status)) throw err;
			skipUntil.set(model, Date.now() + (err.status === 429 ? 300_000 : 30_000));
			console.warn(`[gemini] ${model} unavailable (${err.status}), trying the next model`);
		}
	}
	throw lastError;
}

async function generateJsonOnce<T>(
	env: Env,
	model: string,
	opts: { system?: string; prompt: string; schema: Record<string, unknown>; temperature?: number },
): Promise<T> {
	const data = await geminiFetch<GenerateResponse>(env, `/v1beta/models/${model}:generateContent`, {
		...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
		contents: [{ role: "user", parts: [{ text: opts.prompt }] }],
		generationConfig: {
			responseMimeType: "application/json",
			responseJsonSchema: opts.schema,
			temperature: opts.temperature ?? 0.2,
		},
	});
	const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
	try {
		return JSON.parse(text) as T;
	} catch {
		throw new GeminiError(502, `Gemini returned invalid JSON: ${text.slice(0, 200)}`);
	}
}

/** Transcribes a short audio clip (fallback for dictation when the Live API is unavailable). */
export async function transcribeAudio(env: Env, model: string, audioBase64: string, mimeType: string, languageHint?: string) {
	const data = await geminiFetch<GenerateResponse>(env, `/v1beta/models/${model}:generateContent`, {
		contents: [
			{
				role: "user",
				parts: [
					{ inlineData: { mimeType, data: audioBase64 } },
					{
						text: `Transcribe this audio verbatim${languageHint ? ` (the speaker probably uses language "${languageHint}")` : ""}. Return only the transcript, no comments.`,
					},
				],
			},
		],
	});
	return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("").trim() ?? "";
}

/**
 * Creates a single-use ephemeral token for the Gemini Live API.
 * The whole session config (model, system prompt, tools, voice) is locked into the token, so the
 * browser never sees the API key and cannot change the configuration.
 * Docs: https://ai.google.dev/gemini-api/docs/ephemeral-tokens
 */
export async function createLiveToken(env: Env, setup: Record<string, unknown>, opts: { expireMinutes?: number; newSessionSeconds?: number } = {}) {
	const now = Date.now();
	const expireTime = new Date(now + (opts.expireMinutes ?? 30) * 60_000).toISOString();
	const newSessionExpireTime = new Date(now + (opts.newSessionSeconds ?? 90) * 1000).toISOString();
	const token = await geminiFetch<{ name: string }>(env, "/v1alpha/auth_tokens", {
		uses: 1,
		expireTime,
		newSessionExpireTime,
		bidiGenerateContentSetup: setup,
	});
	return { token: token.name, expireTime };
}

export const LIVE_WS_URL =
	"wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContentConstrained";

// ---------------------------------------------------------------------------------------------
// JSON Schema (from zod) -> Gemini function declaration schema (OpenAPI subset)
// ---------------------------------------------------------------------------------------------

type JsonSchema = {
	type?: string | string[];
	description?: string;
	properties?: Record<string, JsonSchema>;
	required?: string[];
	items?: JsonSchema;
	enum?: unknown[];
	anyOf?: JsonSchema[];
	additionalProperties?: boolean | JsonSchema;
	[key: string]: unknown;
};

/**
 * Converts a JSON Schema (as produced by `z.toJSONSchema`) into the schema format of Gemini function
 * declarations: upper-case types, no $schema / additionalProperties, nullable instead of type arrays.
 * Records (`z.record`) become an OBJECT without fixed properties.
 */
export function toGeminiSchema(schema: JsonSchema): Record<string, unknown> {
	if (schema.anyOf?.length) {
		const nonNull = schema.anyOf.filter((s) => s.type !== "null");
		const base = toGeminiSchema(nonNull[0] ?? {});
		return { ...base, ...(nonNull.length < schema.anyOf.length ? { nullable: true } : {}), ...(schema.description ? { description: schema.description } : {}) };
	}
	let type = Array.isArray(schema.type) ? schema.type.find((t) => t !== "null") : schema.type;
	const nullable = Array.isArray(schema.type) && schema.type.includes("null");
	if (!type) type = schema.properties ? "object" : "string";
	const out: Record<string, unknown> = { type: type.toUpperCase() };
	if (schema.description) out.description = schema.description;
	if (nullable) out.nullable = true;
	if (schema.enum) out.enum = schema.enum.map(String);
	if (type === "object") {
		const props = schema.properties ?? {};
		if (Object.keys(props).length > 0) {
			out.properties = Object.fromEntries(Object.entries(props).map(([k, v]) => [k, toGeminiSchema(v)]));
			if (schema.required?.length) out.required = schema.required;
		}
	}
	if (type === "array" && schema.items) out.items = toGeminiSchema(schema.items);
	return out;
}
