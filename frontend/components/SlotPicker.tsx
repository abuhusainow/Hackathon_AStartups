/**
 * Visual appointment selection: free slots grouped by day, times as large buttons.
 * Used in the panel on the right (booking with IDA) and on the "Meine Termine" page.
 */
import type { Slot } from "../api";
import type { T } from "../i18n";
import { formatDay, formatTime } from "../lib/datetime";

export function SlotPicker({
	t,
	lang,
	slots,
	highlight = [],
	onPick,
	disabled,
}: {
	t: T;
	lang: string;
	slots: Slot[];
	highlight?: string[];
	onPick: (slot: Slot) => void;
	disabled?: boolean;
}) {
	if (!slots.length) return <p className="muted">{t("apptNoSlots")}</p>;
	const days = new Map<string, Slot[]>();
	for (const s of slots) {
		const day = s.slotTime.slice(0, 10);
		days.set(day, [...(days.get(day) ?? []), s]);
	}
	return (
		<div className="slot-days">
			{[...days.entries()].map(([day, daySlots]) => (
				<section key={day} className="slot-day" aria-label={formatDay(daySlots[0].slotTime, lang)}>
					<h4>{formatDay(daySlots[0].slotTime, lang)}</h4>
					<ul className="slot-list">
						{daySlots.map((s) => {
							const suggested = highlight.includes(s.id);
							return (
								<li key={s.id}>
									<button
										type="button"
										className={`slot${suggested ? " suggested" : ""}`}
										disabled={disabled}
										onClick={() => onPick(s)}
										aria-label={`${formatDay(s.slotTime, lang)}, ${formatTime(s.slotTime, lang)}, ${s.office}${suggested ? ` (${t("apptSuggested")})` : ""}`}
									>
										<span className="slot-time">{formatTime(s.slotTime, lang)}</span>
										<span className="slot-office">{s.office}</span>
										{suggested && (
											<span className="slot-badge">
												<span className="material-symbols-outlined" aria-hidden="true">
													auto_awesome
												</span>
												{t("apptSuggested")}
											</span>
										)}
									</button>
								</li>
							);
						})}
					</ul>
				</section>
			))}
		</div>
	);
}
