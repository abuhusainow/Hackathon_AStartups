/**
 * Registry of the interactive forms shown in the right-hand panel.
 * 👉 EXTEND HERE: add a form (replica of the official form) and map it to a service.
 */
import { FAMILIENBEIHILFE } from "./familienbeihilfe";
import { MELDEZETTEL } from "./meldezettel";
import { REISEPASS } from "./reisepass";
import type { FormDefinition } from "./types";

export * from "./types";

export const FORMS: FormDefinition[] = [MELDEZETTEL, FAMILIENBEIHILFE, REISEPASS];

export const FORM_IDS = FORMS.map((f) => f.id) as [string, ...string[]];

export function getForm(id: string): FormDefinition | undefined {
	return FORMS.find((f) => f.id === id);
}

export function formForService(serviceId: string): FormDefinition | undefined {
	return FORMS.find((f) => f.serviceId === serviceId);
}
