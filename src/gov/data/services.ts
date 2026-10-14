/**
 * Mock public services: form fields, eligibility rules and next steps.
 *
 * ⚠️ The rules below are SIMPLIFIED for a hackathon demo. They are not legal advice.
 *    Facts shown to citizens come from src/knowledge/ (with source URLs) – verify them there.
 *
 * 👉 EXTEND HERE: add a new service by copying one of the entries below,
 *    then add a matching knowledge entry in src/knowledge/index.ts.
 */
import type { Citizen, CitizenDocument, EligibilityResult, ServiceDefinition } from "../types";

const EU_EEA_CH = [
	"AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT",
	"LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "CH",
];

export function isDocumentValid(doc: CitizenDocument, today: string): boolean {
	return doc.validUntil === null || doc.validUntil >= today;
}

function validPhotoId(citizen: Citizen, today: string): CitizenDocument | undefined {
	return citizen.documents.find(
		(d) => (d.type === "passport" || d.type === "id_card") && isDocumentValid(d, today),
	);
}

function describeDocument(doc: CitizenDocument | undefined): string {
	if (!doc) return "";
	const label = doc.type === "passport" ? "Passport" : doc.type === "id_card" ? "ID card" : doc.type;
	return `${label} ${doc.number}`;
}

function ageInYears(birthDate: string, today: string): number {
	const b = new Date(birthDate);
	const t = new Date(today);
	let age = t.getFullYear() - b.getFullYear();
	if (t.getMonth() < b.getMonth() || (t.getMonth() === b.getMonth() && t.getDate() < b.getDate())) age--;
	return age;
}

/** Children younger than 3 years (simplified mock rule for the childcare subsidy). */
function youngChildren(citizen: Citizen, today: string) {
	const threeYearsAgo = new Date(today);
	threeYearsAgo.setFullYear(threeYearsAgo.getFullYear() - 3);
	const cutoff = threeYearsAgo.toISOString().slice(0, 10);
	return citizen.household.filter((m) => m.relation === "child" && m.birthDate >= cutoff);
}

