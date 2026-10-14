/**
 * "Was IDA sich merkt": the long-term memory, transparent and editable by the citizen (GDPR).
 * Entries can be corrected, added and deleted; the decision model never stores IDs or case data.
 */
import { useEffect, useState } from "react";
import { languageName } from "../../src/shared/languages";
import type { MemoryCategory, MemoryItem } from "../../src/shared/types";
import { api } from "../api";
import type { T } from "../i18n";
import { uiLocale } from "../lib/datetime";

/** Friendly German names for the keys the app uses (other keys are shown humanised). */
const KEY_LABELS: Record<string, string> = {
	preferred_language: "Bevorzugte Sprache",
	text_size: "Schriftgröße",
	high_contrast: "Hoher Kontrast",
	easy_language: "Leichte Sprache",
	prefers_voice: "Spricht lieber, als zu tippen",
	read_aloud: "Antworten vorlesen",
	vision: "Sehen",
	hearing: "Hören",
	german_level: "Deutschkenntnisse",
	children: "Kinder",
	contact_preference: "Kontaktwunsch",
};

const CATEGORIES: MemoryCategory[] = ["language", "barrier", "preference", "context"];

export function MemoryPage({ t, lang, confirmDelete }: { t: T; lang: string; confirmDelete: (title: string, text: string) => Promise<boolean> }) {
	const [items, setItems] = useState<MemoryItem[] | null>(null);
	const [editing, setEditing] = useState<string | null>(null);
	const [draft, setDraft] = useState("");
	const [adding, setAdding] = useState({ key: "", value: "", category: "preference" as MemoryCategory });

	const load = () => api.memory().then(setItems).catch(() => setItems([]));
	useEffect(() => {
		load();
	}, []);

	const catLabel = (c: MemoryCategory) =>
		({ preference: t("memoryCatPreference"), language: t("memoryCatLanguage"), barrier: t("memoryCatBarrier"), context: t("memoryCatContext") })[c];
	const sourceLabel = (s: MemoryItem["source"]) =>
		({ explicit: t("memSourceExplicit"), chat: t("memSourceChat"), voice: t("memSourceVoice"), profile: t("memSourceProfile") })[s];
	const keyLabel = (k: string) => KEY_LABELS[k] ?? k.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
	const valueLabel = (m: MemoryItem) => {
		const v = m.value.trim();
		if (/^(true|yes)$/i.test(v)) return t("yes");
		if (/^(false|no)$/i.test(v)) return t("no");
		if (m.key === "preferred_language") return languageName(v);
		if (m.key === "text_size" && Number(v)) return `${Math.round(Number(v) * 100)} %`;
		return v;
	};

	async function save(m: MemoryItem) {
		if (!draft.trim()) return;
		await api.updateMemory(m.id, { value: draft.trim() });
		setEditing(null);
		load();
	}

	return (
		<main className="appt-page" id="main">
			<div className="appt-head">
				<div>
					<h1>{t("navMemory")}</h1>
					<p className="muted">{t("memIntro")}</p>
				</div>
				{items && items.length > 0 && (
					<button
						type="button"
						className="btn btn-ghost"
						onClick={async () => {
							if (await confirmDelete(t("memDeleteAllTitle"), t("memDeleteAllText"))) api.clearMemory().then(load);
						}}
					>
						<span className="material-symbols-outlined" aria-hidden="true">
							delete_sweep
						</span>
						{t("memoryDeleteAll")}
					</button>
				)}
			</div>

			{items === null ? (
				<span className="spinner" aria-label="…" />
			) : items.length === 0 ? (
				<p className="appt-empty">{t("memoryEmpty")}</p>
			) : (
				CATEGORIES.filter((c) => items.some((m) => m.category === c)).map((c) => (
					<section key={c} aria-labelledby={`mem-${c}`}>
						<h2 id={`mem-${c}`}>{catLabel(c)}</h2>
						<ul className="mem-list">
							{items
								.filter((m) => m.category === c)
								.map((m) => (
									<li key={m.id} className="mem-card">
										<div className="mem-body">
											<h3>{keyLabel(m.key)}</h3>
											{editing === m.id ? (
												<form
													className="mem-edit"
													onSubmit={(e) => {
														e.preventDefault();
														void save(m);
													}}
												>
													<label className="sr-only" htmlFor={`mem-input-${m.id}`}>
														{keyLabel(m.key)}
													</label>
													<input id={`mem-input-${m.id}`} className="pf-input" value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
													<button type="submit" className="btn btn-primary btn-sm">
														{t("memSave")}
													</button>
													<button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>
														{t("cancel")}
													</button>
												</form>
											) : (
												<p className="mem-value">{valueLabel(m)}</p>
											)}
											<p className="muted mem-meta">
												{sourceLabel(m.source)} · {new Intl.DateTimeFormat(uiLocale(lang), { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(m.updatedAt))}
											</p>
										</div>
										{editing !== m.id && (
											<div className="mem-actions">
												<button
													type="button"
													className="icon-btn"
													aria-label={`${t("memEdit")}: ${keyLabel(m.key)}`}
													title={t("memEdit")}
													onClick={() => {
														setEditing(m.id);
														setDraft(m.value);
													}}
												>
													<span className="material-symbols-outlined" aria-hidden="true">
														edit
													</span>
												</button>
												<button
													type="button"
													className="icon-btn"
													aria-label={`${t("memoryDelete")}: ${keyLabel(m.key)}`}
													title={t("memoryDelete")}
													onClick={() => api.deleteMemory(m.id).then(load)}
												>
													<span className="material-symbols-outlined" aria-hidden="true">
														delete
													</span>
												</button>
											</div>
										)}
									</li>
								))}
						</ul>
					</section>
				))
			)}

			<section className="appt-new" aria-labelledby="mem-add">
				<h2 id="mem-add">{t("memAdd")}</h2>
				<form
					className="mem-add-form"
					onSubmit={async (e) => {
						e.preventDefault();
						if (!adding.key.trim() || !adding.value.trim()) return;
						setItems(await api.addMemory({ key: adding.key.trim(), value: adding.value.trim(), category: adding.category }));
						setAdding({ key: "", value: "", category: adding.category });
					}}
				>
					<label>
						<span className="pf-label">{t("memCategory")}</span>
						<select className="pf-input" value={adding.category} onChange={(e) => setAdding({ ...adding, category: e.target.value as MemoryCategory })}>
							{CATEGORIES.map((c) => (
								<option key={c} value={c}>
									{catLabel(c)}
								</option>
							))}
						</select>
					</label>
					<label>
						<span className="pf-label">{t("memKey")}</span>
						<input className="pf-input" value={adding.key} placeholder={t("memKeyPlaceholder")} onChange={(e) => setAdding({ ...adding, key: e.target.value })} required />
					</label>
					<label className="mem-add-value">
						<span className="pf-label">{t("memValue")}</span>
						<input className="pf-input" value={adding.value} onChange={(e) => setAdding({ ...adding, value: e.target.value })} required />
					</label>
					<button type="submit" className="btn btn-primary">
						<span className="material-symbols-outlined" aria-hidden="true">
							add
						</span>
						{t("memSave")}
					</button>
				</form>
			</section>
		</main>
	);
}
