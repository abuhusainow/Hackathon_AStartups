/**
 * Stitch masthead: Republik Österreich brand, navigation, ID Austria badge, language picker and the
 * profile menu (accessibility settings + "What IDA knows about me" memory panel).
 */
import { useEffect, useRef, useState } from "react";
import { LANGUAGES, isValidLanguageCode } from "../../src/shared/languages";
import type { AssistantSettings } from "../../src/shared/types";
import type { Profile } from "../api";
import type { T } from "../i18n";

type Props = {
	t: T;
	profile: Profile;
	settings: AssistantSettings;
	readAloud: boolean;
	onSettings: (patch: Partial<AssistantSettings> & { readAloud?: boolean }) => void;
	onLogout: () => void;
	onToggleSidebar: () => void;
	sidebarOpen: boolean;
};

export function Header({ t, profile, settings, readAloud, onSettings, onLogout, onToggleSidebar, sidebarOpen }: Props) {
	const [open, setOpen] = useState(false);
	const popRef = useRef<HTMLDivElement>(null);
	const btnRef = useRef<HTMLButtonElement>(null);


	useEffect(() => {
		if (!open) return;
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				setOpen(false);
				btnRef.current?.focus();
			}
		};
		const onClick = (e: MouseEvent) => {
			if (!popRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("keydown", onKey);
		document.addEventListener("mousedown", onClick);
		return () => {
			document.removeEventListener("keydown", onKey);
			document.removeEventListener("mousedown", onClick);
		};
	}, [open]);

	const languageKnown = LANGUAGES.some((l) => l.code === settings.language);
	const initials = `${profile.firstName[0] ?? ""}${profile.lastName[0] ?? ""}`;

	return (
		<>
			<div className="masthead-ribbon">
				<span className="material-symbols-outlined" aria-hidden="true">
					lock
				</span>
				<span>Offizielles Portal der Republik Österreich</span>
				<span className="proto">Prototyp · fiktive Daten</span>
			</div>
			<header className="app-header">
				<div className="app-header-inner">
					<div className="brand">
						<button
							type="button"
							className="icon-btn sidebar-toggle"
							aria-label={t("sidebarToggle")}
							aria-expanded={sidebarOpen}
							title={t("sidebarToggle")}
							onClick={onToggleSidebar}
						>
							<span className="material-symbols-outlined" aria-hidden="true">
								menu
							</span>
						</button>
						<img src="/emblem.png" alt="" />
						<div className="brand-divider" aria-hidden="true" />
						<div className="brand-text">
							<span className="brand-top">{t("brandTop")}</span>
							<span className="brand-sub">{t("brandSub")}</span>
						</div>
					</div>

					<div className="header-right">
						
						<span className="id-badge" title="ID Austria">
							<span className="material-symbols-outlined icon-fill" aria-hidden="true">
								verified_user
							</span>
							<span>{t("idBadge")}</span>
						</span>

						<label className="sr-only" htmlFor="ui-language">
							{t("language")}
						</label>
						<select
							id="ui-language"
							className="lang-select"
							value={languageKnown ? settings.language : "__custom"}
							onChange={(e) => {
								if (e.target.value === "__other") {
									const code = window.prompt(t("otherLanguagePrompt"))?.trim().toLowerCase();
									if (code && isValidLanguageCode(code)) onSettings({ language: code });
									return;
								}
								onSettings({ language: e.target.value });
							}}
						>
							{LANGUAGES.map((l) => (
								<option key={l.code} value={l.code}>
									{l.name}
								</option>
							))}
							{!languageKnown && <option value="__custom">{settings.language}</option>}
							<option value="__other">{t("otherLanguage")}</option>
						</select>

						<button
							ref={btnRef}
							type="button"
							className="profile-btn"
							aria-expanded={open}
							aria-haspopup="dialog"
							aria-label={t("profileMenu")}
							onClick={() => setOpen((o) => !o)}
						>
							<span className="avatar-initials" aria-hidden="true">
								{initials}
							</span>
							<span>
								{profile.firstName[0]}. {profile.lastName}
							</span>
						</button>
					</div>
				</div>

				{open && (
					<div ref={popRef} className="popover" role="dialog" aria-label={t("profileMenu")}>
						<h2>
							{profile.firstName} {profile.lastName}
						</h2>
						<span className="id-badge">
							<span className="material-symbols-outlined icon-fill" aria-hidden="true">
								verified_user
							</span>
							{t("idBadge")}
						</span>

						<h3>{t("accessibility")}</h3>
						<div className="setting-row">
							<span id="lbl-size">{t("textSize")}</span>
							<div className="segmented" role="group" aria-labelledby="lbl-size">
								{[1, 1.25, 1.5, 1.75, 2].map((scale) => (
									<button key={scale} type="button" aria-pressed={settings.textScale === scale} onClick={() => onSettings({ textScale: scale })}>
										{Math.round(scale * 100)}%
									</button>
								))}
							</div>
						</div>
						<Toggle label={t("highContrast")} checked={settings.contrast === "high"} onChange={(v) => onSettings({ contrast: v ? "high" : "normal" })} />
						<Toggle label={t("easyLanguage")} checked={settings.easyLanguage} onChange={(v) => onSettings({ easyLanguage: v })} />
						<Toggle label={t("readAloud")} checked={readAloud} onChange={(v) => onSettings({ readAloud: v })} />

						<div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap" }}>
							<button type="button" className="btn btn-ghost btn-sm" onClick={onLogout}>
								<span className="material-symbols-outlined" aria-hidden="true">
									logout
								</span>
								{t("logout")}
							</button>
						</div>
					</div>
				)}
			</header>
		</>
	);
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
	return (
		<div className="setting-row">
			<span>{label}</span>
			<button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
		</div>
	);
}
