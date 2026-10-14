/**
 * The text chat agent. One instance (a Durable Object with its own SQLite) per citizen session:
 * it stores the conversation and the session settings, and streams answers to the browser.
 *
 * The instance name is "<personaId>--<sessionId>". The Worker only routes a WebSocket to an instance
 * whose persona matches the verified ID Austria session cookie (see src/index.ts), so the citizen id
 * derived from the name can be trusted.
 *
 * Docs: https://developers.cloudflare.com/agents/examples/chat-agent/
 */
import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { convertToModelMessages, pruneMessages, stepCountIs, streamText, type UIMessage } from "ai";
import { personaFromAgentName } from "../auth/session";
import { getChatModel, MAX_STEPS } from "../config";
import { today } from "../gov/service";
import { runMemoryDecision, type TranscriptTurn } from "../memory/extract";
import { isValidLanguageCode } from "../shared/languages";
import { DEFAULT_SETTINGS, type AssistantSettings, type FormState } from "../shared/types";
import { buildSystemPrompt, loadCitizenContext } from "./system-prompt";
import { buildTools } from "./tools";

/** Plain-text transcript of UI messages (for the memory decision model). */
export function transcriptOf(messages: UIMessage[]): TranscriptTurn[] {
	return messages
		.filter((m) => m.role === "user" || m.role === "assistant")
		.map((m) => ({
			role: m.role as "user" | "assistant",
			text: m.parts
				.map((p) => (p.type === "text" ? p.text : ""))
				.join(" ")
				.trim(),
		}))
		.filter((t) => t.text);
}

function parseFormState(raw: unknown): FormState | null {
	if (!raw || typeof raw !== "object") return null;
	const s = raw as Partial<FormState>;
	if (typeof s.formId !== "string" || typeof s.values !== "object" || s.values === null) return null;
	return {
		formId: s.formId,
		applicationId: typeof s.applicationId === "string" ? s.applicationId : null,
		values: Object.fromEntries(Object.entries(s.values).filter(([, v]) => typeof v === "string")) as Record<string, string>,
		missing: Array.isArray(s.missing) ? s.missing.filter((x): x is string => typeof x === "string") : [],
		translatedTo: typeof s.translatedTo === "string" ? s.translatedTo : null,
		focusedField: typeof s.focusedField === "string" ? s.focusedField : null,
	};
}

export class CitizenAssistant extends AIChatAgent<Env, AssistantSettings> {
	// Settings synced with the frontend (language, text size, contrast, easy language, voice).
	initialState: AssistantSettings = DEFAULT_SETTINGS;

	get citizenId(): string {
		return personaFromAgentName(this.name);
	}

	// Reject invalid settings sent by a client.
	validateStateChange(next: AssistantSettings) {
		if (!isValidLanguageCode(next.language)) throw new Error("invalid language code");
		if (typeof next.textScale !== "number" || next.textScale < 1 || next.textScale > 2) throw new Error("textScale must be between 1 and 2");
		if (next.contrast !== "normal" && next.contrast !== "high") throw new Error("contrast must be normal or high");
	}

	async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
		const settings = { ...DEFAULT_SETTINGS, ...this.state };
		const citizenId = this.citizenId;
		const formState = parseFormState(options?.body?.formState);
		const context = await loadCitizenContext(this.env, citizenId);
		const metadata = { app: "ida-chat", session: this.name, persona: citizenId };

		const result = streamText({
			model: await getChatModel(this.env, metadata),
			system: buildSystemPrompt({ settings, context, formState, channel: "chat", today: today() }),
			messages: pruneMessages({
				messages: await convertToModelMessages(this.messages),
				toolCalls: "before-last-4-messages",
			}),
			tools: buildTools({ env: this.env, citizenId, sessionId: this.name, settings, mode: "chat" }),
			stopWhen: stepCountIs(MAX_STEPS),
			maxRetries: 1, // model fallbacks are handled in getChatModel
			onError: ({ error }) => console.error("[agent error]", error),
			onFinish: ({ text }) => {
				// Background: let the decision model update the long-term memory.
				const transcript = transcriptOf(this.messages).slice(-8);
				if (text) transcript.push({ role: "assistant", text });
				this.ctx.waitUntil(
					runMemoryDecision(this.env, { citizenId, sessionId: this.name, transcript, source: "chat" }).catch((err) =>
						console.error("[memory error]", err),
					),
				);
			},
		});

		return result.toUIMessageStreamResponse();
	}
}
