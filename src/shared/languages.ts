/**
 * Languages offered in the language picker. Any other BCP-47 code also works ("Other language…"),
 * because UI texts and forms are translated on demand by Gemini.
 */
export type LanguageOption = { code: string; name: string; english: string; dir: "ltr" | "rtl" };

export const LANGUAGES: LanguageOption[] = [
	{ code: "de", name: "Deutsch", english: "German", dir: "ltr" },
	{ code: "en", name: "English", english: "English", dir: "ltr" },
	{ code: "uk", name: "Українська", english: "Ukrainian", dir: "ltr" },
	{ code: "tr", name: "Türkçe", english: "Turkish", dir: "ltr" },
	{ code: "ar", name: "العربية", english: "Arabic", dir: "rtl" },
	{ code: "bs", name: "Bosanski / Hrvatski / Srpski", english: "Bosnian/Croatian/Serbian", dir: "ltr" },
	{ code: "fa", name: "فارسی", english: "Persian (Farsi/Dari)", dir: "rtl" },
	{ code: "ro", name: "Română", english: "Romanian", dir: "ltr" },
	{ code: "pl", name: "Polski", english: "Polish", dir: "ltr" },
	{ code: "hu", name: "Magyar", english: "Hungarian", dir: "ltr" },
	{ code: "ru", name: "Русский", english: "Russian", dir: "ltr" },
	{ code: "so", name: "Soomaali", english: "Somali", dir: "ltr" },
	{ code: "es", name: "Español", english: "Spanish", dir: "ltr" },
	{ code: "fr", name: "Français", english: "French", dir: "ltr" },
	{ code: "it", name: "Italiano", english: "Italian", dir: "ltr" },
	{ code: "de-x-easy", name: "Leichte Sprache", english: "German – Easy Read", dir: "ltr" },
];

const RTL = new Set(["ar", "fa", "he", "ur", "ps", "ckb", "yi", "dv"]);

export function languageDir(code: string): "ltr" | "rtl" {
	return RTL.has(code.toLowerCase().split("-")[0]) ? "rtl" : "ltr";
}

export function languageName(code: string): string {
	const known = LANGUAGES.find((l) => l.code === code);
	if (known) return known.english;
	try {
		return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
	} catch {
		return code;
	}
}

/** Validates a language code coming from a client (BCP-47-ish, keeps the cache keys clean). */
export function isValidLanguageCode(code: unknown): code is string {
	return typeof code === "string" && /^[a-z]{2,3}(-[a-zA-Z0-9]{1,8}){0,3}$/.test(code);
}
