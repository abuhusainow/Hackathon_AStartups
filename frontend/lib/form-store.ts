/**
 * State of the interactive form panel + the executor for "client tools" (tools the AI calls that run
 * in the browser). The same executor serves the text chat (useAgentChat onToolCall) and the Gemini
 * Live voice session (toolCall messages), so both channels behave identically.
 */
import { useSyncExternalStore } from "react";
import { allFields, getForm, isoToAt, missingRequired, type FormDefinition, type FormFieldDef } from "../../src/shared/forms";
import type { AssistantSettings, FormState } from "../../src/shared/types";
import { api, type BookingResult, type Profile, type SubmissionResult } from "../api";

export type AutoFillSource = "register" | "ida";

export type FormUiState = {
	formId: string | null;
	values: Record<string, string>;
	applicationId: string | null;
	translation: { lang: string; texts: Record<string, string> } | null;
	translationVisible: boolean;
	translating: boolean;
	highlight: string | null;
	hint: { fieldId: string; text: string } | null;
	autoFilled: Record<string, AutoFillSource>;
	submitted: SubmissionResult | null;
	/** Increments when the AI wants the panel to be shown (mobile tab switch). */
	revealTick: number;
};

const INITIAL: FormUiState = {
	formId: null,
	values: {},
	applicationId: null,
	translation: null,
	translationVisible: false,
	translating: false,
	highlight: null,
	hint: null,
	autoFilled: {},
	submitted: null,
	revealTick: 0,
};

let state: FormUiState = INITIAL;
const listeners = new Set<() => void>();

export const formStore = {
	get: () => state,
	set(patch: Partial<FormUiState> | ((s: FormUiState) => Partial<FormUiState>)) {
		state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
		listeners.forEach((l) => l());
	},
	subscribe(l: () => void) {
		listeners.add(l);
		return () => listeners.delete(l);
	},
	reset() {
		formStore.set(INITIAL);
	},
};

export function useFormStore(): FormUiState {
	return useSyncExternalStore(formStore.subscribe, formStore.get, formStore.get);
}

export function currentForm(): FormDefinition | undefined {
	return state.formId ? getForm(state.formId) : undefined;
}

/** Snapshot sent to the AI (chat request body / live session setup). */
export function formStateSnapshot(): FormState | null {
	const form = currentForm();
	if (!form) return null;
	return {
		formId: form.id,
		applicationId: state.applicationId,
		values: state.values,
		missing: missingRequired(form, state.values),
		translatedTo: state.translationVisible ? (state.translation?.lang ?? null) : null,
		focusedField: state.highlight,
	};
}

// ---------------------------------------------------------------------------------------------
// Value normalisation (the AI and the citizen may write values in many ways)
// ---------------------------------------------------------------------------------------------

export function normalizeValue(field: FormFieldDef, raw: string): { ok: true; value: string } | { ok: false; reason: string } {
	const value = String(raw ?? "").trim();
	if (field.kind === "checkbox") {
		const v = value.toLowerCase();
		if (["yes", "ja", "true", "1", "x", "так", "evet", "نعم", "да"].includes(v)) return { ok: true, value: "yes" };
		if (["no", "nein", "false", "0", "", "ні", "hayır", "لا", "нет"].includes(v)) return { ok: true, value: "no" };
		return { ok: false, reason: 'Checkbox values must be "yes" or "no"' };
	}
	if (field.kind === "radio" || field.kind === "select") {
		const opts = field.options ?? [];
		const match =
			opts.find((o) => o.value === value) ??
			opts.find((o) => o.value.toLowerCase() === value.toLowerCase() || o.label.toLowerCase() === value.toLowerCase()) ??
			opts.find((o) => o.label.toLowerCase().startsWith(value.toLowerCase()) && value.length >= 3);
		if (!match) return { ok: false, reason: `Must be one of: ${opts.map((o) => o.value).join(" | ")}` };
		return { ok: true, value: match.value };
	}
	if (field.kind === "date") {
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { ok: true, value: isoToAt(value) };
		const m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(value);
		if (m) return { ok: true, value: `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}` };
		if (!value) return { ok: true, value: "" };
		return { ok: false, reason: "Dates must be TT.MM.JJJJ (e.g. 01.10.2026)" };
	}
	if (field.kind === "signature") return { ok: false, reason: "The signature is added automatically with ID Austria when submitting." };
	return { ok: true, value };
}

