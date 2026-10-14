/**
 * Simulated ID Austria login (Stitch "ID Austria Verification Block"):
 *   1. choose a fictional test identity
 *   2. "confirm in the Digitales Amt app" (QR code + approve button)
 *   3. verification stamp → session cookie (POST /api/auth/login)
 */
import { useEffect, useMemo, useState } from "react";
import { languageName } from "../../src/shared/languages";
import { api, type Persona } from "../api";
import { useUi } from "../i18n";

const NEED_LABELS: Record<string, string> = {
	vision: "Sehen",
	hearing: "Hören",
	motor: "Motorik",
	cognitive: "Leichte Sprache",
};

/** Deterministic pseudo QR pattern (decoration only). */
function QrCode({ seed }: { seed: string }) {
	const cells = useMemo(() => {
		let h = 2166136261;
		for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
		const out: boolean[] = [];
		for (let i = 0; i < 25 * 25; i++) {
			h = Math.imul(h ^ (h >>> 13), 1274126177);
			out.push((h & 1) === 1);
		}
		return out;
	}, [seed]);
	const finder = (x: number, y: number) => (x < 7 && y < 7) || (x > 17 && y < 7) || (x < 7 && y > 17);
	return (
		<svg className="qr" viewBox="0 0 25 25" role="img" aria-label="QR-Code (Simulation)">
			<rect width="25" height="25" fill="#fff" />
			{cells.map((on, i) => {
				const x = i % 25;
				const y = Math.floor(i / 25);
				if (finder(x, y)) return null;
				return on ? <rect key={i} x={x} y={y} width="1" height="1" fill="#0a1b2a" /> : null;
			})}
			{[
				[0, 0],
				[18, 0],
				[0, 18],
			].map(([x, y]) => (
				<g key={`${x}-${y}`}>
					<rect x={x} y={y} width="7" height="7" fill="#0a1b2a" />
					<rect x={x + 1} y={y + 1} width="5" height="5" fill="#fff" />
					<rect x={x + 2} y={y + 2} width="3" height="3" fill="#0a1b2a" />
				</g>
			))}
		</svg>
	);
}

export function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
	const [lang, setLang] = useState<"de" | "en">(navigator.language.startsWith("de") ? "de" : "en");
	const { t } = useUi(lang);
	const [personas, setPersonas] = useState<Persona[]>([]);
	const [selected, setSelected] = useState<string>("");
	const [step, setStep] = useState<1 | 2 | 3>(1);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		document.documentElement.lang = lang;
		document.title = `${t("loginTitle")} · IDA`;
	}, [lang, t]);

	useEffect(() => {
		api
			.personas()
			.then((p) => {
				setPersonas(p);
				setSelected((s) => s || p[0]?.id || "");
			})
			.catch((e) => setError(e.message));
	}, []);

	async function approve() {
		setStep(3);
		try {
			await new Promise((r) => setTimeout(r, 1100)); // "verifying" animation
			await api.login(selected);
			onLoggedIn();
		} catch (e) {
			setError((e as Error).message);
			setStep(2);
		}
	}

	return (
		<div className="login-page">
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
						<img src="/emblem.png" alt="" />
						<div className="brand-divider" aria-hidden="true" />
						<div className="brand-text">
							<span className="brand-top">{t("brandTop")}</span>
							<span className="brand-sub">{t("brandSub")}</span>
						</div>
					</div>
					<div className="segmented" role="group" aria-label={t("language")}>
						{(["de", "en"] as const).map((l) => (
							<button key={l} type="button" aria-pressed={lang === l} onClick={() => setLang(l)}>
								{l.toUpperCase()}
							</button>
						))}
					</div>
				</div>
			</header>

			<main className="login-main">
				<div className="login-card">
					<header>
						<span className="material-symbols-outlined icon-fill" aria-hidden="true" style={{ fontSize: 36 }}>
							shield_person
						</span>
						<div>
							<h1>{t("loginTitle")}</h1>
							<p>{t("loginSub")}</p>
						</div>
					</header>

					<div className="login-body">
						<p className="badge pending" style={{ display: "inline-flex" }}>
							<span className="material-symbols-outlined" aria-hidden="true">
								science
							</span>
							{t("loginSimNote")}
						</p>
						{error && (
							<p role="alert" className="badge pending" style={{ display: "block", marginTop: 8 }}>
								{error}
							</p>
						)}

						{step === 1 && (
							<form
								onSubmit={(e) => {
									e.preventDefault();
									if (selected) setStep(2);
								}}
							>
								<fieldset className="persona-list">
									<legend style={{ fontWeight: 700, marginTop: 16 }}>{t("loginChoose")}</legend>
									{personas.map((p) => (
										<label key={p.id} className="persona-card">
											<input type="radio" name="persona" value={p.id} checked={selected === p.id} onChange={() => setSelected(p.id)} />
											<div>
												<div className="name">{p.name}</div>
												<div className="hint">{p.scenarioHint}</div>
												<div className="tags">
													{p.languages.map((l) => (
														<span key={l} className="tag" lang="en">
															{languageName(l)}
														</span>
													))}
													{Object.keys(p.accessibility)
														.filter((k) => k !== "note")
														.map((k) => (
															<span key={k} className="tag need">
																{NEED_LABELS[k] ?? k}
															</span>
														))}
												</div>
											</div>
										</label>
									))}
								</fieldset>
								<button type="submit" className="btn btn-primary" disabled={!selected}>
									<span className="material-symbols-outlined" aria-hidden="true">
										login
									</span>
									{t("loginContinue")}
								</button>
							</form>
						)}

						{step >= 2 && (
							<div className="login-step2" style={{ marginTop: 20 }}>
								<QrCode seed={selected} />
								<div>
									<p style={{ fontWeight: 600, marginTop: 0 }}>{t("loginStep2")}</p>
									<p className="muted">{t("loginScan")}</p>
									{step === 2 ? (
										<div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
											<button type="button" className="btn btn-primary" onClick={approve} autoFocus>
												<span className="material-symbols-outlined" aria-hidden="true">
													phone_iphone
												</span>
												{t("loginApprove")}
											</button>
											<button type="button" className="btn btn-ghost" onClick={() => setStep(1)}>
												{t("loginBack")}
											</button>
										</div>
									) : (
										<p role="status" style={{ display: "flex", alignItems: "center", gap: 10 }}>
											<span className="spinner" />
											{t("loginVerifying")}
										</p>
									)}
								</div>
							</div>
						)}

						<div className="security-stamp">
							<span className="material-symbols-outlined" aria-hidden="true">
								encrypted
							</span>
							<span>
								{t("loginIssuer")} · eIDAS „hoch“ · {new Date().toLocaleString(lang === "de" ? "de-AT" : "en-GB")}
							</span>
						</div>
					</div>
				</div>
			</main>
		</div>
	);
}
