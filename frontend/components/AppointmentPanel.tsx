/**
 * Right-hand panel: the free appointments IDA shows while talking to the citizen.
 * Tapping a time opens the confirmation dialog (the citizen books, never the AI alone).
 */
import { useEffect, useRef } from "react";
import type { Slot } from "../api";
import type { T } from "../i18n";
import { panelStore, usePanelStore } from "../lib/panel-store";
import { ResultCard } from "./Messages";
import { SlotPicker } from "./SlotPicker";

export function AppointmentPanel({ t, lang, onPick }: { t: T; lang: string; onPick: (slot: Slot) => void }) {
	const p = usePanelStore();
	const scrollRef = useRef<HTMLDivElement>(null);

	// Scroll the first suggested slot into view.
	useEffect(() => {
		if (!p.highlight.length) return;
		scrollRef.current?.querySelector(".slot.suggested")?.scrollIntoView({ behavior: "smooth", block: "center" });
	}, [p.highlight]);

	return (
		<section className="form-pane" aria-label={t("apptPanelTitle")}>
			<div className="form-toolbar">
				<div className="title">
					<span className="material-symbols-outlined" aria-hidden="true">
						calendar_month
					</span>
					<span>{t("apptPanelTitle")}</span>
				</div>
				<button type="button" className="icon-btn" title={t("apptClose")} aria-label={t("apptClose")} onClick={() => panelStore.set({ active: null })}>
					<span className="material-symbols-outlined" aria-hidden="true">
						close
					</span>
				</button>
			</div>
			<div className="form-status">
				<span className="muted">{t("apptPanelHint")}</span>
			</div>
			<div className="form-scroll" ref={scrollRef}>
				<div className="appt-panel-inner">
					{p.booked && <ResultCard t={t} output={{ ...p.booked, booked: true }} />}
					<h3 className="appt-h3">{t("apptFreeSlots")}</h3>
					{p.loading ? <span className="spinner" aria-label="…" /> : <SlotPicker t={t} lang={lang} slots={p.slots} highlight={p.highlight} onPick={onPick} />}
				</div>
			</div>
		</section>
	);
}
