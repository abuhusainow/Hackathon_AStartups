/**
 * Minimal Gemini Live API client (browser).
 * Protocol: https://ai.google.dev/gemini-api/docs/live
 *
 * The Worker hands out a single-use ephemeral token with the complete, locked session setup
 * (model, system prompt, tools, voice). The browser streams microphone audio and receives audio,
 * live transcriptions and tool calls.
 */
import { MicCapture, PcmPlayer } from "./audio";

export type FunctionCall = { id: string; name: string; args: Record<string, unknown> };

export type LiveEvents = {
	onStatus?: (status: LiveStatus) => void;
	/** Partial transcription of what the citizen says (delta, final for this part). */
	onInputTranscript?: (text: string) => void;
	/** Running (not yet final) transcription of the current utterance – replaces the previous one. */
	onInterimTranscript?: (text: string) => void;
	/** Partial transcription of what IDA says. */
	onOutputTranscript?: (text: string) => void;
	onModelText?: (text: string) => void;
	onTurnComplete?: () => void;
	onInterrupted?: () => void;
	onToolCall?: (calls: FunctionCall[]) => Promise<{ id: string; name: string; response: unknown }[]>;
	onLevel?: (level: number) => void;
	onError?: (error: Error) => void;
	onClose?: (reason: string) => void;
};

export type LiveStatus = "connecting" | "listening" | "speaking" | "thinking" | "closed";

export class GeminiLiveSession {
	private ws: WebSocket | null = null;
	private mic: MicCapture | null = null;
	private player: PcmPlayer | null = null;
	private levelTimer: number | null = null;
	private status: LiveStatus = "connecting";
	private closed = false;

	constructor(
		private opts: { wsUrl: string; token: string; model: string; audioOutput: boolean },
		private events: LiveEvents,
	) {}

	private setStatus(s: LiveStatus) {
		if (this.status === s) return;
		this.status = s;
		this.events.onStatus?.(s);
	}

	/** True when stop() was called (by the citizen) – used to suppress retries. */
	get ended(): boolean {
		return this.closed;
	}

	async start() {
		if (this.opts.audioOutput) {
			this.player = new PcmPlayer(24000);
			await this.player.resume();
		}
		await new Promise<void>((resolve, reject) => {
			const ws = new WebSocket(`${this.opts.wsUrl}?access_token=${encodeURIComponent(this.opts.token)}`);
			this.ws = ws;
			let setupDone = false;
			ws.onopen = () => ws.send(JSON.stringify({ setup: { model: this.opts.model } }));
			ws.onerror = () => {
				if (!setupDone) reject(new Error("WebSocket error"));
			};
			ws.onclose = (e) => {
				if (!setupDone) reject(new Error(e.reason || `Connection closed (${e.code})`));
				this.shutdown(e.reason || `closed ${e.code}`);
			};
			ws.onmessage = async (ev) => {
				const text = typeof ev.data === "string" ? ev.data : await (ev.data as Blob).text();
				let msg: Record<string, any>;
				try {
					msg = JSON.parse(text);
				} catch {
					return;
				}
				if (msg.setupComplete) {
					setupDone = true;
					resolve();
					return;
				}
				this.handle(msg);
			};
		});

		// The session may have been ended while connecting – never open the microphone then.
		if (this.closed) throw new Error("Session ended");
		this.mic = new MicCapture(
			(pcm) => this.send({ realtimeInput: { audio: { data: pcm, mimeType: "audio/pcm;rate=16000" } } }),
			(level) => {
				if (!this.player?.playing) this.events.onLevel?.(level);
			},
		);
		await this.mic.start();
		if (this.closed) {
			this.mic.stop();
			throw new Error("Session ended");
		}
		this.setStatus("listening");
		if (this.player) {
			this.levelTimer = window.setInterval(() => {
				if (this.player?.playing) {
					this.events.onLevel?.(this.player.level());
					this.setStatus("speaking");
				} else if (this.status === "speaking") this.setStatus("listening");
			}, 80);
		}
	}

	private handle(msg: Record<string, any>) {
		const sc = msg.serverContent;
		if (sc) {
			if (sc.interrupted) {
				this.player?.interrupt();
				this.events.onInterrupted?.();
			}
			if (sc.interimInputTranscription?.text) this.events.onInterimTranscript?.(sc.interimInputTranscription.text);
			if (sc.inputTranscription?.text) this.events.onInputTranscript?.(sc.inputTranscription.text);
			if (sc.outputTranscription?.text) this.events.onOutputTranscript?.(sc.outputTranscription.text);
			for (const part of sc.modelTurn?.parts ?? []) {
				if (part.inlineData?.data && this.player) this.player.play(part.inlineData.data);
				else if (part.text && !part.thought) this.events.onModelText?.(part.text);
			}
			if (sc.turnComplete) this.events.onTurnComplete?.();
		}
		if (msg.toolCall?.functionCalls?.length) {
			this.setStatus("thinking");
			const calls = msg.toolCall.functionCalls as FunctionCall[];
			Promise.resolve(this.events.onToolCall?.(calls) ?? [])
				.then((functionResponses) => {
					this.send({ toolResponse: { functionResponses } });
					this.setStatus("listening");
				})
				.catch((err) => this.events.onError?.(err));
		}
		if (msg.goAway) this.events.onError?.(new Error("The voice session is about to end (time limit)."));
	}

	/** Send text into the live session (e.g. "the form is now open"). */
	sendText(text: string) {
		this.send({ realtimeInput: { text } });
	}

	set muted(value: boolean) {
		if (this.mic) this.mic.muted = value;
		if (value) this.send({ realtimeInput: { audioStreamEnd: true } });
	}

	private send(payload: unknown) {
		if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
	}

	private shutdown(reason: string) {
		if (this.closed) return;
		this.closed = true;
		if (this.levelTimer) clearInterval(this.levelTimer);
		this.mic?.stop();
		this.player?.close();
		this.setStatus("closed");
		this.events.onClose?.(reason);
	}

	stop() {
		// Release the microphone first (synchronously), then close the connection.
		this.mic?.stop();
		try {
			this.send({ realtimeInput: { audioStreamEnd: true } });
			this.ws?.close(1000, "user ended");
		} catch {
			/* ignore */
		}
		this.shutdown("user ended");
	}
}
