/**
 * Audio plumbing for Gemini Live:
 *   MicCapture   microphone → 16 kHz PCM16 chunks (AudioWorklet, resampled in the worklet so it works
 *                in every browser regardless of the hardware sample rate) + input level
 *   PcmPlayer    24 kHz PCM16 chunks from Gemini → gapless playback queue, interruptible (barge-in)
 */

const WORKLET = `
class PcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / 16000;
    this.buffer = new Int16Array(1600); // 100 ms at 16 kHz
    this.length = 0;
    this.pos = 0;
  }
  process(inputs) {
    const input = inputs[0] && inputs[0][0];
    if (!input) return true;
    let sum = 0;
    for (let i = 0; i < input.length; i++) sum += input[i] * input[i];
    // Linear-interpolation resampling to 16 kHz
    while (this.pos < input.length) {
      const i = Math.floor(this.pos);
      const frac = this.pos - i;
      const a = input[i];
      const b = i + 1 < input.length ? input[i + 1] : a;
      const s = Math.max(-1, Math.min(1, a + (b - a) * frac));
      this.buffer[this.length++] = s < 0 ? s * 0x8000 : s * 0x7fff;
      if (this.length === this.buffer.length) {
        this.port.postMessage({ pcm: this.buffer.buffer.slice(0), level: Math.sqrt(sum / input.length) });
        this.length = 0;
      }
      this.pos += this.ratio;
    }
    this.pos -= input.length;
    return true;
  }
}
registerProcessor("pcm-capture", PcmCapture);
`;

export function bytesToBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	let binary = "";
	for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * Every microphone stream we open is registered here, so it can always be released –
 * even if a session is ended while the microphone is still starting (race conditions).
 */
const activeStreams = new Set<MediaStream>();

function stopStream(stream: MediaStream) {
	stream.getTracks().forEach((t) => t.stop());
	activeStreams.delete(stream);
}

/** Safety net: stop every microphone stream IDA opened (called when voice or dictation ends). */
export function releaseAllMicrophones() {
	for (const s of [...activeStreams]) stopStream(s);
}

export class MicCapture {
	private ctx: AudioContext | null = null;
	private stream: MediaStream | null = null;
	private node: AudioWorkletNode | null = null;
	/** Set by stop(); start() checks it after every await, so a late-arriving stream is closed at once. */
	private stopped = false;
	muted = false;

	constructor(
		private onChunk: (pcmBase64: string) => void,
		private onLevel: (level: number) => void = () => {},
	) {}

	async start() {
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
		});
		activeStreams.add(stream);
		if (this.stopped) return stopStream(stream);
		this.stream = stream;
		this.ctx = new AudioContext();
		const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
		await this.ctx.audioWorklet.addModule(url);
		URL.revokeObjectURL(url);
		if (this.stopped) return this.stop();
		const source = this.ctx.createMediaStreamSource(stream);
		this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
		this.node.port.onmessage = (e: MessageEvent<{ pcm: ArrayBuffer; level: number }>) => {
			if (this.muted || this.stopped) return this.onLevel(0);
			this.onLevel(e.data.level);
			this.onChunk(bytesToBase64(e.data.pcm));
		};
		source.connect(this.node);
	}

	stop() {
		this.stopped = true;
		this.node?.port.close();
		this.node?.disconnect();
		if (this.stream) stopStream(this.stream);
		this.ctx?.close().catch(() => {});
		this.node = null;
		this.stream = null;
		this.ctx = null;
	}
}

/** Records a short clip with MediaRecorder (dictation fallback when the Live API is unavailable). */
export async function recordClip(): Promise<{ stop: () => Promise<Blob>; cancel: () => void }> {
	const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
	activeStreams.add(stream);
	const rec = new MediaRecorder(stream);
	const chunks: Blob[] = [];
	rec.ondataavailable = (e) => chunks.push(e.data);
	rec.start();
	return {
		stop: () =>
			new Promise<Blob>((resolve) => {
				rec.onstop = () => {
					stopStream(stream);
					resolve(new Blob(chunks, { type: rec.mimeType }));
				};
				if (rec.state === "recording") rec.stop();
				else {
					stopStream(stream);
					resolve(new Blob(chunks, { type: rec.mimeType }));
				}
			}),
		cancel: () => {
			if (rec.state === "recording") rec.stop();
			stopStream(stream);
		},
	};
}

export class PcmPlayer {
	private ctx: AudioContext;
	private analyser: AnalyserNode;
	private nextTime = 0;
	private sources = new Set<AudioBufferSourceNode>();
	private levelData: Uint8Array<ArrayBuffer>;

	constructor(private sampleRate = 24000) {
		this.ctx = new AudioContext({ sampleRate });
		this.analyser = this.ctx.createAnalyser();
		this.analyser.fftSize = 256;
		this.analyser.connect(this.ctx.destination);
		this.levelData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
	}

	async resume() {
		if (this.ctx.state === "suspended") await this.ctx.resume();
	}

	/** Queue a base64 PCM16 chunk (little endian, mono). */
	play(b64: string) {
		const bytes = base64ToBytes(b64);
		const samples = new Int16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.byteLength / 2));
		const buffer = this.ctx.createBuffer(1, samples.length, this.sampleRate);
		const channel = buffer.getChannelData(0);
		for (let i = 0; i < samples.length; i++) channel[i] = samples[i] / 0x8000;
		const src = this.ctx.createBufferSource();
		src.buffer = buffer;
		src.connect(this.analyser);
		const start = Math.max(this.ctx.currentTime + 0.02, this.nextTime);
		src.start(start);
		this.nextTime = start + buffer.duration;
		this.sources.add(src);
		src.onended = () => this.sources.delete(src);
	}

	get playing(): boolean {
		return this.sources.size > 0;
	}

	/** Output level 0..1 (for the pulsing avatar). */
	level(): number {
		this.analyser.getByteTimeDomainData(this.levelData);
		let sum = 0;
		for (const v of this.levelData) sum += ((v - 128) / 128) ** 2;
		return Math.sqrt(sum / this.levelData.length);
	}

	/** Stop immediately (the citizen started talking – barge-in). */
	interrupt() {
		for (const s of this.sources) {
			try {
				s.stop();
			} catch {
				/* already stopped */
			}
		}
		this.sources.clear();
		this.nextTime = 0;
	}

	close() {
		this.interrupt();
		this.ctx.close().catch(() => {});
	}
}
