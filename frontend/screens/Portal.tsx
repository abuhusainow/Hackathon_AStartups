/**
 * The citizen portal after the ID Austria login:
 *   - text chat with IDA (Agents SDK WebSocket, Gemini)
 *   - Gemini Live voice-to-voice dialog with live captions
 *   - dictation window (chat input or any form field)
 *   - the interactive form panel on the right, resizable split view (tabs on mobile)
 *   - accessibility settings that are synced to the agent and remembered
 */
import { useAgentChat } from "@cloudflare/ai-chat/react";
import type { UIMessage } from "ai";
import { useAgent } from "agents/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getForm } from "../../src/shared/forms";
import { languageDir } from "../../src/shared/languages";
import { isServerTool } from "../../src/shared/tool-names";
import { DEFAULT_SETTINGS, type AssistantSettings } from "../../src/shared/types";
import { api, type Me } from "../api";
import { ConfirmBookingDialog, ConfirmSubmissionDialog, DictationDialog } from "../components/Dialogs";
import { FormPanel } from "../components/FormPanel";
import { Header } from "../components/Header";
import { MessageList, type VoiceTurn } from "../components/Messages";
import { useUi } from "../i18n";
import { GeminiLiveSession, type LiveStatus } from "../lib/gemini-live";
import { createClientToolExecutor, formStateSnapshot, formStore, setFieldByCitizen, useFormStore } from "../lib/form-store";

type Confirm = { kind: "submit" } | { kind: "book"; slotLabel: string };
type DictationTarget = { kind: "chat" } | { kind: "field"; fieldId: string; label: string };

const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024;

function speechLang(lang: string) {
	return lang === "de-x-easy" ? "de-AT" : lang;
}

