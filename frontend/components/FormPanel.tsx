/**
 * The interactive form panel (right side): a faithful replica of the official form.
 *
 * Translation layer: every text of the form is rendered as
 *   <span class="tx"><span class="tx-orig">German original</span><span class="tx-layer">translation</span></span>
 * Both share one grid cell, so the translation lies exactly over the original, nothing is truncated,
 * and the input fields themselves are never replaced or duplicated – the citizen fills in the
 * original German form. "Hold to see original" peeks underneath the layer.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getForm, missingRequired, type FormFieldDef } from "../../src/shared/forms";
import { LANGUAGES, languageDir } from "../../src/shared/languages";
import type { T } from "../i18n";
import { formStore, setFieldByCitizen, translateCurrentForm, useFormStore } from "../lib/form-store";

type Props = {
	t: T;
	uiLanguage: string;
	onClose: () => void;
	onSubmit: () => void;
	onAskIda: (fieldLabel: string) => void;
	/** Toggles inline dictation into a field. */
	onDictateField: (fieldId: string) => void;
	/** Field that is currently being dictated into (recording indicator). */
	dictatingField: string | null;
};

export function FormPanel({ t, uiLanguage, onClose, onSubmit, onAskIda, onDictateField, dictatingField }: Props) {
	const s = useFormStore();
	const form = s.formId ? getForm(s.formId) : undefined;
	const [peek, setPeek] = useState(false);
	const [target, setTarget] = useState(() => (uiLanguage.startsWith("de") ? "en" : uiLanguage));
	const layer = s.translationVisible && s.translation ? s.translation : null;

	useEffect(() => {
		if (!uiLanguage.startsWith("de")) setTarget(uiLanguage);
	}, [uiLanguage]);

	// Guided filling: scroll the field the AI points at into view.
	useEffect(() => {
		if (!s.highlight) return;
		document.getElementById(`pf-${s.highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [s.highlight, s.hint]);

	const missing = useMemo(() => (form ? missingRequired(form, s.values) : []), [form, s.values]);

	if (!form) return null;

	/** Original text + translation layer in the same grid cell. */
	const tx = (id: string, original: string): ReactNode => (
		<span className="tx" title={layer ? original : undefined}>
			<span className="tx-orig" aria-hidden={layer ? true : undefined}>
				{original}
			</span>
			{layer && (
				<span className="tx-layer" lang={layer.lang} dir={languageDir(layer.lang)}>
					{layer.texts[id] ?? original}
				</span>
			)}
		</span>
	);
	const trText = (id: string, original: string) => (layer ? (layer.texts[id] ?? original) : original);

	function renderField(f: FormFieldDef) {
		const id = `pf-input-${f.id}`;
		const value = s.values[f.id] ?? "";
		const auto = s.autoFilled[f.id];
		const hintId = f.hint ? `${id}-hint` : undefined;
		const set = (v: string) => setFieldByCitizen(f.id, v, uiLanguage);
		const label = (
			<>
				{tx(`f.${f.id}`, f.label)}
				{f.required && (
					<span className="pf-req" title={t("formRequired")}>
						*
					</span>
				)}
				{auto && (
					<span className="ida-tag">
						<span className="material-symbols-outlined" aria-hidden="true">
							{auto === "ida" ? "auto_awesome" : "verified_user"}
						</span>
						{auto === "ida" ? t("formFilledByIda") : t("formFromRegister")}
					</span>
				)}
			</>
		);
		const a11yName = layer ? trText(`f.${f.id}`, f.label) : undefined;

		let control: ReactNode;
		switch (f.kind) {
			case "checkbox":
				control = (
					<label className="pf-check">
						<input type="checkbox" checked={value === "yes"} required={f.required} onChange={(e) => set(e.target.checked ? "yes" : "no")} aria-label={a11yName} />
						<span>{label}</span>
					</label>
				);
				break;
			case "radio":
				control = (
					<fieldset aria-describedby={hintId}>
						<legend>{label}</legend>
						<div className="pf-options">
							{f.options?.map((o) => (
								<label key={o.value} className="pf-radio">
									<input type="radio" name={f.id} value={o.value} checked={value === o.value} onChange={() => set(o.value)} required={f.required} />
									<span>{tx(`o.${f.id}.${o.value}`, o.label)}</span>
								</label>
							))}
						</div>
					</fieldset>
				);
				break;
			case "select":
				control = (
					<>
						<label className="pf-label" htmlFor={id}>
							{label}
						</label>
						<select id={id} className="pf-input" value={value} required={f.required} onChange={(e) => set(e.target.value)} aria-label={a11yName} aria-describedby={hintId}>
							<option value="">{t("choose")}</option>
							{f.options?.map((o) => (
								<option key={o.value} value={o.value} lang={layer?.lang}>
									{layer ? `${trText(`o.${f.id}.${o.value}`, o.label)} (${o.label})` : o.label}
								</option>
							))}
						</select>
					</>
				);
				break;
			case "signature":
				control = (
					<>
						<span className="pf-label">{label}</span>
						<div className="pf-signature">
							<span className="material-symbols-outlined" aria-hidden="true">
								draw
							</span>
							{t("signatureHint")}
						</div>
					</>
				);
				break;
			case "textarea":
				control = (
					<>
						<label className="pf-label" htmlFor={id}>
							{label}
						</label>
						<textarea id={id} className="pf-input" value={value} required={f.required} onChange={(e) => set(e.target.value)} aria-label={a11yName} aria-describedby={hintId} />
					</>
				);
				break;
			default:
				control = (
					<>
						<label className="pf-label" htmlFor={id}>
							{label}
						</label>
						<input
							id={id}
							className="pf-input"
							type="text"
							value={value}
							required={f.required}
							inputMode={f.kind === "date" ? "numeric" : f.inputMode}
							autoComplete={f.autoComplete ?? "off"}
							placeholder={f.placeholder ? trText(`p.${f.id}`, f.placeholder) : undefined}
							onChange={(e) => set(e.target.value)}
							aria-label={a11yName}
							aria-describedby={hintId}
						/>
					</>
				);
		}

		const canType = f.kind === "text" || f.kind === "date" || f.kind === "textarea";
		return (
			<div
				key={f.id}
				id={`pf-${f.id}`}
				className={`pf${auto === "ida" ? " ida-filled" : ""}${s.highlight === f.id ? " highlight" : ""}${dictatingField === f.id ? " dictating" : ""}`}
				style={{ "--span": f.span ?? 12 } as React.CSSProperties}
			>
				{control}
				{f.hint && (
					<div className="pf-hint" id={hintId}>
						{tx(`h.${f.id}`, f.hint)}
					</div>
				)}
				{s.hint?.fieldId === f.id && (
					<div className="pf-bubble" role="status">
						<span className="material-symbols-outlined" aria-hidden="true">
							support_agent
						</span>
						<span>{s.hint.text}</span>
					</div>
				)}
				<div className="pf-actions">
					{canType && (
						<button
							type="button"
							className={dictatingField === f.id ? "recording" : undefined}
							aria-pressed={dictatingField === f.id}
							title={dictatingField === f.id ? t("dictEnd") : t("formDictateField")}
							aria-label={`${dictatingField === f.id ? t("dictEnd") : t("formDictateField")}: ${trText(`f.${f.id}`, f.label)}`}
							onClick={() => onDictateField(f.id)}
						>
							<span className="material-symbols-outlined" aria-hidden="true">
								{dictatingField === f.id ? "stop_circle" : "mic"}
							</span>
						</button>
					)}
					<button type="button" title={t("formAskIda")} aria-label={`${t("formAskIda")}: ${trText(`f.${f.id}`, f.label)}`} onClick={() => onAskIda(trText(`f.${f.id}`, f.label))}>
						<span className="material-symbols-outlined" aria-hidden="true">
							help
						</span>
					</button>
				</div>
			</div>
		);
	}

	const layerLanguageName = layer ? (LANGUAGES.find((l) => l.code === layer.lang)?.name ?? layer.lang) : "";

	return (
		<section className="form-pane" aria-label={t("formPanel")}>
			<div className="form-toolbar">
				<div className="title">
					<span className="material-symbols-outlined" aria-hidden="true">
						description
					</span>
					<span>{trText("title", form.title)}</span>
				</div>

				{layer ? (
					<>
						<button
							type="button"
							className="btn btn-secondary btn-sm"
							aria-pressed={peek}
							title={t("formHoldOriginal")}
							onPointerDown={() => setPeek(true)}
							onPointerUp={() => setPeek(false)}
							onPointerLeave={() => setPeek(false)}
							onKeyDown={(e) => (e.key === " " || e.key === "Enter") && setPeek(true)}
							onKeyUp={() => setPeek(false)}
						>
							<span className="material-symbols-outlined" aria-hidden="true">
								visibility
							</span>
							{t("formHoldOriginal")}
						</button>
						<button type="button" className="btn btn-ghost btn-sm" onClick={() => formStore.set({ translationVisible: false })}>
							{t("formShowOriginal")}
						</button>
					</>
				) : (
					<>
						<label className="sr-only" htmlFor="layer-lang">
							{t("language")}
						</label>
						<select id="layer-lang" className="lang-select" value={target} onChange={(e) => setTarget(e.target.value)}>
							{LANGUAGES.filter((l) => l.code !== "de").map((l) => (
								<option key={l.code} value={l.code}>
									{l.name}
								</option>
							))}
						</select>
						<button type="button" className="btn btn-primary btn-sm" disabled={s.translating} onClick={() => translateCurrentForm(target).catch(() => {})}>
							<span className="material-symbols-outlined" aria-hidden="true">
								translate
							</span>
							{s.translating ? t("formTranslating") : t("formTranslate")}
						</button>
					</>
				)}
				<button type="button" className="icon-btn" title={t("formPrint")} aria-label={t("formPrint")} onClick={() => window.print()}>
					<span className="material-symbols-outlined" aria-hidden="true">
						print
					</span>
				</button>
				<button type="button" className="icon-btn" title={t("formClose")} aria-label={t("formClose")} onClick={onClose}>
					<span className="material-symbols-outlined" aria-hidden="true">
						close
					</span>
				</button>
			</div>

			<div className="form-status" aria-live="polite">
				{missing.length ? (
					<span className="badge pending">
						<span className="material-symbols-outlined" aria-hidden="true">
							pending
						</span>
						{t("formMissing", { n: missing.length })}
					</span>
				) : (
					<span className="badge ok">
						<span className="material-symbols-outlined" aria-hidden="true">
							task_alt
						</span>
						{t("formComplete")}
					</span>
				)}
				{layer && (
					<span className="badge layer" title={t("formLayerNote")}>
						<span className="material-symbols-outlined" aria-hidden="true">
							layers
						</span>
						{t("formLayerActive", { lang: layerLanguageName })}
					</span>
				)}
				{s.translating && <span className="spinner" aria-label={t("formTranslating")} />}
				<span style={{ marginLeft: "auto" }} />
				<button type="button" className="btn btn-primary btn-sm" onClick={onSubmit} disabled={!!s.submitted}>
					<span className="material-symbols-outlined" aria-hidden="true">
						send
					</span>
					{t("formSubmit")}
				</button>
			</div>

			<div className="form-scroll">
				{layer && (
					<p className="muted" style={{ maxWidth: 860, margin: "0 auto 12px" }}>
						{t("formLayerNote")}
					</p>
				)}
				{s.submitted && (
					<div className="result-card success" style={{ maxWidth: 860, margin: "0 auto 16px" }} role="status">
						<h4>
							<span className="material-symbols-outlined icon-fill" aria-hidden="true" style={{ color: "#047857" }}>
								check_circle
							</span>
							{t("submitted")}
						</h4>
						<div>
							{t("reference")}: <span className="ref">{s.submitted.referenceNumber}</span>
						</div>
						<div className="muted">{s.submitted.authority}</div>
						<strong>{t("nextSteps")}</strong>
						<ul>
							{s.submitted.nextSteps.map((n) => (
								<li key={n}>{n}</li>
							))}
						</ul>
					</div>
				)}
				<article className={`paper${layer ? " translated" : ""}${peek ? " peek" : ""}`} lang="de" dir="ltr">
					<header className="paper-head">
						<div className="authority">{tx("authority", form.authority)}</div>
						<h2>{tx("title", form.title)}</h2>
						<div className="subtitle">{tx("subtitle", form.subtitle)}</div>
					</header>
					<p className="legal">{tx("legal", form.legal)}</p>
					{form.sections.map((section) => (
						<section key={section.id} className="paper-section" aria-labelledby={`sec-${section.id}`}>
							<h3 id={`sec-${section.id}`}>{tx(`s.${section.id}`, section.title)}</h3>
							{section.blocks.map((b, i) =>
								b.type === "text" ? (
									<p key={b.id} className={`paper-note${b.style === "legal" ? " legal-text" : ""}`}>
										{tx(`t.${b.id}`, b.text)}
									</p>
								) : (
									<div key={i} className="paper-grid">
										{b.fields.map(renderField)}
									</div>
								),
							)}
						</section>
					))}
				</article>
			</div>
		</section>
	);
}
