/**
 * UI texts in any language: German and English are built in (src/shared/ui-strings.ts),
 * every other language is translated once by Gemini, cached in KV and in localStorage.
 */
import { useEffect, useState } from "react";
import { UI_STRINGS, UI_STRINGS_VERSION, type UiDictionary, type UiKey } from "../src/shared/ui-strings";
import { api } from "./api";

export type T = (key: UiKey, vars?: Record<string, string | number>) => string;

function format(text: string, vars?: Record<string, string | number>) {
	return vars ? text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : text;
}

function base(lang: string): UiDictionary {
	return lang.startsWith("de") ? UI_STRINGS.de : UI_STRINGS.en;
}

function readCache(lang: string): UiDictionary | null {
	try {
		const raw = localStorage.getItem(`ida-ui:v${UI_STRINGS_VERSION}:${lang}`);
		return raw ? { ...UI_STRINGS.en, ...JSON.parse(raw) } : null;
	} catch {
		return null;
	}
}

/** Returns a translate function for `lang`. While a new language loads, English (or German) is shown. */
export function useUi(lang: string): { t: T; loading: boolean } {
	const [dict, setDict] = useState<UiDictionary>(() => (lang === "de" || lang === "en" ? UI_STRINGS[lang] : (readCache(lang) ?? base(lang))));
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (lang === "de" || lang === "en") {
			setDict(UI_STRINGS[lang]);
			return;
		}
		const cached = readCache(lang);
		if (cached) {
			setDict(cached);
			return;
		}
		let cancelled = false;
		setDict(base(lang));
		setLoading(true);
		api
			.translateUi(lang)
			.then(({ texts }) => {
				if (cancelled) return;
				try {
					localStorage.setItem(`ida-ui:v${UI_STRINGS_VERSION}:${lang}`, JSON.stringify(texts));
				} catch {
					/* storage full / private mode */
				}
				setDict({ ...UI_STRINGS.en, ...texts } as UiDictionary);
			})
			.catch((err) => console.warn("[i18n] UI translation failed", err))
			.finally(() => !cancelled && setLoading(false));
		return () => {
			cancelled = true;
		};
	}, [lang]);

	return { t: (key, vars) => format(dict[key] ?? UI_STRINGS.en[key] ?? key, vars), loading };
}