export function Portal({ me, onLogout }: { me: Me; onLogout: () => void }) {
	const [settings, setSettings] = useState<AssistantSettings>(() => ({ ...DEFAULT_SETTINGS, ...me.preferences }));
	const [readAloud, setReadAloud] = useState(() => !!me.profile.accessibility.vision || me.memory.some((m) => m.key === "read_aloud" && m.value === "true"));
	const { t } = useUi(settings.language);
	const form = useFormStore();
	const [input, setInput] = useState("");
	const [attachment, setAttachment] = useState<{ name: string; mediaType: string; url: string } | null>(null);
	const [confirm, setConfirm] = useState<Confirm | null>(null);
	const confirmResolver = useRef<((v: boolean) => void) | null>(null);
	const [dictation, setDictation] = useState<DictationTarget | null>(null);
	const [toast, setToast] = useState<string | null>(null);
	const [chatWidth, setChatWidth] = useState(() => Number(localStorage.getItem("ida-chat-width")) || 40);
	const [tab, setTab] = useState<"chat" | "form">("chat");
	const [liveStatus, setLiveStatus] = useState<LiveStatus | null>(null);
	const [voiceTurns, setVoiceTurns] = useState<VoiceTurn[]>([]);
	const [memoryVersion, setMemoryVersion] = useState(0);
	const liveRef = useRef<GeminiLiveSession | null>(null);
	const voiceTurnsRef = useRef<VoiceTurn[]>([]);
	const workspaceRef = useRef<HTMLDivElement>(null);
	const messagesRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const settingsRef = useRef(settings);
	settingsRef.current = settings;
	voiceTurnsRef.current = voiceTurns;

	// ---------------------------------------------------------------------------------------------
	// Settings → document (text size, contrast, language, direction) and → agent
	// ---------------------------------------------------------------------------------------------

	const agent = useAgent<AssistantSettings>({ agent: "CitizenAssistant", name: me.agentName });

	useEffect(() => {
		const root = document.documentElement;
		root.style.setProperty("--text-scale", String(settings.textScale));
		root.dataset.contrast = settings.contrast;
		if (settings.textScale > 1.25) root.dataset.largeText = "";
		else delete root.dataset.largeText;
		root.lang = settings.language === "de-x-easy" ? "de" : settings.language;
		root.dir = languageDir(settings.language);
		document.title = `IDA · ${t("idaBadge")}`;
		agent.setState(settings);
	}, [settings, agent, t]);

	const showToast = useCallback((text: string) => {
		setToast(text);
		window.setTimeout(() => setToast(null), 3500);
	}, []);

	const applySettings = useCallback(
		(patch: Partial<AssistantSettings> & { readAloud?: boolean }) => {
			const { readAloud: ra, ...rest } = patch;
			if (typeof ra === "boolean") setReadAloud(ra);
			if (Object.keys(rest).length) setSettings((s) => ({ ...s, ...rest }));
		},
		[],
	);

	const askConfirm = useCallback(
		(c: Confirm) =>
			new Promise<boolean>((resolve) => {
				confirmResolver.current = resolve;
				setConfirm(c);
			}),
		[],
	);

	const decide = (v: boolean) => {
		confirmResolver.current?.(v);
		confirmResolver.current = null;
		setConfirm(null);
	};

	// One executor for the AI's browser tools – shared by text chat and voice.
	const runClientTool = useMemo(
		() =>
			createClientToolExecutor({
				getProfile: () => me.profile,
				getSettings: () => settingsRef.current,
				applySettings: (p) => {
					applySettings(p);
					showToast(t("settingsApplied"));
				},
				confirmSubmission: () => askConfirm({ kind: "submit" }),
				confirmBooking: (slot) => askConfirm({ kind: "book", slotLabel: slot.slotLabel }),
				notify: showToast,
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[me.profile],
	);

	// ---------------------------------------------------------------------------------------------
	// Text chat
	// ---------------------------------------------------------------------------------------------

	const { messages, sendMessage, status, stop, setMessages, clearHistory, error, regenerate } = useAgentChat({
		agent,
		body: () => ({ formState: formStateSnapshot() }),
		onToolCall: async ({ toolCall, addToolOutput }) => {
			const output = await runClientTool(toolCall.toolName, (toolCall.input ?? {}) as Record<string, unknown>);
			console.info("[client-tool]", toolCall.toolName, JSON.stringify(toolCall.input), "→", JSON.stringify(output).slice(0, 400));
			addToolOutput({ toolCallId: toolCall.toolCallId, output });
		},
	});
	const busy = status === "submitted" || status === "streaming";

	useEffect(() => {
		messagesRef.current?.scrollTo({ top: messagesRef.current.scrollHeight, behavior: "smooth" });
	}, [messages, voiceTurns]);

	// Read answers aloud (accessibility setting / memory) when a text answer is complete.
	const spokenRef = useRef<string | null>(null);
	useEffect(() => {
		if (!readAloud || busy || liveStatus || !("speechSynthesis" in window)) return;
		const last = messages[messages.length - 1];
		if (!last || last.role !== "assistant" || spokenRef.current === last.id) return;
		spokenRef.current = last.id;
		const text = last.parts.map((p) => (p.type === "text" ? p.text : "")).join(" ").replace(/[*#_`]/g, "");
		if (!text.trim()) return;
		const u = new SpeechSynthesisUtterance(text);
		u.lang = speechLang(settings.language);
		window.speechSynthesis.cancel();
		window.speechSynthesis.speak(u);
	}, [messages, busy, readAloud, liveStatus, settings.language]);

	// Memory panel refresh after each answer (the decision model runs in the background).
	useEffect(() => {
		if (status === "ready" && messages.length) {
			const id = window.setTimeout(() => setMemoryVersion((v) => v + 1), 4000);
			return () => clearTimeout(id);
		}
	}, [status, messages.length]);

	function send(text: string) {
		const trimmed = text.trim();
		if (!trimmed && !attachment) return;
		if (liveRef.current) {
			liveRef.current.sendText(trimmed);
			appendVoice("user", trimmed, true);
			setInput("");
			return;
		}
		if (attachment) {
			sendMessage({
				text: trimmed || t("attachmentAdded", { name: attachment.name }),
				files: [{ type: "file", mediaType: attachment.mediaType, url: attachment.url, filename: attachment.name }],
			});
			setAttachment(null);
		} else sendMessage({ text: trimmed });
		setInput("");
	}

	function onAttach(file: File | undefined) {
		if (!file) return;
		if (file.size > MAX_ATTACHMENT_BYTES) {
			showToast(`${file.name}: max. 4 MB`);
			return;
		}
		const reader = new FileReader();
		reader.onload = () => setAttachment({ name: file.name, mediaType: file.type || "application/octet-stream", url: String(reader.result) });
		reader.readAsDataURL(file);
	}

	// ---------------------------------------------------------------------------------------------
	// Live voice (Gemini Live)
	// ---------------------------------------------------------------------------------------------

	function appendVoice(role: "user" | "assistant", chunk: string, final = false) {
		setVoiceTurns((prev) => {
			const last = prev[prev.length - 1];
			if (last && last.role === role && !last.final) return [...prev.slice(0, -1), { ...last, text: last.text + chunk, final }];
			const closed = last && !last.final ? [...prev.slice(0, -1), { ...last, final: true }] : prev;
			return [...closed, { role, text: chunk, final }];
		});
	}

	async function startLive(attempt = 0): Promise<void> {
		if (liveRef.current) return;
		window.speechSynthesis?.cancel();
		setLiveStatus("connecting");
		try {
			const tok = await api.liveToken("voice", settingsRef.current, formStateSnapshot(), attempt);
			const session = new GeminiLiveSession(
				{ wsUrl: tok.wsUrl, token: tok.token, model: tok.model, audioOutput: true },
				{
					onStatus: setLiveStatus,
					onInputTranscript: (text) => appendVoice("user", text),
					onOutputTranscript: (text) => appendVoice("assistant", text),
					onTurnComplete: () => setVoiceTurns((prev) => prev.map((v) => ({ ...v, final: true }))),
					onLevel: (level) => document.documentElement.style.setProperty("--voice-level", String(1 + Math.min(0.35, level * 3))),
					onToolCall: (calls) =>
						Promise.all(
							calls.map(async (c) => {
								const response = isServerTool(c.name)
									? await api.serverTool(c.name, c.args, settingsRef.current).catch((e) => ({ error: (e as Error).message }))
									: { result: await runClientTool(c.name, c.args ?? {}) };
								return { id: c.id, name: c.name, response };
							}),
						),
					onError: (err) => showToast(err.message),
					onClose: () => finishLive(),
				},
			);
			liveRef.current = session;
			await session.start();
		} catch (err) {
			const message = (err as Error).message;
			const micProblem = /denied|NotAllowed|NotFound/i.test(message);
			liveRef.current?.stop();
			liveRef.current = null;
			// The voice model may be overloaded – try the fallback model once.
			if (!micProblem && attempt === 0) return startLive(1);
			showToast(micProblem ? t("micDenied") : `${t("liveError")} ${message}`);
			setLiveStatus(null);
		}
	}

	function finishLive() {
		if (!liveRef.current && !voiceTurnsRef.current.length) {
			setLiveStatus(null);
			return;
		}
		liveRef.current = null;
		setLiveStatus(null);
		document.documentElement.style.setProperty("--voice-level", "1");
		const turns = voiceTurnsRef.current.filter((v) => v.text.trim());
		if (turns.length) {
			// Keep the voice conversation in the chat history (the text agent sees it, too) …
			const voiceMessages: UIMessage[] = turns.map((v) => ({
				id: crypto.randomUUID(),
				role: v.role,
				metadata: { voice: true },
				parts: [{ type: "text", text: v.text.trim() }],
			}));
			setMessages((prev) => [...prev, ...voiceMessages]);
			// … and let the decision model update the memory.
			api.ingestTranscript(turns.map((v) => ({ role: v.role, text: v.text.trim() }))).then(() =>
				window.setTimeout(() => setMemoryVersion((x) => x + 1), 5000),
			);
		}
		setVoiceTurns([]);
	}

	function stopLive() {
		liveRef.current?.stop();
	}

	const [muted, setMuted] = useState(false);
	useEffect(() => {
		if (liveRef.current) liveRef.current.muted = muted;
	}, [muted]);

	useEffect(() => () => liveRef.current?.stop(), []);

	// ---------------------------------------------------------------------------------------------
	// Form panel, split view
	// ---------------------------------------------------------------------------------------------

	const formOpen = !!form.formId;
	useEffect(() => {
		if (formOpen && window.matchMedia("(max-width: 900px)").matches) setTab("form");
		if (!formOpen) setTab("chat");
	}, [form.revealTick, formOpen]);

	useEffect(() => {
		localStorage.setItem("ida-chat-width", String(chatWidth));
	}, [chatWidth]);

	function onSplitterPointer(e: React.PointerEvent<HTMLButtonElement>) {
		const el = e.currentTarget;
		el.setPointerCapture(e.pointerId);
		const move = (ev: PointerEvent) => {
			const rect = workspaceRef.current?.getBoundingClientRect();
			if (!rect) return;
			const pct = ((ev.clientX - rect.left) / rect.width) * 100;
			setChatWidth(Math.round(Math.min(65, Math.max(25, languageDir(settings.language) === "rtl" ? 100 - pct : pct))));
		};
		const up = () => {
			el.removeEventListener("pointermove", move);
			el.removeEventListener("pointerup", up);
		};
		el.addEventListener("pointermove", move);
		el.addEventListener("pointerup", up);
	}

	async function manualSubmit() {
		const result = (await runClientTool("request_submission", {})) as { submitted?: boolean; missingRequired?: string[]; referenceNumber?: string };
		if (result.submitted) showToast(`${t("submitted")}: ${result.referenceNumber}`);
		else if (result.missingRequired?.length) showToast(t("formMissing", { n: result.missingRequired.length }));
	}

	function askAboutField(label: string) {
		const text = t("askFieldPrompt", { target: label.replace(/:$/, "") });
		if (window.matchMedia("(max-width: 900px)").matches) setTab("chat");
		send(text);
	}

	// ---------------------------------------------------------------------------------------------
	// Render
	// ---------------------------------------------------------------------------------------------

	const empty = messages.length === 0 && voiceTurns.length === 0;
	const firstName = me.profile.firstName;
	const chips: { label: string; prompt: string }[] = [
		{ label: t("chipPassport"), prompt: t("chipPassportPrompt") },
		{ label: t("chipMove"), prompt: t("chipMovePrompt") },
		{ label: t("chipFamily"), prompt: t("chipFamilyPrompt") },
		{ label: t("chipChildcare"), prompt: t("chipChildcarePrompt") },
	];
	const liveLabel =
		liveStatus === "connecting"
			? t("liveConnecting")
			: liveStatus === "speaking"
				? t("liveSpeaking")
				: liveStatus === "thinking"
					? t("liveThinking")
					: t("liveListening");
	const lastCaption = voiceTurns[voiceTurns.length - 1];
	const formTitle = form.formId ? getForm(form.formId)?.title : undefined;

	return (
		<>
			<a className="skip-link" href="#chat-input">
				{t("skip")}
			</a>
			<Header
				t={t}
				profile={me.profile}
				settings={settings}
				readAloud={readAloud}
				onSettings={applySettings}
				memoryVersion={memoryVersion}
				onNewChat={() => {
					clearHistory();
					formStore.reset();
					setVoiceTurns([]);
				}}
				onLogout={onLogout}
			/>

			{formOpen && (
				<div className="mobile-tabs" role="tablist">
					<button type="button" role="tab" aria-selected={tab === "chat"} onClick={() => setTab("chat")}>
						{t("tabChat")}
					</button>
					<button type="button" role="tab" aria-selected={tab === "form"} onClick={() => setTab("form")}>
						{t("tabForm")}
						{formTitle ? ` · ${formTitle.split(" ")[0]}` : ""}
					</button>
				</div>
			)}

			<div
				ref={workspaceRef}
				className={`workspace${formOpen ? " split" : ""}`}
				data-tab={tab}
				style={{ "--chat-width": `${chatWidth}%` } as React.CSSProperties}
			>
				<main className="chat-pane" aria-label="IDA">
					<div className="chat-inner">
						{empty ? (
							<div className="hero">
								<button type="button" className="avatar-beacon" onClick={() => startLive()} aria-label={t("liveStart")}>
									<span className="ring" aria-hidden="true" />
									<span className="ring2" aria-hidden="true" />
									<span className="avatar-frame">
										<img src="/ida-avatar.png" alt="" />
										<span className="online-dot" title={t("liveCta")} />
									</span>
								</button>
								<div className="ida-title">
									<h1>{t("idaName")}</h1>
									<span className="ida-chip">{t("idaBadge")}</span>
								</div>
								<p className="ida-sub">{t("idaSub")}</p>
								<p className="greeting">{t("greetingNamed", { name: firstName })}</p>
								<div className="chips">
									{chips.map((c) => (
										<button key={c.label} type="button" className="chip" onClick={() => send(c.prompt)}>
											{c.label}
										</button>
									))}
								</div>
							</div>
						) : (
							<div className="messages" ref={messagesRef} aria-live="polite" aria-relevant="additions">
								<MessageList t={t} messages={messages} voiceTurns={voiceTurns} busy={busy} profileName={`${me.profile.firstName}`} />
								{error && !busy && (
									<div className="msg assistant" role="alert">
										<img className="msg-avatar" src="/ida-avatar.png" alt="" />
										<div className="bubble">
											<p>{t("error")}</p>
											<button type="button" className="btn btn-secondary btn-sm" onClick={() => regenerate()}>
												<span className="material-symbols-outlined" aria-hidden="true">
													refresh
												</span>
												{t("retry")}
											</button>
										</div>
									</div>
								)}
							</div>
						)}

						<div className="composer">
							{liveStatus ? (
								<div className="live-bar" role="region" aria-label={t("liveTitle")}>
									<div className="live-orb" aria-hidden="true">
										<span className="wave" />
										<img src="/ida-avatar.png" alt="" />
									</div>
									<div style={{ minWidth: 0 }}>
										<div className="live-status" role="status">
											<span className="rec" aria-hidden="true" />
											{liveLabel}
										</div>
										<div className="captions" aria-live="polite" aria-label={t("liveCaptions")}>
											{lastCaption && (
												<>
													<span className="who">{lastCaption.role === "user" ? `${firstName}:` : "IDA:"}</span>
													{lastCaption.text}
												</>
											)}
										</div>
									</div>
									<div className="live-actions">
										<button type="button" className="icon-btn" aria-pressed={muted} aria-label={muted ? t("liveUnmute") : t("liveMute")} title={muted ? t("liveUnmute") : t("liveMute")} onClick={() => setMuted((m) => !m)}>
											<span className="material-symbols-outlined" aria-hidden="true">
												{muted ? "mic_off" : "mic"}
											</span>
										</button>
										<button type="button" className="icon-btn end" aria-label={t("liveEnd")} title={t("liveEnd")} onClick={stopLive}>
											<span className="material-symbols-outlined" aria-hidden="true">
												call_end
											</span>
										</button>
									</div>
								</div>
							) : (
								empty && (
									<div className="voice-cta">
										<button type="button" className="voice-btn" onClick={() => startLive()} aria-label={t("liveStart")}>
											<span className="material-symbols-outlined" aria-hidden="true">
												mic
											</span>
										</button>
										<span className="voice-cta-label">{t("liveCta")}</span>
									</div>
								)
							)}

							{attachment && (
								<div className="pending-attachment">
									<span className="material-symbols-outlined" aria-hidden="true">
										attach_file
									</span>
									<span style={{ flex: 1 }}>{attachment.name}</span>
									<button type="button" className="icon-btn" aria-label={t("dictCancel")} onClick={() => setAttachment(null)}>
										<span className="material-symbols-outlined" aria-hidden="true">
											close
										</span>
									</button>
								</div>
							)}

							<form
								className="input-bar"
								data-busy={busy || undefined}
								onSubmit={(e) => {
									e.preventDefault();
									send(input);
								}}
							>
								<label className="icon-btn" title={t("attach")}>
									<span className="material-symbols-outlined" aria-hidden="true">
										attach_file
									</span>
									<span className="sr-only">{t("attach")}</span>
									<input type="file" accept="image/*,application/pdf" className="sr-only" onChange={(e) => onAttach(e.target.files?.[0])} />
								</label>
								<label htmlFor="chat-input" className="sr-only">
									{t("inputLabel")}
								</label>
								<textarea
									id="chat-input"
									ref={inputRef}
									rows={1}
									value={input}
									placeholder={t("inputPlaceholder")}
									onChange={(e) => setInput(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === "Enter" && !e.shiftKey) {
											e.preventDefault();
											send(input);
										}
									}}
								/>
								<button type="button" className="icon-btn" title={t("dictate")} aria-label={t("dictate")} onClick={() => setDictation({ kind: "chat" })}>
									<span className="material-symbols-outlined" aria-hidden="true">
										keyboard_voice
									</span>
								</button>
								{!liveStatus && (
									<button type="button" className="voice-toggle" title={t("liveStart")} onClick={() => startLive()}>
										<span className="material-symbols-outlined" aria-hidden="true">
											graphic_eq
										</span>
										<span>{t("voice")}</span>
									</button>
								)}
								{busy ? (
									<button type="button" className="send-btn" title={t("stop")} aria-label={t("stop")} onClick={() => stop()}>
										<span className="material-symbols-outlined" aria-hidden="true">
											stop
										</span>
									</button>
								) : (
									<button type="submit" className="send-btn" title={t("send")} aria-label={t("send")} disabled={!input.trim() && !attachment}>
										<span className="material-symbols-outlined" aria-hidden="true">
											send
										</span>
									</button>
								)}
							</form>
							<div className="trust-note">
								<span className="material-symbols-outlined" aria-hidden="true">
									lock
								</span>
								<span>{t("trust")}</span>
							</div>
						</div>
					</div>
				</main>

				{formOpen && (
					<>
						<button
							type="button"
							className="splitter"
							role="separator"
							aria-orientation="vertical"
							aria-label={t("resizer")}
							aria-valuemin={25}
							aria-valuemax={65}
							aria-valuenow={chatWidth}
							onPointerDown={onSplitterPointer}
							onKeyDown={(e) => {
								if (e.key === "ArrowLeft") setChatWidth((w) => Math.max(25, w - 5));
								if (e.key === "ArrowRight") setChatWidth((w) => Math.min(65, w + 5));
								if (e.key === "Home") setChatWidth(25);
								if (e.key === "End") setChatWidth(65);
							}}
						/>
						<FormPanel
							t={t}
							uiLanguage={settings.language}
							onClose={() => formStore.reset()}
							onSubmit={manualSubmit}
							onAskIda={askAboutField}
							onDictateField={(fieldId, label) => setDictation({ kind: "field", fieldId, label })}
						/>
					</>
				)}
			</div>

			{confirm?.kind === "submit" && <ConfirmSubmissionDialog t={t} onDecide={decide} />}
			{confirm?.kind === "book" && <ConfirmBookingDialog t={t} slotLabel={confirm.slotLabel} onDecide={decide} />}
			{dictation && (
				<DictationDialog
					t={t}
					settings={settings}
					targetLabel={dictation.kind === "chat" ? t("dictChat") : dictation.label}
					onClose={() => setDictation(null)}
					onApply={(text) => {
						if (dictation.kind === "chat") {
							setInput((prev) => (prev ? `${prev} ${text}` : text));
							inputRef.current?.focus();
						} else setFieldByCitizen(dictation.fieldId, text, settings.language);
						setDictation(null);
					}}
				/>
			)}
			{toast && (
				<div className="toast" role="status">
					{toast}
				</div>
			)}
		</>
	);
}
