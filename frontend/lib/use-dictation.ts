/**
 * Inline dictation: streams the microphone to Gemini Live transcription and hands the text dictated
 * so far to `onText` – directly into the chat input or a form field (no extra window).
 * The model sends a running "interim" text for the current utterance (it may still change) and a
 * final text per utterance; `onText` always receives final parts + current interim part.
 *
 * - One dictation at a time; start() while recording stops the previous one.
 * - Every start gets its own session object + generation number, so a late async step of an old
 *   start (or React StrictMode double effects) can never keep a microphone open.
 * - Fallback when the Live API is unavailable: record a clip, transcribe it on stop (/api/transcribe).
 * - Stops automatically when the citizen stops talking (short pause after the last words), after
 *   2 minutes, or when the tab is hidden. The dictated text stays in the field, ready to edit/send.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { AssistantSettings } from "../../src/shared/types";
import { api } from "../api";
import { bytesToBase64, recordClip, releaseAllMicrophones } from "./audio";
import { GeminiLiveSession } from "./gemini-live";

export type DictationState = "idle" | "connecting" | "recording" | "transcribing";

export type DictationTarget = { kind: "chat" } | { kind: "field"; fieldId: string };

const MAX_MS = 120_000;
/** Pause after the last recognised words that ends the dictation. */
const SILENCE_MS = 2200;
/** Nothing said at all → stop. */
const NO_SPEECH_MS = 10_000;

export function useDictation(getSettings: () => AssistantSettings, onError: (message: string) => void) {
	const [state, setState] = useState<DictationState>("idle");
	const [target, setTarget] = useState<DictationTarget | null>(null);
	const [level, setLevel] = useState(0);
	const generation = useRef(0);
	const stopCurrent = useRef<(() => Promise<void>) | null>(null);

	const stop = useCallback(async () => {
		generation.current++;
		const fn = stopCurrent.current;
		stopCurrent.current = null;
		setLevel(0);
		if (fn) await fn();
		releaseAllMicrophones();
		setState("idle");
		setTarget(null);
	}, []);

	const start = useCallback(
		async (newTarget: DictationTarget, onText: (textSoFar: string) => void) => {
			await stop();
			const gen = ++generation.current;
			const current = () => gen === generation.current;
			setTarget(newTarget);
			setState("connecting");
			const timer = window.setTimeout(() => current() && void stop(), MAX_MS);

			try {
				const tok = await api.liveToken("dictation", getSettings(), null);
				if (!current()) return;
				let committed = "";
				let interim = "";
				// Silence detection: every recognised text (re)arms the timer.
				let silenceTimer = window.setTimeout(() => current() && void stop(), NO_SPEECH_MS);
				const heardSomething = () => {
					clearTimeout(silenceTimer);
					silenceTimer = window.setTimeout(() => current() && void stop(), SILENCE_MS);
				};
				const joinText = (a: string, b: string) => (a && b && !/\s$/.test(a) && !/^\s/.test(b) ? `${a} ${b}` : a + b);
				const session = new GeminiLiveSession(
					{ wsUrl: tok.wsUrl, token: tok.token, model: tok.model, audioOutput: false },
					{
						onInterimTranscript: (text) => {
							if (!current()) return;
							heardSomething();
							interim = text;
							onText(joinText(committed, interim));
						},
						onInputTranscript: (chunk) => {
							if (!current()) return;
							heardSomething();
							committed = joinText(committed, chunk.trim());
							interim = "";
							onText(committed);
						},
						onLevel: (l) => current() && setLevel(l),
						onClose: () => current() && void stop(),
					},
				);
				stopCurrent.current = async () => {
					clearTimeout(timer);
					clearTimeout(silenceTimer);
					session.stop();
				};
				await session.start();
				if (!current()) return session.stop();
				setState("recording");
			} catch (err) {
				if (!current()) return;
				const message = (err as Error).message;
				if (/denied|NotAllowed|NotFound/i.test(message)) {
					onError(message);
					return stop();
				}
				// Fallback: record locally, transcribe in one request when the citizen stops.
				try {
					const clip = await recordClip();
					if (!current()) return clip.cancel();
					stopCurrent.current = async () => {
						clearTimeout(timer);
						setState("transcribing");
						const blob = await clip.stop();
						const settings = getSettings();
						const res = await api.transcribe(bytesToBase64(await blob.arrayBuffer()), blob.type.split(";")[0] || "audio/webm", settings.language);
						if (res.text) onText(res.text);
					};
					setState("recording");
				} catch (e2) {
					onError((e2 as Error).message);
					void stop();
				}
			}
		},
		[getSettings, onError, stop],
	);

	// Stop when the tab is hidden or the component unmounts – never leave the microphone open.
	useEffect(() => {
		const onHide = () => document.hidden && void stop();
		document.addEventListener("visibilitychange", onHide);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			void stop();
		};
	}, [stop]);

	return { state, target, level, start, stop, active: state !== "idle" };
}
