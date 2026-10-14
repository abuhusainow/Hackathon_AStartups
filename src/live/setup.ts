/**
 * Gemini Live session setup (voice-to-voice and dictation).
 *
 * The browser connects DIRECTLY to Gemini Live (lowest latency) with a single-use ephemeral token.
 * The complete setup – model, system prompt, tools, voice – is locked into the token by the Worker,
 * so the API key never leaves the server and the client cannot change the instructions.
 */
import { buildSystemPrompt, type CitizenContext } from "../agent/system-prompt";
import { liveFunctionDeclarations } from "../agent/tools";
import { modelIds } from "../config";
import { today } from "../gov/service";
import type { AssistantSettings, FormState } from "../shared/types";

export type LiveMode = "voice" | "dictation";

export function buildLiveSetup(
	env: Env,
	input: { mode: LiveMode; settings: AssistantSettings; context: CitizenContext; formState: FormState | null; attempt?: number },
) {
	const ids = modelIds(env);
	// attempt 0 = primary model, 1.. = fallbacks (the browser retries when a model is overloaded)
	const voiceModels = [ids.live, ...ids.liveFallbacks];
	const liveModel = voiceModels[Math.min(input.attempt ?? 0, voiceModels.length - 1)];
	if (input.mode === "dictation") {
		return {
			model: `models/${ids.transcribe}`,
			generationConfig: { responseModalities: ["TEXT"] },
			inputAudioTranscription: {},
		};
	}
	return {
		model: `models/${liveModel}`,
		generationConfig: {
			responseModalities: ["AUDIO"],
			speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: ids.liveVoice } } },
		},
		systemInstruction: {
			parts: [
				{
					text: buildSystemPrompt({ settings: input.settings, context: input.context, formState: input.formState, channel: "voice", today: today() }),
				},
			],
		},
		tools: [{ functionDeclarations: liveFunctionDeclarations() }],
		// Live captions for both sides – essential for hard-of-hearing citizens, and the transcript feeds the memory.
		inputAudioTranscription: {},
		outputAudioTranscription: {},
		// Long conversations (filling a whole form) exceed the default context window.
		contextWindowCompression: { slidingWindow: {} },
	};
}
