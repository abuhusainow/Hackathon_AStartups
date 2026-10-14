/**
 * Chat message list: text (markdown), attachments, tool progress lines and result cards
 * (submission, booking, human handoff).
 */
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import type { UiKey } from "../../src/shared/ui-strings";
import type { T } from "../i18n";
import { formatDay, formatTime } from "../lib/datetime";
import { Markdown } from "./Markdown";

/** A turn of the voice conversation. `card` holds a tool result (e.g. a reference number) to show visually. */
export type VoiceTurn = { role: "user" | "assistant"; text: string; final: boolean; card?: ResultLike };

export type ResultLike = {
	type?: string;
	submitted?: boolean;
	booked?: boolean;
	referenceNumber?: string;
	serviceName?: string;
	authority?: string;
	office?: string;
	slotTime?: string;
	ticketId?: string;
	message?: string;
	phone?: string;
	hours?: string;
	nextSteps?: string[];
};

function formatWhen(slotTime: string | undefined): string {
	if (!slotTime) return "";
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(slotTime)) return slotTime;
	const lang = document.documentElement.lang || "de";
	return `${formatDay(slotTime, lang)}, ${formatTime(slotTime, lang)}`;
}

/** Tool results worth showing as a card (also in the voice conversation). */
export function isCardResult(output: unknown): output is ResultLike {
	const o = output as ResultLike | null;
	return !!o && (((o.submitted || o.booked || o.type === "submission_result" || o.type === "booking_result") && !!o.referenceNumber) || o.type === "handoff_result");
}

/** Reference numbers are shown big, spaced and copyable – they are often read out loud on the phone. */
function RefNumber({ t, value }: { t: T; value: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<span className="ref-line">
			<span className="ref" translate="no">
				{value}
			</span>
			<button
				type="button"
				className="btn btn-ghost btn-sm"
				onClick={() =>
					navigator.clipboard?.writeText(value).then(() => {
						setCopied(true);
						setTimeout(() => setCopied(false), 1500);
					})
				}
			>
				<span className="material-symbols-outlined" aria-hidden="true">
					{copied ? "check" : "content_copy"}
				</span>
				{copied ? t("copied") : t("copy")}
			</button>
		</span>
	);
}

export function ResultCard({ t, output }: { t: T; output: ResultLike }) {
	if ((output.submitted || output.type === "submission_result") && output.referenceNumber)
		return (
			<div className="result-card success" role="status">
				<h4>
					<span className="material-symbols-outlined icon-fill" aria-hidden="true" style={{ color: "#047857" }}>
						check_circle
					</span>
					{t("submitted")} · {output.serviceName}
				</h4>
				<div>
					{t("reference")}: <RefNumber t={t} value={output.referenceNumber} />
				</div>
				{output.nextSteps && (
					<ul>
						{output.nextSteps.map((n) => (
							<li key={n}>{n}</li>
						))}
					</ul>
				)}
			</div>
		);
	if ((output.booked || output.type === "booking_result") && output.referenceNumber)
		return (
			<div className="result-card success" role="status">
				<h4>
					<span className="material-symbols-outlined" aria-hidden="true">
						event_available
					</span>
					{t("booked")}
				</h4>
				<div>
					<strong>{formatWhen(output.slotTime)}</strong> · {output.office}
				</div>
				<div>
					{t("reference")}: <RefNumber t={t} value={output.referenceNumber} />
				</div>
				{output.nextSteps && output.nextSteps.length > 0 && (
					<ul>
						{output.nextSteps.map((n) => (
							<li key={n}>{n}</li>
						))}
					</ul>
				)}
			</div>
		);
	if (output.type === "handoff_result")
		return (
			<div className="result-card" role="status">
				<h4>
					<span className="material-symbols-outlined" aria-hidden="true">
						support_agent
					</span>
					{t("handoffDone")}
				</h4>
				<div>{output.message}</div>
				<div className="muted">
					{output.phone} · {output.hours} · {t("ticket")} {output.ticketId}
				</div>
			</div>
		);
	return null;
}

export function MessageList({
	t,
	messages,
	voiceTurns,
	busy,
	profileName,
}: {
	t: T;
	messages: UIMessage[];
	voiceTurns: VoiceTurn[];
	busy: boolean;
	profileName: string;
}) {
	const last = messages[messages.length - 1];
	const waiting = busy && (!last || last.role === "user");
	return (
		<>
			{messages.map((m) => (
				<div key={m.id} className={`msg ${m.role}`}>
					{m.role === "assistant" && <img className="msg-avatar" src="/ida-avatar.png" alt="" />}
					<div className="msg-body">
						<div className="msg-meta">
							{(m.metadata as { voice?: boolean } | undefined)?.voice && (
								<span className="material-symbols-outlined" aria-hidden="true">
									mic
								</span>
							)}
							{m.role === "user" ? profileName : t("idaName")}
						</div>
						{m.parts.map((part, i) => {
							// Voice cards are stored with a short text for the AI's context – the card itself shows it.
							if (part.type === "text" && isCardResult((m.metadata as { card?: unknown } | undefined)?.card)) return null;
							if (part.type === "text" && part.text.trim())
								return (
									<div key={i} className="bubble">
										{m.role === "assistant" ? <Markdown text={part.text} /> : <p style={{ whiteSpace: "pre-wrap" }}>{part.text}</p>}
									</div>
								);
							if (part.type === "file")
								return (
									<div key={i} className="bubble">
										<span className="attachment-chip">
											<span className="material-symbols-outlined" aria-hidden="true">
												attach_file
											</span>
											{part.filename ?? part.mediaType}
										</span>
									</div>
								);
							if (isToolUIPart(part)) {
								const name = getToolName(part);
								const done = part.state === "output-available" || part.state === "output-error";
								const label = t(`tool_${name}` as UiKey) || name;
								return (
									<div key={i}>
										<span className={`tool-line${done ? " done" : ""}`}>
											<span className="material-symbols-outlined" aria-hidden="true">
												{done ? "check_circle" : "progress_activity"}
											</span>
											{done ? t("toolDone", { target: label }) : t("toolWorking", { target: label })}
										</span>
										{part.state === "output-available" && <ResultCard t={t} output={(part.output ?? {}) as ResultLike} />}
									</div>
								);
							}
							return null;
						})}
						{isCardResult((m.metadata as { card?: unknown } | undefined)?.card) && <ResultCard t={t} output={(m.metadata as { card: ResultLike }).card} />}
					</div>
				</div>
			))}
			{voiceTurns.map((v, i) => (
				<div key={`v${i}`} className={`msg ${v.role}`}>
					{v.role === "assistant" && <img className="msg-avatar" src="/ida-avatar.png" alt="" />}
					<div className="msg-body">
						<div className="msg-meta">
							<span className="material-symbols-outlined" aria-hidden="true">
								mic
							</span>
							{v.role === "user" ? profileName : t("idaName")}
						</div>
						{v.text.trim() && (
							<div className="bubble" style={v.final ? undefined : { opacity: 0.75 }}>
								<p>{v.text}</p>
							</div>
						)}
						{v.card && <ResultCard t={t} output={v.card} />}
					</div>
				</div>
			))}
			{waiting && (
				<div className="msg assistant" aria-live="polite">
					<img className="msg-avatar" src="/ida-avatar.png" alt="" />
					<div className="bubble">
						<span className="thinking" aria-label={t("thinking")}>
							<span />
							<span />
							<span />
						</span>
					</div>
				</div>
			)}
		</>
	);
}
