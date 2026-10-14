/**
 * Non-streaming version of the assistant, used by the evaluation endpoint (/api/evals/chat).
 * Same model, system prompt and tools as the live chat – but write tools and browser tools never execute.
 */
import { generateText, stepCountIs, type ModelMessage } from "ai";
import { getChatModel, MAX_STEPS } from "../config";
import { today } from "../gov/service";
import { DEFAULT_SETTINGS, type AssistantSettings } from "../shared/types";
import { buildSystemPrompt, loadCitizenContext } from "./system-prompt";
import { buildTools } from "./tools";

export type EvalTurn = { role: "user" | "assistant"; content: string };

export async function runAssistant(env: Env, turns: EvalTurn[], input: { personaId?: string; settings?: Partial<AssistantSettings> } = {}) {
	const settings = { ...DEFAULT_SETTINGS, ...input.settings };
	const citizenId = input.personaId ?? "lena-huber";
	const sessionId = `eval-${crypto.randomUUID().slice(0, 8)}`;
	const started = Date.now();
	const context = await loadCitizenContext(env, citizenId);

	const result = await generateText({
		model: await getChatModel(env, { app: "ida-evals", session: sessionId, persona: citizenId }),
		system: buildSystemPrompt({ settings, context, channel: "chat", today: today() }),
		messages: turns as ModelMessage[],
		tools: buildTools({ env, citizenId, sessionId, settings, mode: "eval" }),
		stopWhen: stepCountIs(MAX_STEPS),
		maxRetries: 1,
	});

	const toolCalls = result.steps.flatMap((step) =>
		step.toolCalls.map((call) => {
			const toolResult = step.toolResults.find((r) => r.toolCallId === call.toolCallId);
			return { tool: call.toolName, input: call.input, output: toolResult?.output };
		}),
	);

	return {
		sessionId,
		text: result.text,
		toolCalls,
		steps: result.steps.length,
		durationMs: Date.now() - started,
		usage: result.totalUsage,
	};
}