let draftTimer: number | null = null;

/** Saves the draft application in the background (debounced). */
function scheduleDraftSave(lang: string) {
	if (draftTimer) clearTimeout(draftTimer);
	draftTimer = window.setTimeout(() => {
		const form = currentForm();
		if (!form) return;
		api
			.saveDraft(form.id, state.values, lang)
			.then((r) => formStore.set({ applicationId: r.applicationId }))
			.catch((err) => console.warn("[form] draft not saved", err));
	}, 800);
}

/** Called when the citizen types into the form themselves. */
export function setFieldByCitizen(fieldId: string, value: string, lang: string) {
	formStore.set((s) => {
		const autoFilled = { ...s.autoFilled };
		delete autoFilled[fieldId];
		return { values: { ...s.values, [fieldId]: value }, autoFilled, submitted: null };
	});
	scheduleDraftSave(lang);
}

export async function translateCurrentForm(lang: string) {
	const form = currentForm();
	if (!form) return null;
	if (lang === "de") {
		formStore.set({ translationVisible: false });
		return { lang, cached: true };
	}
	if (state.translation?.lang === lang) {
		formStore.set({ translationVisible: true });
		return { lang, cached: true };
	}
	formStore.set({ translating: true });
	try {
		const res = await api.translateForm(form.id, lang);
		formStore.set({ translation: { lang, texts: res.texts }, translationVisible: true });
		return { lang, cached: res.cached };
	} finally {
		formStore.set({ translating: false });
	}
}

function fieldSummary(form: FormDefinition) {
	return allFields(form).map((f) => ({
		id: f.id,
		label: f.label,
		kind: f.kind,
		required: !!f.required,
		...(f.options ? { options: f.options.map((o) => o.value) } : {}),
	}));
}

// ---------------------------------------------------------------------------------------------
// Client tool executor
// ---------------------------------------------------------------------------------------------

export type ClientToolDeps = {
	getProfile: () => Profile | null;
	getSettings: () => AssistantSettings;
	applySettings: (patch: Partial<AssistantSettings> & { readAloud?: boolean }) => void;
	confirmSubmission: () => Promise<boolean>;
	confirmBooking: (slot: { slotId: string; slotLabel: string }) => Promise<boolean>;
	notify: (text: string) => void;
	onSubmitted?: (result: SubmissionResult | BookingResult) => void;
};

export function openForm(formId: string, profile: Profile | null) {
	const form = getForm(formId);
	if (!form) return null;
	const sameForm = state.formId === form.id;
	const prefill = profile ? form.prefill(profile, profile.today ?? new Date().toISOString().slice(0, 10)) : {};
	const autoFilled: Record<string, AutoFillSource> = sameForm ? { ...state.autoFilled } : {};
	const values: Record<string, string> = sameForm ? { ...state.values } : {};
	for (const [k, v] of Object.entries(prefill)) {
		if (!values[k] && v) {
			values[k] = v;
			autoFilled[k] = "register";
		}
	}
	formStore.set((s) => ({
		formId: form.id,
		values,
		autoFilled,
		applicationId: sameForm ? s.applicationId : null,
		translation: sameForm ? s.translation : null,
		translationVisible: sameForm ? s.translationVisible : false,
		submitted: null,
		highlight: null,
		hint: null,
		revealTick: s.revealTick + 1,
	}));
	return { form, prefill };
}

