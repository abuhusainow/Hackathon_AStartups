/**
 * Date helpers for appointment slots. Slot times are local Vienna times ("2026-10-16T08:00");
 * they are shown exactly as stored (no timezone conversion) in the citizen's language.
 */
export function uiLocale(lang: string): string {
	const l = lang === "de-x-easy" ? "de-AT" : lang === "de" ? "de-AT" : lang;
	try {
		new Intl.DateTimeFormat(l);
		return l;
	} catch {
		return "de-AT";
	}
}

export function parseSlotTime(slotTime: string): Date {
	const [d, t = "00:00"] = slotTime.split("T");
	const [y, m, day] = d.split("-").map(Number);
	const [hh, mm] = t.split(":").map(Number);
	return new Date(y, m - 1, day, hh, mm);
}

export function formatDay(slotTime: string, lang: string): string {
	return new Intl.DateTimeFormat(uiLocale(lang), { weekday: "long", day: "numeric", month: "long" }).format(parseSlotTime(slotTime));
}

export function formatShortDay(slotTime: string, lang: string): string {
	return new Intl.DateTimeFormat(uiLocale(lang), { weekday: "short", day: "2-digit", month: "2-digit" }).format(parseSlotTime(slotTime));
}

export function formatTime(slotTime: string, lang: string): string {
	return new Intl.DateTimeFormat(uiLocale(lang), { hour: "2-digit", minute: "2-digit" }).format(parseSlotTime(slotTime));
}

export function slotLabel(slot: { slotTime: string; office: string }, lang: string): string {
	return `${formatDay(slot.slotTime, lang)}, ${formatTime(slot.slotTime, lang)} – ${slot.office}`;
}

/** iCalendar file for "Add to calendar" (floating local time, 30 minutes). */
export function icsFor(a: { bookingId: string; serviceName: string; office: string; slotTime: string; referenceNumber: string }): string {
	const start = parseSlotTime(a.slotTime);
	const end = new Date(start.getTime() + 30 * 60_000);
	const fmt = (d: Date) =>
		`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}${String(d.getMinutes()).padStart(2, "0")}00`;
	const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
	return [
		"BEGIN:VCALENDAR",
		"VERSION:2.0",
		"PRODID:-//IDA Buergerservice//DE",
		"BEGIN:VEVENT",
		`UID:${a.bookingId}@ida.example`,
		`DTSTAMP:${fmt(new Date())}`,
		`DTSTART;TZID=Europe/Vienna:${fmt(start)}`,
		`DTEND;TZID=Europe/Vienna:${fmt(end)}`,
		`SUMMARY:${esc(a.serviceName)}`,
		`LOCATION:${esc(a.office)}`,
		`DESCRIPTION:${esc(`Referenznummer: ${a.referenceNumber}`)}`,
		"END:VEVENT",
		"END:VCALENDAR",
	].join("\r\n");
}

export function downloadIcs(a: Parameters<typeof icsFor>[0]) {
	const url = URL.createObjectURL(new Blob([icsFor(a)], { type: "text/calendar;charset=utf-8" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = `termin-${a.referenceNumber}.ics`;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}
