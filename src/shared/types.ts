/**
 * Types shared between the Worker (server) and the React frontend.
 * Keep this file free of runtime dependencies so both sides can import it.
 */

/** Languages the mock government data is maintained in (labels, knowledge, next steps). */
export type Language = "de" | "en";

/** Any BCP-47 language code the citizen can choose for the UI, the chat and form translations. */
export type UiLanguage = string;

export type ContrastMode = "normal" | "high";

/** Settings the frontend syncs to the chat agent (via Agent state). */
export type AssistantSettings = {
	/** Reply / UI language (BCP-47, e.g. "de", "en", "uk", "tr", "ar"). */
	language: UiLanguage;
	/** Text size multiplier (1 = 100 %). */
	textScale: number;
	contrast: ContrastMode;
	/** Answer in plain language (Leichte Sprache / Easy Read). */
	easyLanguage: boolean;
	/** The citizen prefers to talk instead of type. */
	preferVoice: boolean;
};

export const DEFAULT_SETTINGS: AssistantSettings = {
	language: "de",
	textScale: 1,
	contrast: "normal",
	easyLanguage: false,
	preferVoice: false,
};

/** Data from the mock government backend is only available in German and English. */
export function govLang(lang: UiLanguage | undefined): Language {
	return lang?.toLowerCase().startsWith("de") ? "de" : "en";
}

/** Accessibility needs stored with a persona (simulated: what the citizen told the authority before). */
export type AccessibilityProfile = {
	vision?: "low_vision" | "blind";
	hearing?: "hard_of_hearing" | "deaf";
	motor?: "limited";
	cognitive?: "easy_language";
	/** Free text, e.g. "Prefers short written answers". */
	note?: string;
};

export type MemoryCategory = "preference" | "language" | "barrier" | "context";

export type MemoryItem = {
	id: string;
	key: string;
	value: string;
	category: MemoryCategory;
	confidence: number;
	source: "chat" | "voice" | "explicit" | "profile";
	updatedAt: string;
};

/** The state of the form shown in the right panel. Sent with every chat request / live session. */
export type FormState = {
	formId: string;
	applicationId: string | null;
	values: Record<string, string>;
	/** Field ids that are required but still empty. */
	missing: string[];
	translatedTo: UiLanguage | null;
	focusedField: string | null;
};
