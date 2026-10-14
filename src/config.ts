/**
 * Central configuration: which model does what.
 *
 *   Chat (text)         Gemini (GEMINI_TEXT_MODEL) – fallback: Workers AI if no GEMINI_API_KEY is set
 *   Voice (live)        Gemini Live (GEMINI_LIVE_MODEL) – browser connects directly with an ephemeral token
 *   Dictation           Gemini Live transcription (GEMINI_TRANSCRIBE_MODEL)
 *   Translation         Gemini Flash-Lite (GEMINI_TRANSLATE_MODEL), cached in KV
 *   Memory decisions    "decision model": Claude (if ANTHROPIC_API_KEY) → Workers AI → Gemini
 *
 * Model ids are vars in wrangler.jsonc, so you can switch them without code changes.
 */
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { LanguageModel } from "ai";
import { createWorkersAI } from "workers-ai-provider";

/** Maximum number of model/tool steps per answer. */
export const MAX_STEPS = 10;

/** Display name of the assistant. */
export const ASSISTANT_NAME = "IDA";

export const GEMINI_API_BASE = "https://generativelanguage.googleapis.com";

const str = (v: unknown, fallback = "") => (typeof v === "string" && v.length > 0 ? v : fallback);

const list = (v: unknown, fallback: string) =>
	str(v, fallback)
		.split(",")
		.map((x) => x.trim())
		.filter(Boolean);

export function modelIds(env: Env) {
	return {
		text: str(env.GEMINI_TEXT_MODEL, "gemini-3.8-flash"),
		/** Tried in order when the primary model is overloaded (429/5xx). */
		textFallbacks: list(env.GEMINI_TEXT_FALLBACKS, "gemini-3.6-flash,gemini-3.1-flash-lite"),
		liveFallbacks: list(env.GEMINI_LIVE_FALLBACKS, "gemini-2.5-flash-native-audio-latest"),
		live: str(env.GEMINI_LIVE_MODEL, "gemini-3.8-live"),
		transcribe: str(env.GEMINI_TRANSCRIBE_MODEL, "gemini-3.5-transcribe-live"),
		translate: str(env.GEMINI_TRANSLATE_MODEL, "gemini-3.5-flash-lite"),
		liveVoice: str(env.GEMINI_LIVE_VOICE, "Kore"),
		claude: str(env.CLAUDE_MODEL, "claude-sonnet-5-5"),
		workersAi: str(env.WORKERS_AI_MODEL, "@cf/zai-org/glm-4.7-flash"),
	};
}

export function hasGemini(env: Env): boolean {
	return str(env.GEMINI_API_KEY).length > 0;
}

function useGateway(env: Env): boolean {
	return str(env.ROUTE_VIA_AI_GATEWAY) === "true" && str(env.AI_GATEWAY_ID).length > 0;
}

/** Base URL of a provider: direct, or through Cloudflare AI Gateway (logs every call). */
async function providerBaseUrl(env: Env, provider: "google-ai-studio" | "anthropic"): Promise<string | undefined> {
	if (!useGateway(env)) return undefined;
	try {
		const url = await env.AI.gateway(str(env.AI_GATEWAY_ID)).getUrl(provider);
		return provider === "google-ai-studio" ? `${url.replace(/\/$/, "")}/v1beta` : `${url.replace(/\/$/, "")}/v1`;
	} catch (err) {
		console.warn(`[config] AI Gateway URL for ${provider} unavailable, calling the provider directly`, err);
		return undefined;
	}
}

function workersAiModel(env: Env, metadata: Record<string, string>): LanguageModel {
	const gatewayId = str(env.AI_GATEWAY_ID);
	const workersai = createWorkersAI({ binding: env.AI, ...(gatewayId ? { gateway: { id: gatewayId, metadata } } : {}) });
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	return workersai(modelIds(env).workersAi as any);
}

function errorStatus(err: unknown): number | undefined {
	const e = err as { statusCode?: number; lastError?: unknown };
	if (e?.lastError) return errorStatus(e.lastError);
	return typeof e?.statusCode === "number" ? e.statusCode : undefined;
}

function isOverloaded(err: unknown): boolean {
	const e = err as { isRetryable?: boolean; lastError?: unknown };
	if (e?.lastError) return isOverloaded(e.lastError);
	return e?.isRetryable === true || [408, 429, 500, 502, 503, 504].includes(Number(errorStatus(err)));
}

/** Circuit breaker: models that just failed are skipped for a while (quota → 5 min, overload → 30 s). */
const unhealthyUntil = new Map<string, number>();

/**
 * Wraps several models of the SAME provider into one: if a model is overloaded (429 / 5xx),
 * the next one is tried. Gemini models occasionally answer "high demand" – citizens should not notice.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withFallback(models: any[]): LanguageModel {
	const [primary] = models;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const call = async (method: "doGenerate" | "doStream", options: any) => {
		const now = Date.now();
		const healthy = models.filter((m) => (unhealthyUntil.get(m.modelId) ?? 0) < now);
		const order = healthy.length ? healthy : models;
		let lastError: unknown;
		for (const m of order) {
			try {
				return await m[method](options);
			} catch (err) {
				lastError = err;
				if (!isOverloaded(err)) throw err;
				const status = errorStatus(err);
				unhealthyUntil.set(m.modelId, Date.now() + (status === 429 ? 300_000 : 30_000));
				console.warn(`[model] ${m.modelId} unavailable (${status ?? "error"}), trying the next model`);
			}
		}
		throw lastError;
	};
	return {
		specificationVersion: primary.specificationVersion,
		provider: primary.provider,
		modelId: primary.modelId,
		get supportedUrls() {
			return primary.supportedUrls;
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		doGenerate: (options: any) => call("doGenerate", options),
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		doStream: (options: any) => call("doStream", options),
	} as LanguageModel;
}

async function geminiWithFallback(env: Env): Promise<LanguageModel> {
	const google = createGoogleGenerativeAI({ apiKey: env.GEMINI_API_KEY, baseURL: await providerBaseUrl(env, "google-ai-studio") });
	const ids = modelIds(env);
	return withFallback([ids.text, ...ids.textFallbacks].map((id) => google(id)));
}

/** The chat model (text chat with tools). */
export async function getChatModel(env: Env, metadata: Record<string, string> = {}): Promise<LanguageModel> {
	if (!hasGemini(env)) return workersAiModel(env, metadata);
	return geminiWithFallback(env);
}

export type DecisionProvider = "claude" | "workers-ai" | "gemini";

export function decisionProvider(env: Env): DecisionProvider {
	const configured = str(env.MEMORY_PROVIDER, "auto");
	if (configured === "claude" || (configured === "auto" && str(env.ANTHROPIC_API_KEY))) return "claude";
	if (configured === "gemini" && hasGemini(env)) return "gemini";
	return "workers-ai";
}

/**
 * The "decision model": decides what is worth remembering about the citizen.
 * Runs in the background after each conversation turn, so latency matters less than judgement.
 */
export async function getDecisionModel(env: Env, metadata: Record<string, string> = {}): Promise<{ model: LanguageModel; provider: DecisionProvider }> {
	const provider = decisionProvider(env);
	if (provider === "claude") {
		const anthropic = createAnthropic({ apiKey: env.ANTHROPIC_API_KEY, baseURL: await providerBaseUrl(env, "anthropic") });
		return { model: anthropic(modelIds(env).claude), provider };
	}
	if (provider === "gemini") return { model: await geminiWithFallback(env), provider };
	return { model: workersAiModel(env, { ...metadata, purpose: "memory" }), provider };
}