export const SERVICES: ServiceDefinition[] = [
	// ---------------------------------------------------------------------------------------------
	// 1. Change of residence – modelled end to end (main use case of the template)
	// ---------------------------------------------------------------------------------------------
	{
		id: "change-of-residence",
		implementation: "full",
		referencePrefix: "MEL",
		name: {
			de: "Wohnsitz anmelden / ummelden (Meldezettel)",
			en: "Register or change your residence (Meldezettel)",
		},
		summary: {
			de: "Wer in eine Wohnung zieht, muss den neuen Wohnsitz bei der Meldebehörde anmelden.",
			en: "Anyone who moves into a home must register the new residence with the registration office.",
		},
		authority: {
			de: "Meldebehörde (Gemeindeamt bzw. Magistrat)",
			en: "Registration office (municipal office)",
		},
		keywords: [
			"umzug", "umgezogen", "umzogn", "ummelden", "anmelden", "abmelden", "meldezettel", "wohnsitz",
			"hauptwohnsitz", "nebenwohnsitz", "adresse", "moved", "moving", "address", "register", "residence",
		],
		requiresAppointment: false,
		fields: [
			{
				id: "new_address",
				label: { de: "Neue Adresse", en: "New address" },
				type: "text",
				required: true,
				hint: { de: "Straße, Hausnummer/Tür, PLZ, Ort", en: "Street, number/door, postcode, city" },
			},
			{ id: "move_in_date", label: { de: "Einzugsdatum", en: "Move-in date" }, type: "date", required: true },
			{
				id: "residence_type",
				label: { de: "Art des Wohnsitzes", en: "Type of residence" },
				type: "select",
				required: true,
				options: [
					{ value: "main", label: { de: "Hauptwohnsitz", en: "Main residence" } },
					{ value: "secondary", label: { de: "Nebenwohnsitz", en: "Secondary residence" } },
				],
			},
			{
				id: "previous_address",
				label: { de: "Bisherige Adresse", en: "Previous address" },
				type: "text",
				required: false,
			},
			{
				id: "deregister_previous",
				label: { de: "Bisherige Adresse gleichzeitig abmelden", en: "Deregister previous address at the same time" },
				type: "boolean",
				required: false,
			},
			{
				id: "landlord_signature",
				label: {
					de: "Unterkunftgeber:in hat den Meldezettel unterschrieben",
					en: "Accommodation provider (landlord) has signed the registration form",
				},
				type: "boolean",
				required: true,
				mustBeTrue: true,
			},
			{
				id: "id_document",
				label: { de: "Amtlicher Lichtbildausweis", en: "Official photo ID" },
				type: "text",
				required: true,
			},
		],
		prefill: (c, today) => ({
			...(c.primaryAddress ? { previous_address: c.primaryAddress } : {}),
			...(validPhotoId(c, today) ? { id_document: describeDocument(validPhotoId(c, today)) } : {}),
		}),
		eligibility: (c, today): EligibilityResult => {
			const missing: string[] = [];
			const warnings: string[] = [];
			if (!validPhotoId(c, today)) {
				missing.push("A valid official photo ID (passport or ID card). The citizen's passport/ID on file is expired or missing.");
			}
			if (!c.primaryAddress) {
				warnings.push("No current registered address on file (e.g. returning from abroad). The previous address can be left empty.");
			}
			if (!EU_EEA_CH.includes(c.nationality)) {
				warnings.push("Non-EU citizens should also bring their residence document (e.g. residence permit).");
			}
			return {
				eligible: true,
				reasons: ["Everyone who moves into a home in Austria has to register it (registration obligation)."],
				missing,
				warnings,
			};
		},
		nextSteps: {
			de: [
				"Sie erhalten eine Meldebestätigung (im Mock: die Referenznummer).",
				"Denken Sie daran, Ihre neue Adresse z. B. bei Bank, Arbeitgeber und Versicherung bekanntzugeben.",
			],
			en: [
				"You will receive a registration confirmation (in this mock: the reference number).",
				"Remember to update your address with your bank, employer and insurance.",
			],
		},
	},

	// ---------------------------------------------------------------------------------------------
	// 2. Passport renewal – mock service with appointment booking
	// ---------------------------------------------------------------------------------------------
	{
		id: "passport-renewal",
		implementation: "mock",
		referencePrefix: "PASS",
		name: { de: "Reisepass beantragen / erneuern", en: "Apply for / renew a passport" },
		summary: {
			de: "Ein neuer Reisepass wird persönlich bei einer Passbehörde beantragt.",
			en: "A new passport is applied for in person at a passport authority.",
		},
		authority: {
			de: "Passbehörde (Bezirkshauptmannschaft bzw. Magistrat)",
			en: "Passport authority (district authority or municipal office)",
		},
		keywords: ["pass", "reisepass", "passport", "abgelaufen", "abgloffen", "expired", "verloren", "lost", "erneuern", "renew"],
		requiresAppointment: true,
		fields: [
			{
				id: "reason",
				label: { de: "Grund", en: "Reason" },
				type: "select",
				required: true,
				options: [
					{ value: "expired", label: { de: "Abgelaufen / läuft bald ab", en: "Expired / expiring soon" } },
					{ value: "lost_or_stolen", label: { de: "Verloren oder gestohlen", en: "Lost or stolen" } },
					{ value: "damaged", label: { de: "Beschädigt", en: "Damaged" } },
					{ value: "name_change", label: { de: "Namensänderung", en: "Name change" } },
				],
			},
			{
				id: "delivery_address",
				label: { de: "Zustelladresse", en: "Delivery address" },
				type: "text",
				required: true,
			},
			{
				id: "biometric_photo",
				label: { de: "Ich bringe ein aktuelles Passfoto mit", en: "I will bring a current passport photo" },
				type: "boolean",
				required: true,
				mustBeTrue: true,
			},
		],
		prefill: (c): Record<string, string> => (c.primaryAddress ? { delivery_address: c.primaryAddress } : {}),
		eligibility: (c, today): EligibilityResult => {
			if (c.nationality !== "AT") {
				return {
					eligible: false,
					reasons: [
						"Austrian passports are only issued to Austrian citizens. The citizen should contact the embassy or consulate of their country of citizenship.",
					],
					missing: [],
					warnings: [],
				};
			}
			const passport = c.documents.find((d) => d.type === "passport");
			const warnings: string[] = [];
			const reasons = ["The citizen is an Austrian citizen."];
			if (!passport) {
				reasons.push("No passport on file – a first passport can be applied for.");
			} else if (!isDocumentValid(passport, today)) {
				reasons.push(`The passport on file (${passport.number}) expired on ${passport.validUntil}.`);
			} else {
				warnings.push(`The current passport is still valid until ${passport.validUntil}.`);
			}
			return { eligible: true, reasons, missing: [], warnings };
		},
		nextSteps: {
			de: [
				"Kommen Sie zum gebuchten Termin persönlich zur Passbehörde (Fingerabdrücke werden abgenommen).",
				"Bringen Sie Ihren alten Pass, ein Passfoto und einen Lichtbildausweis mit.",
				"Der neue Pass wird per Post zugestellt.",
			],
			en: [
				"Go to the passport authority in person at your appointment (fingerprints are taken).",
				"Bring your old passport, a passport photo and a photo ID.",
				"The new passport is sent to you by post.",
			],
		},
	},

	// ---------------------------------------------------------------------------------------------
	// 3. Childcare subsidy – mock service with simplified eligibility rules
	// ---------------------------------------------------------------------------------------------
	{
		id: "childcare-subsidy",
		implementation: "mock",
		referencePrefix: "KBG",
		name: { de: "Kinderbetreuungsgeld beantragen", en: "Apply for childcare benefit (Kinderbetreuungsgeld)" },
		summary: {
			de: "Finanzielle Unterstützung für Eltern von Kleinkindern.",
			en: "Financial support for parents of young children.",
		},
		authority: {
			de: "Krankenversicherungsträger (z. B. ÖGK)",
			en: "Health insurance provider (e.g. ÖGK)",
		},
		keywords: ["kinderbetreuungsgeld", "kbg", "baby", "kind", "geburt", "karenz", "childcare", "child", "parental", "subsidy", "benefit"],
		requiresAppointment: false,
		fields: [
			{ id: "child_name", label: { de: "Name des Kindes", en: "Child's name" }, type: "text", required: true },
			{ id: "child_birth_date", label: { de: "Geburtsdatum des Kindes", en: "Child's date of birth" }, type: "date", required: true },
			{
				id: "benefit_model",
				label: { de: "Modell", en: "Model" },
				type: "select",
				required: true,
				options: [
					{ value: "flat_rate_account", label: { de: "Kinderbetreuungsgeld-Konto (pauschal)", en: "Childcare benefit account (flat rate)" } },
					{ value: "income_related", label: { de: "Einkommensabhängiges Kinderbetreuungsgeld", en: "Income-related childcare benefit" } },
				],
			},
			{
				id: "receives_family_allowance",
				label: { de: "Familienbeihilfe wird bezogen", en: "Family allowance (Familienbeihilfe) is received" },
				type: "boolean",
				required: true,
				mustBeTrue: true,
			},
			{ id: "iban", label: { de: "IBAN für die Auszahlung", en: "IBAN for payment" }, type: "text", required: true },
		],
		prefill: (c, today): Record<string, string> => {
			const child = youngChildren(c, today)[0];
			return child ? { child_name: child.name, child_birth_date: child.birthDate } : {};
		},
		eligibility: (c, today): EligibilityResult => {
			const children = youngChildren(c, today);
			const missing: string[] = [];
			const warnings: string[] = [
				"MOCK RULES: this eligibility check is simplified for the hackathon and is not the real legal assessment.",
			];
			const reasons: string[] = [];
			if (children.length === 0) {
				reasons.push("No child younger than 3 years found in the household data.");
			} else {
				reasons.push(`Child in household: ${children.map((ch) => `${ch.name} (born ${ch.birthDate})`).join(", ")}.`);
			}
			if (!EU_EEA_CH.includes(c.nationality)) {
				const permit = c.documents.find((d) => d.type === "residence_permit" && isDocumentValid(d, today));
				if (permit) reasons.push(`Valid residence permit on file (${c.residenceStatus}).`);
				else missing.push("A valid residence title is required for non-EU citizens.");
				warnings.push("Non-standard residency status: recommend confirming details with a human case worker.");
			}
			missing.push("Have ready: birth certificate of the child, proof of the Eltern-Kind-Pass examinations.");
			return { eligible: children.length > 0 && !missing.some((m) => m.startsWith("A valid residence")), reasons, missing, warnings };
		},
		nextSteps: {
			de: [
				"Der Antrag wird vom Krankenversicherungsträger geprüft (im Mock: sofortige Referenznummer).",
				"Sie werden informiert, falls Unterlagen fehlen.",
			],
			en: [
				"The application is reviewed by the health insurance provider (in this mock: instant reference number).",
				"You will be informed if any documents are missing.",
			],
		},
	},
	// ---------------------------------------------------------------------------------------------
	// 4. Family allowance (Familienbeihilfe) – mock service, interactive form "familienbeihilfe"
	// ---------------------------------------------------------------------------------------------
	{
		id: "family-allowance",
		implementation: "mock",
		referencePrefix: "FBH",
		name: { de: "Familienbeihilfe beantragen", en: "Apply for family allowance (Familienbeihilfe)" },
		summary: {
			de: "Monatliche Unterstützung für Eltern bzw. Personen, bei denen ein Kind im Haushalt lebt.",
			en: "Monthly support for parents or people with a child living in their household.",
		},
		authority: { de: "Finanzamt Österreich", en: "Tax Office Austria (Finanzamt Österreich)" },
		keywords: [
			"familienbeihilfe", "beihilfe", "fbh", "beih", "kindergeld", "kinder", "kind", "familie", "family", "allowance",
			"child benefit", "допомога", "çocuk", "yardım",
		],
		requiresAppointment: false,
		fields: [
			{ id: "applicant_svnr", label: { de: "Sozialversicherungsnummer", en: "Social security number" }, type: "text", required: true },
			{ id: "child_name", label: { de: "Name des Kindes", en: "Child's name" }, type: "text", required: true },
			{ id: "child_birth_date", label: { de: "Geburtsdatum des Kindes", en: "Child's date of birth" }, type: "date", required: true },
			{
				id: "child_relationship",
				label: { de: "Verwandtschaftsverhältnis", en: "Relationship to the child" },
				type: "select",
				required: true,
				options: [
					{ value: "leibliches Kind", label: { de: "leibliches Kind", en: "biological child" } },
					{ value: "Stiefkind", label: { de: "Stiefkind", en: "stepchild" } },
					{ value: "Adoptivkind", label: { de: "Adoptivkind", en: "adopted child" } },
					{ value: "Pflegekind", label: { de: "Pflegekind", en: "foster child" } },
					{ value: "Enkelkind", label: { de: "Enkelkind", en: "grandchild" } },
				],
			},
			{
				id: "same_household",
				label: { de: "Kind lebt im gemeinsamen Haushalt", en: "Child lives in the same household" },
				type: "boolean",
				required: true,
			},
			{ id: "additional_children", label: { de: "Weitere Kinder", en: "Further children" }, type: "text", required: false },
			{ id: "iban", label: { de: "IBAN für die Auszahlung", en: "IBAN for payment" }, type: "text", required: true },
			{
				id: "declaration",
				label: { de: "Angaben vollständig und richtig", en: "Information is complete and correct" },
				type: "boolean",
				required: true,
				mustBeTrue: true,
			},
		],
		prefill: (c, today): Record<string, string> => {
			const child = c.household.find((m) => m.relation === "child" && ageInYears(m.birthDate, today) < 18);
			return {
				...(c.extras.svnr ? { applicant_svnr: c.extras.svnr } : {}),
				...(child ? { child_name: child.name, child_birth_date: child.birthDate, child_relationship: "leibliches Kind", same_household: "yes" } : {}),
				...(c.extras.iban ? { iban: c.extras.iban.replace(/\s+/g, "") } : {}),
			};
		},
		eligibility: (c, today): EligibilityResult => {
			const children = c.household.filter((m) => m.relation === "child" && ageInYears(m.birthDate, today) < 18);
			const reasons: string[] = [];
			const missing: string[] = [];
			const warnings = ["MOCK RULES: simplified eligibility check for the hackathon, not a legal assessment."];
			if (children.length === 0) reasons.push("No child under 18 found in the household data.");
			else reasons.push(`Children under 18 in the household: ${children.map((ch) => `${ch.name} (born ${ch.birthDate})`).join(", ")}.`);
			if (!EU_EEA_CH.includes(c.nationality)) {
				const permit = c.documents.find((d) => d.type === "residence_permit" && isDocumentValid(d, today));
				if (permit) reasons.push(`Valid residence document on file (${c.residenceStatus}).`);
				else missing.push("A valid residence title is required for non-EU citizens.");
				warnings.push("Special rules apply depending on the residence status (e.g. displaced persons from Ukraine). Recommend confirming with the tax office.");
			}
			if (!c.extras.iban) missing.push("IBAN for the payment.");
			missing.push("Have ready: birth certificates of the children (if not yet registered in Austria).");
			return {
				eligible: children.length > 0 && !missing.some((m) => m.startsWith("A valid residence")),
				reasons,
				missing,
				warnings,
			};
		},
		nextSteps: {
			de: [
				"Das Finanzamt prüft den Antrag (im Mock: sofortige Referenznummer).",
				"Sie erhalten eine Mitteilung über den Bezug der Familienbeihilfe.",
				"Änderungen (z. B. Umzug, Ende der Ausbildung) müssen innerhalb eines Monats gemeldet werden.",
			],
			en: [
				"The tax office reviews the application (in this mock: instant reference number).",
				"You will receive a notification about your family allowance.",
				"Changes (e.g. moving, end of education) must be reported within one month.",
			],
		},
	},
];

export function getServiceDefinition(id: string): ServiceDefinition | undefined {
	return SERVICES.find((s) => s.id === id);
}
