/**
 * Form schema: a faithful HTML replica of an official paper/PDF form.
 *
 * Every visible text has a stable id (see `textId`), so the translation layer can lay a translated
 * text exactly over the original without touching the input fields. The original German form stays
 * the "source of truth": values are always stored in the format the authority expects.
 *
 * Text ids:
 *   title · subtitle · authority · legal       header of the form
 *   s.<sectionId>                              section title
 *   t.<textId>                                 free text block (notes, legal hints)
 *   f.<fieldId> · h.<fieldId> · p.<fieldId>    field label, hint, placeholder
 *   o.<fieldId>.<value>                        option label (radio / select)
 */

export type FieldKind = "text" | "date" | "checkbox" | "radio" | "select" | "textarea" | "signature";

export type FieldOption = { value: string; label: string };

export type FormFieldDef = {
	id: string;
	kind: FieldKind;
	/** German label as printed on the original form. */
	label: string;
	/** Width in a 12-column grid (default 12). */
	span?: number;
	required?: boolean;
	options?: FieldOption[];
	hint?: string;
	placeholder?: string;
	autoComplete?: string;
	inputMode?: "text" | "numeric" | "email" | "tel";
	/** The field may contain personal data that should never be guessed by the AI. */
	sensitive?: boolean;
};

export type FormBlock =
	| { type: "fields"; fields: FormFieldDef[] }
	| { type: "text"; id: string; text: string; style?: "note" | "legal" | "subheading" };

export type FormSection = { id: string; title: string; blocks: FormBlock[] };

/** Subset of the citizen profile that forms use for pre-filling. */
export type ProfileForForms = {
	firstName: string;
	lastName: string;
	birthDate: string;
	nationality: string;
	residenceStatus?: string;
	primaryAddress: string | null;
	phone: string | null;
	email: string | null;
	household: { name: string; relation: string; birthDate: string }[];
	documents: { type: string; number: string; validUntil: string | null; status?: string }[];
	extras?: CitizenExtras;
};

/** Extra (fictional) register data the simulated ID Austria login provides. */
export type CitizenExtras = {
	sex?: "männlich" | "weiblich" | "divers";
	birthPlace?: string;
	maritalStatus?: "ledig" | "verheiratet" | "eingetragene Partnerschaft" | "geschieden" | "verwitwet";
	svnr?: string;
	/** Social security numbers of household members by name. */
	householdSvnr?: Record<string, string>;
	iban?: string;
	zmr?: string;
};

export type FormDefinition = {
	id: string;
	/** Matching service in src/gov/data/services.ts (validation + submission). */
	serviceId: string;
	/** Bump when texts change – part of the translation cache key. */
	version: number;
	authority: string;
	title: string;
	subtitle: string;
	legal: string;
	sections: FormSection[];
	/** Values pre-filled from the ID Austria profile (keys = form field ids). */
	prefill: (profile: ProfileForForms, today: string) => Record<string, string>;
	/** Maps the form values to the service's application data (validated server-side). */
	toServiceData: (values: Record<string, string>) => Record<string, string>;
};

export function allFields(form: FormDefinition): FormFieldDef[] {
	return form.sections.flatMap((s) => s.blocks.flatMap((b) => (b.type === "fields" ? b.fields : [])));
}

/** All translatable texts of a form, keyed by text id (German originals). */
export function collectTexts(form: FormDefinition): Record<string, string> {
	const texts: Record<string, string> = {
		title: form.title,
		subtitle: form.subtitle,
		authority: form.authority,
		legal: form.legal,
	};
	for (const s of form.sections) {
		texts[`s.${s.id}`] = s.title;
		for (const b of s.blocks) {
			if (b.type === "text") {
				texts[`t.${b.id}`] = b.text;
				continue;
			}
			for (const f of b.fields) {
				texts[`f.${f.id}`] = f.label;
				if (f.hint) texts[`h.${f.id}`] = f.hint;
				if (f.placeholder) texts[`p.${f.id}`] = f.placeholder;
				for (const o of f.options ?? []) texts[`o.${f.id}.${o.value}`] = o.label;
			}
		}
	}
	return texts;
}

/** Required fields that are still empty. */
export function missingRequired(form: FormDefinition, values: Record<string, string>): string[] {
	return allFields(form)
		.filter((f) => f.required && !(values[f.id] ?? "").trim())
		.map((f) => f.id);
}

// ---------------------------------------------------------------------------------------------
// Helpers used by the form definitions
// ---------------------------------------------------------------------------------------------

/** "2003-04-12" -> "12.04.2003" */
export function isoToAt(iso: string | null | undefined): string {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
	return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
}

/** "12.04.2003" (or "12.4.2003") -> "2003-04-12"; returns "" if invalid. */
export function atToIso(at: string | null | undefined): string {
	const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{4})\s*$/.exec(at ?? "");
	if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(at ?? "") ? (at as string) : "";
	return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export type ParsedAddress = { street: string; houseNo: string; stair: string; door: string; zip: string; city: string };

/** Parses Austrian addresses like "Annenstraße 24/3, 8020 Graz" or "Hauptplatz 7, 4020 Linz". */
export function parseAddress(address: string | null | undefined): ParsedAddress {
	const empty = { street: "", houseNo: "", stair: "", door: "", zip: "", city: "" };
	if (!address) return empty;
	const m = /^(.+?)\s+(\d+[a-zA-Z]?)(?:\/(\d+))?(?:\/(\d+))?\s*,\s*(\d{4})\s+(.+)$/.exec(address.trim());
	if (!m) return { ...empty, street: address };
	const [, street, houseNo, a, b, zip, city] = m;
	// "24/3" = door 3; "24/2/5" = stair 2, door 5
	return b ? { street, houseNo, stair: a ?? "", door: b, zip, city } : { street, houseNo, stair: "", door: a ?? "", zip, city };
}

export function formatAddress(p: Partial<ParsedAddress>): string {
	const parts = [p.houseNo, p.stair, p.door].filter((x) => x && x.trim());
	const streetLine = [p.street?.trim(), parts.join("/")].filter(Boolean).join(" ");
	const cityLine = [p.zip?.trim(), p.city?.trim()].filter(Boolean).join(" ");
	return [streetLine, cityLine].filter(Boolean).join(", ");
}

const COUNTRY_DE: Record<string, string> = {
	AT: "Österreich", DE: "Deutschland", IT: "Italien", SY: "Syrien", UA: "Ukraine", TR: "Türkei",
	BA: "Bosnien und Herzegowina", RS: "Serbien", HR: "Kroatien", AF: "Afghanistan", RO: "Rumänien",
	PL: "Polen", HU: "Ungarn", SK: "Slowakei", CZ: "Tschechien", SO: "Somalia", IR: "Iran",
};

export function countryNameDe(code: string): string {
	return COUNTRY_DE[code] ?? code;
}

export function yesNo(v: string | undefined): "yes" | "no" {
	return v === "yes" || v === "ja" || v === "true" ? "yes" : "no";
}
