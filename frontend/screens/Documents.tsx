/**
 * "Meine Dokumente": submitted applications (copy of the original German form), confirmations of
 * the authorities (Meldebestätigung, Eingangsbestätigung, Terminbestätigung) and the ID documents
 * from the register. Every document can be opened and printed / saved as PDF.
 */
import { useEffect, useState } from "react";
import { getForm, type FormFieldDef } from "../../src/shared/forms";
import { api, type CitizenDoc, type Profile } from "../api";
import type { T } from "../i18n";
import { formatDay, formatTime, uiLocale } from "../lib/datetime";

const ID_TYPES: Record<string, string> = {
	passport: "Reisepass",
	id_card: "Personalausweis",
	residence_permit: "Aufenthaltstitel",
	eu_registration_certificate: "Anmeldebescheinigung (EWR)",
};

function formatDate(iso: string | undefined | null, lang: string) {
	if (!iso) return "";
	const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
	return new Intl.DateTimeFormat(uiLocale(lang), { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function Documents({ t, lang, profile, refreshKey }: { t: T; lang: string; profile: Profile; refreshKey: number }) {
	const [docs, setDocs] = useState<CitizenDoc[] | null>(null);
	const [openId, setOpenId] = useState<string | null>(null);

	useEffect(() => {
		api.documents().then(setDocs).catch(() => setDocs([]));
	}, [refreshKey]);

	const open = docs?.find((d) => d.id === openId);
	if (open) return <DocumentViewer t={t} lang={lang} doc={open} onBack={() => setOpenId(null)} />;

	const applications = docs?.filter((d) => d.kind === "application") ?? [];
	const confirmations = docs?.filter((d) => d.kind === "confirmation") ?? [];

	const card = (d: CitizenDoc) => (
		<li key={d.id} className="doc-card">
			<span className="doc-icon material-symbols-outlined" aria-hidden="true">
				{d.kind === "application" ? "description" : d.data.type === "appointment" ? "event_available" : "verified"}
			</span>
			<div className="doc-body">
				<h3>{d.title}</h3>
				<p className="muted">
					{d.kind === "application" ? t("docsSubmittedOn", { target: formatDate(d.createdAt, lang) }) : t("docsIssuedOn", { target: formatDate(d.createdAt, lang) })}
					{d.referenceNumber && (
						<>
							{" · "}
							<span className="ref" translate="no">
								{d.referenceNumber}
							</span>
						</>
					)}
				</p>
				{d.status === "cancelled" && <span className="badge pending">{t("apptCancelled")}</span>}
			</div>
			<button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpenId(d.id)} aria-label={`${t("docsOpen")}: ${d.title}`}>
				{t("docsOpen")}
			</button>
		</li>
	);

	return (
		<main className="appt-page" id="main">
			<div className="appt-head">
				<div>
					<h1>{t("navDocuments")}</h1>
					<p className="muted">{t("docsIntro")}</p>
				</div>
			</div>

			{docs === null ? (
				<span className="spinner" aria-label="…" />
			) : docs.length === 0 ? (
				<p className="appt-empty">{t("docsNone")}</p>
			) : (
				<>
					{applications.length > 0 && (
						<section aria-labelledby="docs-apps">
							<h2 id="docs-apps">{t("docsApplications")}</h2>
							<ul className="doc-list">{applications.map(card)}</ul>
						</section>
					)}
					{confirmations.length > 0 && (
						<section aria-labelledby="docs-conf">
							<h2 id="docs-conf">{t("docsConfirmations")}</h2>
							<ul className="doc-list">{confirmations.map(card)}</ul>
						</section>
					)}
				</>
			)}

			<section aria-labelledby="docs-ids">
				<h2 id="docs-ids">{t("docsIds")}</h2>
				<ul className="doc-list">
					{profile.documents.map((d) => {
						const expired = d.status === "expired";
						return (
							<li key={d.number} className="doc-card">
								<span className="doc-icon material-symbols-outlined" aria-hidden="true">
									badge
								</span>
								<div className="doc-body">
									<h3>{ID_TYPES[d.type] ?? d.type}</h3>
									<p className="muted">
										<span className="ref" translate="no">
											{d.number}
										</span>
										{" · "}
										{d.validUntil ? t("docsValidUntil", { target: formatDate(d.validUntil, lang) }) : t("docsUnlimited")}
									</p>
								</div>
								<span className={`badge ${expired ? "pending" : "ok"}`}>{expired ? t("docsExpired") : t("docsValid")}</span>
							</li>
						);
					})}
				</ul>
			</section>
		</main>
	);
}

/** Read-only rendering of a document as an official paper (printable). */
function DocumentViewer({ t, lang, doc, onBack }: { t: T; lang: string; doc: CitizenDoc; onBack: () => void }) {
	return (
		<main className="appt-page doc-viewer" id="main">
			<div className="doc-viewer-bar">
				<button type="button" className="btn btn-ghost" onClick={onBack}>
					<span className="material-symbols-outlined" aria-hidden="true">
						arrow_back
					</span>
					{t("docsBack")}
				</button>
				<button type="button" className="btn btn-secondary btn-sm" onClick={() => window.print()}>
					<span className="material-symbols-outlined" aria-hidden="true">
						print
					</span>
					{t("formPrint")}
				</button>
			</div>
			{doc.kind === "application" ? <ApplicationCopy t={t} lang={lang} doc={doc} /> : <Confirmation lang={lang} doc={doc} />}
		</main>
	);
}

function ApplicationCopy({ t, lang, doc }: { t: T; lang: string; doc: CitizenDoc }) {
	const form = doc.formId ? getForm(doc.formId) : undefined;
	const values = (doc.data.values ?? {}) as Record<string, string>;
	if (!form) return <p>{doc.title}</p>;

	const show = (f: FormFieldDef) => {
		const v = values[f.id] ?? "";
		if (f.kind === "checkbox") return v === "yes" ? "☒" : "☐";
		if (f.kind === "signature") return `Elektronisch signiert mit ID Austria am ${formatDate(String(doc.data.submittedAt ?? doc.createdAt), "de")}`;
		if (f.options) return f.options.find((o) => o.value === v)?.label ?? v;
		return v;
	};

	return (
		<article className="paper doc-paper" lang="de">
			<div className="doc-stamp">
				{t("docsCopyNote")} · {doc.referenceNumber} · {formatDate(String(doc.data.submittedAt ?? doc.createdAt), lang)}
			</div>
			<header className="paper-head">
				<div className="authority">{form.authority}</div>
				<h2>{form.title}</h2>
				<div className="subtitle">{form.subtitle}</div>
			</header>
			{form.sections.map((section) => (
				<section key={section.id} className="paper-section">
					<h3>{section.title}</h3>
					{section.blocks.map((b, i) =>
						b.type === "text" ? (
							<p key={b.id} className="paper-note">
								{b.text}
							</p>
						) : (
							<div key={i} className="paper-grid">
								{b.fields.map((f) => (
									<div key={f.id} className="pf" style={{ "--span": f.span ?? 12 } as React.CSSProperties}>
										{f.kind === "checkbox" ? (
											<p className="doc-check">
												<span aria-hidden="true">{show(f)}</span> {f.label}
											</p>
										) : (
											<>
												<span className="pf-label">{f.label}</span>
												<div className="doc-value">{show(f) || "—"}</div>
											</>
										)}
									</div>
								))}
							</div>
						),
					)}
				</section>
			))}
		</article>
	);
}

/** Confirmation letter (fictional wording – hackathon mock, not a real official document). */
function Confirmation({ lang, doc }: { lang: string; doc: CitizenDoc }) {
	const d = doc.data as {
		type?: string;
		citizenName?: string;
		birthDate?: string;
		serviceName?: string;
		authority?: string;
		office?: string;
		slotTime?: string;
		issuedAt?: string;
		details?: Record<string, string>;
		nextSteps?: string[];
	};
	const issued = formatDate(d.issuedAt ?? doc.createdAt, "de");
	let body: React.ReactNode;
	if (d.type === "registration") {
		const main = d.details?.residence_type === "secondary" ? "Nebenwohnsitz" : "Hauptwohnsitz";
		body = (
			<p>
				Es wird bestätigt, dass <strong>{d.citizenName}</strong>, geboren am {formatDate(d.birthDate, "de")}, an der Anschrift{" "}
				<strong>{d.details?.new_address}</strong> mit <strong>{main}</strong>
				{d.details?.move_in_date ? ` seit ${formatDate(d.details.move_in_date, "de")}` : ""} gemeldet ist.
			</p>
		);
	} else if (d.type === "appointment") {
		body = (
			<p>
				Für <strong>{d.citizenName}</strong> wurde folgender Termin gebucht: <strong>{d.serviceName}</strong> am{" "}
				<strong>
					{d.slotTime ? `${formatDay(d.slotTime, "de")}, ${formatTime(d.slotTime, "de")} Uhr` : ""}
				</strong>{" "}
				bei <strong>{d.office}</strong>.
			</p>
		);
	} else {
		body = (
			<p>
				Der Antrag <strong>„{d.serviceName}“</strong> von <strong>{d.citizenName}</strong> ist am {issued} elektronisch eingegangen und wird bearbeitet.
			</p>
		);
	}
	return (
		<article className="paper doc-paper" lang="de">
			{doc.status === "cancelled" && <div className="doc-cancelled">STORNIERT</div>}
			<header className="paper-head">
				<div className="authority">{d.authority}</div>
				<h2>{doc.title}</h2>
				<div className="subtitle">
					Geschäftszahl: <span translate="no">{doc.referenceNumber}</span> · Datum: {issued}
				</div>
			</header>
			{body}
			{d.nextSteps && d.nextSteps.length > 0 && (
				<>
					<h3>Hinweise</h3>
					<ul>
						{d.nextSteps.map((n) => (
							<li key={n}>{n}</li>
						))}
					</ul>
				</>
			)}
			<div className="doc-signature">
				<span className="material-symbols-outlined" aria-hidden="true">
					verified
				</span>
				<div>
					<strong>Amtssignatur (simuliert)</strong>
					<div className="muted">Dieses Dokument wurde elektronisch erstellt · Prototyp, fiktive Daten · {new Intl.DateTimeFormat(uiLocale(lang)).format(new Date(doc.createdAt))}</div>
				</div>
			</div>
		</article>
	);
}
