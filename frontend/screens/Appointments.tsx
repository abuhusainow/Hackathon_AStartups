/**
 * "Meine Termine": the citizen's booked appointments (add to calendar, cancel) and booking a new
 * appointment with the visual slot picker. Every binding action goes through a confirmation dialog.
 */
import { useCallback, useEffect, useState } from "react";
import { api, type MyAppointment, type Slot } from "../api";
import type { T } from "../i18n";
import { downloadIcs, formatDay, formatTime, slotLabel } from "../lib/datetime";
import { SlotPicker } from "../components/SlotPicker";

type Props = {
	t: T;
	lang: string;
	onAskIda: () => void;
	confirmBooking: (slot: { slotId: string; slotLabel: string }) => Promise<boolean>;
	confirmCancel: (label: string) => Promise<boolean>;
	notify: (text: string) => void;
	/** Increments when a booking happened elsewhere (e.g. with IDA) → reload. */
	refreshKey: number;
};

export function Appointments({ t, lang, onAskIda, confirmBooking, confirmCancel, notify, refreshKey }: Props) {
	const [data, setData] = useState<{ upcoming: MyAppointment[]; history: MyAppointment[] } | null>(null);
	const [services, setServices] = useState<{ id: string; name: string }[]>([]);
	const [serviceId, setServiceId] = useState("");
	const [slots, setSlots] = useState<Slot[] | null>(null);
	const [busy, setBusy] = useState(false);

	const load = useCallback(() => {
		api.appointments(lang).then(setData).catch((e) => notify((e as Error).message));
	}, [lang, notify]);

	useEffect(load, [load, refreshKey]);

	useEffect(() => {
		api
			.appointmentServices(lang)
			.then((list) => {
				setServices(list);
				setServiceId((s) => s || list[0]?.id || "");
			})
			.catch(() => {});
	}, [lang]);

	useEffect(() => {
		if (!serviceId) return;
		setSlots(null);
		api
			.appointmentSlots(serviceId)
			.then((r) => setSlots(r.slots))
			.catch(() => setSlots([]));
	}, [serviceId, refreshKey]);

	async function book(slot: Slot) {
		const label = slotLabel(slot, lang);
		if (!(await confirmBooking({ slotId: slot.id, slotLabel: label }))) return;
		setBusy(true);
		try {
			const r = await api.bookAppointment(slot.id, lang);
			notify(`${t("booked")}: ${label} · ${r.referenceNumber}`);
			setSlots((s) => s?.filter((x) => x.id !== slot.id) ?? null);
			load();
		} catch (e) {
			notify((e as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function cancel(a: MyAppointment) {
		const label = `${a.serviceName} – ${formatDay(a.slotTime, lang)}, ${formatTime(a.slotTime, lang)}`;
		if (!(await confirmCancel(label))) return;
		try {
			await api.cancelAppointment(a.bookingId);
			notify(`${t("apptCancelled")}: ${label}`);
			load();
			setSlots(null);
			api.appointmentSlots(serviceId).then((r) => setSlots(r.slots));
		} catch (e) {
			notify((e as Error).message);
		}
	}

	return (
		<main className="appt-page" id="main">
			<div className="appt-head">
				<div>
					<h1>{t("navAppointments")}</h1>
					<p className="muted">{t("apptIntro")}</p>
				</div>
				<button type="button" className="btn btn-secondary" onClick={onAskIda}>
					<span className="material-symbols-outlined" aria-hidden="true">
						support_agent
					</span>
					{t("apptAskIda")}
				</button>
			</div>

			<section aria-labelledby="appt-upcoming">
				<h2 id="appt-upcoming">{t("apptUpcoming")}</h2>
				{!data ? (
					<span className="spinner" aria-label="…" />
				) : data.upcoming.length === 0 ? (
					<p className="appt-empty">{t("apptNone")}</p>
				) : (
					<ul className="appt-list">
						{data.upcoming.map((a) => (
							<li key={a.bookingId} className="appt-card">
								<div className="appt-date" aria-hidden="true">
									<span className="appt-day">{formatDay(a.slotTime, lang)}</span>
									<span className="appt-time">{formatTime(a.slotTime, lang)}</span>
								</div>
								<div className="appt-body">
									<h3>{a.serviceName}</h3>
									<p className="sr-only">
										{formatDay(a.slotTime, lang)}, {formatTime(a.slotTime, lang)}
									</p>
									<p>
										<span className="material-symbols-outlined" aria-hidden="true">
											location_on
										</span>
										{a.office}
									</p>
									<p>
										{t("reference")}:{" "}
										<span className="ref" translate="no">
											{a.referenceNumber}
										</span>
									</p>
									{a.nextSteps.length > 0 && (
										<details>
											<summary>{t("apptBring")}</summary>
											<ul>
												{a.nextSteps.map((n) => (
													<li key={n}>{n}</li>
												))}
											</ul>
										</details>
									)}
									<div className="appt-actions">
										<button type="button" className="btn btn-secondary btn-sm" onClick={() => downloadIcs(a)}>
											<span className="material-symbols-outlined" aria-hidden="true">
												event
											</span>
											{t("apptCalendar")}
										</button>
										<button type="button" className="btn btn-ghost btn-sm" onClick={() => cancel(a)}>
											<span className="material-symbols-outlined" aria-hidden="true">
												event_busy
											</span>
											{t("apptCancel")}
										</button>
									</div>
								</div>
							</li>
						))}
					</ul>
				)}
			</section>

			<section aria-labelledby="appt-new" className="appt-new">
				<h2 id="appt-new">{t("apptBookNew")}</h2>
				<label className="appt-service">
					<span>{t("apptService")}</span>
					<select className="lang-select" value={serviceId} onChange={(e) => setServiceId(e.target.value)}>
						{services.map((s) => (
							<option key={s.id} value={s.id}>
								{s.name}
							</option>
						))}
					</select>
				</label>
				{slots === null ? <span className="spinner" aria-label="…" /> : <SlotPicker t={t} lang={lang} slots={slots} onPick={book} disabled={busy} />}
			</section>

			{data && data.history.length > 0 && (
				<details className="appt-history">
					<summary>
						<h2>{t("apptHistory")}</h2>
					</summary>
					<ul className="appt-list compact">
						{data.history.map((a) => (
							<li key={a.bookingId} className="appt-card muted-card">
								<div className="appt-body">
									<h3>{a.serviceName}</h3>
									<p>
										{formatDay(a.slotTime, lang)}, {formatTime(a.slotTime, lang)} · {a.office}
									</p>
									<span className={`badge ${a.status === "cancelled" ? "pending" : "layer"}`}>{a.status === "cancelled" ? t("apptCancelled") : t("apptPast")}</span>{" "}
									<span className="ref" translate="no">
										{a.referenceNumber}
									</span>
								</div>
							</li>
						))}
					</ul>
				</details>
			)}
		</main>
	);
}
