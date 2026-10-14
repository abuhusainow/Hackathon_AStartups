/**
 * Modal dialogs: confirm binding actions (submit an application, book or cancel an appointment).
 * The citizen always decides – the AI can only ask (human in the loop).
 */
import { useEffect, useRef } from "react";
import { allFields, getForm, missingRequired } from "../../src/shared/forms";
import type { T } from "../i18n";
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

/** Generic confirmation (book or cancel an appointment). */
export function ConfirmActionDialog({
	title,
	text,
	confirmLabel,
	cancelLabel,
	icon,
	danger,
	onDecide,
}: {
	title: string;
	text: string;
	confirmLabel: string;
	cancelLabel: string;
	icon: string;
	danger?: boolean;
	onDecide: (confirmed: boolean) => void;
}) {
	const ref = useDialogFocus();
	return (
		<div className="modal-backdrop" onKeyDown={(e) => e.key === "Escape" && onDecide(false)}>
			<div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="action-title" aria-describedby="action-text" ref={ref}>
				<h2 id="action-title">
					<span className="material-symbols-outlined" aria-hidden="true">
						{icon}
					</span>
					{title}
				</h2>
				<p id="action-text">{text}</p>
				<div className="actions">
					<button type="button" className="btn btn-secondary" onClick={() => onDecide(false)}>
						{cancelLabel}
					</button>
					<button type="button" className={`btn ${danger ? "btn-danger" : "btn-primary"}`} onClick={() => onDecide(true)} data-autofocus>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