export function createClientToolExecutor(deps: ClientToolDeps) {
	const lang = () => deps.getSettings().language;

	return async function run(name: string, input: Record<string, any>): Promise<unknown> {
		switch (name) {
			case "open_form": {
				const previousLayer = state.translationVisible ? (state.translation?.lang ?? null) : null;
				const opened = openForm(String(input.formId), deps.getProfile());
				if (!opened) return { error: `Unknown form ${input.formId}` };
				const { form, prefill } = opened;
				scheduleDraftSave(lang());
				// The translation layer is only laid over a form when the citizen wants it (translate_form) –
				// once they chose a layer language, the next form gets it too.
				if (previousLayer && state.translation?.lang !== previousLayer) void translateCurrentForm(previousLayer).catch(() => {});
				return {
					opened: true,
					formId: form.id,
					title: form.title,
					prefilledFromRegister: prefill,
					fields: fieldSummary(form),
					missingRequired: missingRequired(form, state.values),
				};
			}
			case "fill_fields": {
				const form = currentForm();
				if (!form) return { error: "No form is open. Call open_form first." };
				const defs = new Map(allFields(form).map((f) => [f.id, f]));
				const filled: string[] = [];
				const rejected: { fieldId: string; reason: string }[] = [];
				const values = { ...state.values };
				const autoFilled = { ...state.autoFilled };
				for (const { fieldId, value } of (input.fields ?? []) as { fieldId: string; value: string }[]) {
					const def = defs.get(fieldId);
					if (!def) {
						rejected.push({ fieldId, reason: "Unknown field id" });
						continue;
					}
					const n = normalizeValue(def, value);
					if (!n.ok) {
						rejected.push({ fieldId, reason: n.reason });
						continue;
					}
					values[fieldId] = n.value;
					autoFilled[fieldId] = "ida";
					filled.push(fieldId);
				}
				const lastFilled = filled[filled.length - 1] ?? null;
				formStore.set({ values, autoFilled, highlight: lastFilled, hint: null, submitted: null });
				scheduleDraftSave(lang());
				return { filled, rejected, missingRequired: missingRequired(form, values) };
			}
			case "focus_field": {
				const form = currentForm();
				if (!form) return { error: "No form is open." };
				const fieldId = String(input.fieldId);
				if (!allFields(form).some((f) => f.id === fieldId)) return { error: `Unknown field ${fieldId}` };
				formStore.set((s) => ({
					highlight: fieldId,
					hint: input.hint ? { fieldId, text: String(input.hint) } : null,
					revealTick: s.revealTick + 1,
				}));
				return { focused: fieldId };
			}
			case "get_form_state": {
				const snap = formStateSnapshot();
				return snap ?? { open: false };
			}
			case "translate_form": {
				if (!currentForm()) return { error: "No form is open." };
				const target = String(input.language || lang());
				try {
					const res = await translateCurrentForm(target);
					return { translatedTo: target, cached: res?.cached ?? false, note: "Translation layer shown over the original German form." };
				} catch (err) {
					return { error: `Translation failed: ${(err as Error).message}` };
				}
			}
			case "show_original": {
				formStore.set({ translationVisible: false });
				return { showing: "original" };
			}
			case "set_ui_preferences": {
				const patch: Partial<AssistantSettings> & { readAloud?: boolean } = {};
				if (typeof input.language === "string" && /^[a-z]{2,3}(-[a-zA-Z0-9]{1,8})*$/.test(input.language)) patch.language = input.language;
				if (typeof input.textScale === "number") patch.textScale = Math.min(2, Math.max(1, input.textScale));
				if (typeof input.highContrast === "boolean") patch.contrast = input.highContrast ? "high" : "normal";
				if (typeof input.easyLanguage === "boolean") patch.easyLanguage = input.easyLanguage;
				if (typeof input.readAloud === "boolean") patch.readAloud = input.readAloud;
				deps.applySettings(patch);
				return { applied: patch };
			}
			case "request_submission": {
				const form = currentForm();
				if (!form) return { error: "No form is open." };
				const missing = missingRequired(form, state.values);
				if (missing.length) return { submitted: false, missingRequired: missing };
				const confirmed = await deps.confirmSubmission();
				if (!confirmed) return { submitted: false, reason: "The citizen did not confirm (back to the form)." };
				try {
					const result = await api.submitForm(form.id, state.values, lang());
					formStore.set({ submitted: result });
					deps.onSubmitted?.(result);
					return { submitted: true, ...result };
				} catch (err) {
					return { submitted: false, error: (err as Error).message };
				}
			}
			case "request_appointment_booking": {
				const confirmed = await deps.confirmBooking({ slotId: String(input.slotId), slotLabel: String(input.slotLabel ?? input.slotId) });
				if (!confirmed) return { booked: false, reason: "The citizen did not confirm." };
				try {
					const result = await api.bookAppointment(String(input.slotId), lang());
					deps.onSubmitted?.(result);
					return { booked: true, ...result };
				} catch (err) {
					return { booked: false, error: (err as Error).message };
				}
			}
			case "close_form": {
				formStore.reset();
				return { closed: true };
			}
			default:
				return { error: `Unknown client tool ${name}` };
		}
	};
}
