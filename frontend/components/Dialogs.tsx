/**
 * Modal dialogs: confirm a binding submission / booking (human in the loop) and the dictation window.
 */
import { useEffect, useRef, useState } from "react";
import { allFields, getForm, missingRequired } from "../../src/shared/forms";
import type { AssistantSettings } from "../../src/shared/types";
import { api } from "../api";
import type { T } from "../i18n";
import { bytesToBase64 } from "../lib/audio";
import { GeminiLiveSession } from "../lib/gemini-live";
import { formStore } from "../lib/form-store";

function useDialogFocus() {
	const ref = useRef<HTMLDivElement>(null);
	useEffect(() => {
		const previous = document.activeElement as HTMLElement | null;
		ref.current?.querySelector<HTMLElement>("[data-autofocus], button, textarea")?.focus();
		return () => previous?.focus?.();
	}, []);
	return ref;
}

export function ConfirmSubmissionDialog({ t, onDecide }: { t: T; onDecide: (confirmed: boolean) => void }) {
	const ref = useDialogFocus();
	const s = formStore.get();
	const form = s.formId ? getForm(s.formId) : undefined;
	if (!form) return null;
	const missing = missingRequired(form, s.values);
	const rows = allFields(form).filter((f) => s.values[f.id] && f.kind !== "signature");
	return (
		<div className="modal-backdrop" onKeyDown={(e) => e.key === "Escape" && onDecide(false)}>
			<div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-text" ref={ref}>
				<h2 id="confirm-title">
					<span className="material-symbols-outlined" aria-hidden="true">
						verified_user
					</span>
					{t("confirmTitle")}
				</h2>
				<p id="confirm-text">{t("confirmText")}</p>
				<strong>{form.title}</strong>
				{missing.length > 0 && (
					<p className="badge pending" style={{ display: "block", marginTop: 8 }}>
						{t("confirmMissing")} {missing.join(", ")}
					</p>
				)}
				<table className="summary-table" lang="de">
					<tbody>
						{rows.map((f) => (
							<tr key={f.id}>
								<th scope="row">{f.label.replace(/:$/, "")}</th>
								<td>{f.kind === "checkbox" ? (s.values[f.id] === "yes" ? "✓" : "–") : s.values[f.id]}</td>
							</tr>
						))}
					</tbody>
				</table>
				<div className="actions">
					<button type="button" className="btn btn-secondary" onClick={() => onDecide(false)}>
						{t("confirmCancel")}
					</button>
					<button type="button" className="btn btn-primary" disabled={missing.length > 0} onClick={() => onDecide(true)} data-autofocus>
						<span className="material-symbols-outlined" aria-hidden="true">
							draw
						</span>
						{t("confirmSubmit")}
					</button>
				</div>
			</div>
		</div>
	);
}

export function ConfirmBookingDialog({ t, slotLabel, onDecide }: { t: T; slotLabel: string; onDecide: (confirmed: boolean) => void }) {
	const ref = useDialogFocus();
	return (
		<div className="modal-backdrop" onKeyDown={(e) => e.key === "Escape" && onDecide(false)}>
			<div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="book-title" ref={ref}>
				<h2 id="book-title">
					<span className="material-symbols-outlined" aria-hidden="true">
						event
					</span>
					{t("bookTitle")}
				</h2>
				<p>{slotLabel}</p>
				<div className="actions">
					<button type="button" className="btn btn-secondary" onClick={() => onDecide(false)}>
						{t("confirmCancel")}
					</button>
					<button type="button" className="btn btn-primary" onClick={() => onDecide(true)} data-autofocus>
						{t("bookConfirm")}
					</button>
				</div>
			</div>
		</div>
	);
}

/**
 * Dictation window: streams the microphone to Gemini Live transcription and shows the text live.
 * The citizen can edit the text before inserting it. Fallback: record + /api/transcribe.
 */
