/**
 * Chat message list: text (markdown), attachments, tool progress lines and result cards
 * (submission, booking, human handoff).
 */
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { UiKey } from "../../src/shared/ui-strings";
import type { T } from "../i18n";
import { Markdown } from "./Markdown";

export type VoiceTurn = { role: "user" | "assistant"; text: string; final: boolean };

type ResultLike = {
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

function ResultCard({ t, output }: { t: T; output: ResultLike }) {
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
					{t("reference")}: <span className="ref">{output.referenceNumber}</span>
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
					{output.slotTime?.replace("T", " ")} · {output.office}
				</div>
				<div>
					{t("reference")}: <span className="ref">{output.referenceNumber}</span>
				</div>
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
						<div className="bubble" style={v.final ? undefined : { opacity: 0.75 }}>
							<p>{v.text}</p>
						</div>
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