export function DictationDialog({
	t,
	targetLabel,
	settings,
	onApply,
	onClose,
}: {
	t: T;
	targetLabel: string;
	settings: AssistantSettings;
	onApply: (text: string) => void;
	onClose: () => void;
}) {
	const ref = useDialogFocus();
	const [text, setText] = useState("");
	const [level, setLevel] = useState(0);
	const [state, setState] = useState<"starting" | "listening" | "stopped" | "error" | "fallback">("starting");
	const [error, setError] = useState<string | null>(null);
	const session = useRef<GeminiLiveSession | null>(null);
	const recorder = useRef<MediaRecorder | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const tok = await api.liveToken("dictation", settings, null);
				const s = new GeminiLiveSession(
					{ wsUrl: tok.wsUrl, token: tok.token, model: tok.model, audioOutput: false },
					{
						onInputTranscript: (chunk) => setText((prev) => prev + chunk),
						onLevel: (l) => setLevel(l),
						onError: (err) => setError(err.message),
					},
				);
				session.current = s;
				await s.start();
				if (cancelled) s.stop();
				else setState("listening");
			} catch (err) {
				if (cancelled) return;
				const message = (err as Error).message;
				if (/denied|NotAllowed/i.test(message)) {
					setError(t("micDenied"));
					setState("error");
					return;
				}
				// Fallback: record locally and transcribe in one request.
				try {
					const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
					const rec = new MediaRecorder(stream);
					const chunks: Blob[] = [];
					rec.ondataavailable = (e) => chunks.push(e.data);
					rec.onstop = async () => {
						stream.getTracks().forEach((tr) => tr.stop());
						const blob = new Blob(chunks, { type: rec.mimeType });
						const res = await api.transcribe(bytesToBase64(await blob.arrayBuffer()), rec.mimeType.split(";")[0], settings.language);
						setText((prev) => `${prev}${prev ? " " : ""}${res.text}`);
						setState("stopped");
					};
					rec.start();
					recorder.current = rec;
					setState("fallback");
				} catch (e2) {
					setError((e2 as Error).message);
					setState("error");
				}
			}
		})();
		return () => {
			cancelled = true;
			session.current?.stop();
			if (recorder.current?.state === "recording") recorder.current.stop();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const stop = () => {
		session.current?.stop();
		if (recorder.current?.state === "recording") recorder.current.stop();
		else setState("stopped");
		setLevel(0);
	};

	return (
		<div className="modal-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
			<div className="modal" role="dialog" aria-modal="true" aria-labelledby="dict-title" ref={ref}>
				<h2 id="dict-title">
					<span className="material-symbols-outlined" aria-hidden="true">
						keyboard_voice
					</span>
					{t("dictTitle")}
				</h2>
				<p className="muted">{t("dictInto", { target: targetLabel })}</p>
				<p>{t("dictHint")}</p>
				<div className="level-meter" aria-hidden="true">
					<div style={{ width: `${Math.min(100, level * 400)}%` }} />
				</div>
				{(state === "listening" || state === "fallback") && (
					<p role="status" style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<span className="live-status">
							<span className="rec" />
						</span>
						{t("dictListening")}
					</p>
				)}
				{error && (
					<p role="alert" className="badge pending" style={{ display: "block" }}>
						{error}
					</p>
				)}
				<label className="sr-only" htmlFor="dict-text">
					{t("dictTitle")}
				</label>
				<textarea id="dict-text" className="dictation-text" value={text} onChange={(e) => setText(e.target.value)} lang={settings.language} />
				<div className="actions">
					<button type="button" className="btn btn-ghost" onClick={onClose}>
						{t("dictCancel")}
					</button>
					{(state === "listening" || state === "fallback") && (
						<button type="button" className="btn btn-secondary" onClick={stop}>
							<span className="material-symbols-outlined" aria-hidden="true">
								stop_circle
							</span>
							{t("dictStop")}
						</button>
					)}
					<button
						type="button"
						className="btn btn-primary"
						disabled={!text.trim()}
						onClick={() => {
							stop();
							onApply(text.trim());
						}}
					>
						{t("dictApply")}
					</button>
				</div>
			</div>
		</div>
	);
}
