/**
 * Antrag auf Familienbeihilfe (structure based on the official form Beih 100) – simplified replica.
 */
import { atToIso, countryNameDe, isoToAt, parseAddress, yesNo, type FormDefinition, type FormFieldDef } from "./types";

const RELATIONSHIP_OPTIONS = [
	{ value: "leibliches Kind", label: "leibliches Kind" },
	{ value: "Stiefkind", label: "Stiefkind" },
	{ value: "Adoptivkind", label: "Adoptivkind" },
	{ value: "Pflegekind", label: "Pflegekind" },
	{ value: "Enkelkind", label: "Enkelkind" },
];

function childFields(n: 1 | 2): FormFieldDef[] {
	return [
		{ id: `kind${n}_familienname`, kind: "text", label: "Familienname:", required: n === 1, span: 6 },
		{ id: `kind${n}_vorname`, kind: "text", label: "Vorname:", required: n === 1, span: 6 },
		{ id: `kind${n}_geburtsdatum`, kind: "date", label: "Geburtsdatum:", required: n === 1, span: 4, placeholder: "TT.MM.JJJJ" },
		{ id: `kind${n}_svnr`, kind: "text", label: "Sozialversicherungsnummer (10-stellig):", span: 4, inputMode: "numeric", sensitive: true },
		{ id: `kind${n}_verhaeltnis`, kind: "select", label: "Verwandtschaftsverhältnis zu Ihnen:", required: n === 1, span: 4, options: RELATIONSHIP_OPTIONS },
		{
			id: `kind${n}_haushalt`,
			kind: "radio",
			label: "Lebt das Kind ständig in Ihrem Haushalt?",
			required: n === 1,
			span: 6,
			options: [
				{ value: "ja", label: "ja" },
				{ value: "nein", label: "nein" },
			],
		},
		{ id: `kind${n}_ab`, kind: "text", label: "Familienbeihilfe beantragt ab (Monat/Jahr):", span: 6, placeholder: "MM/JJJJ" },
	];
}

export const FAMILIENBEIHILFE: FormDefinition = {
	id: "familienbeihilfe",
	serviceId: "family-allowance",
	version: 1,
	authority: "Finanzamt Österreich · Familienbeihilfe",
	title: "Antrag auf Gewährung der Familienbeihilfe",
	subtitle: "Beih 100 – gemäß Familienlastenausgleichsgesetz 1967 (FLAG)",
	legal: "Bitte füllen Sie das Formular vollständig aus. Pflichtfelder sind mit * gekennzeichnet.",
	sections: [
		{
			id: "antragsteller",
			title: "1. Angaben zur antragstellenden Person",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "familienname", kind: "text", label: "Familienname:", required: true, span: 6, autoComplete: "family-name" },
						{ id: "vorname", kind: "text", label: "Vorname:", required: true, span: 6, autoComplete: "given-name" },
						{ id: "svnr", kind: "text", label: "Sozialversicherungsnummer (10-stellig):", required: true, span: 4, inputMode: "numeric", sensitive: true },
						{ id: "geburtsdatum", kind: "date", label: "Geburtsdatum:", required: true, span: 4, placeholder: "TT.MM.JJJJ" },
						{ id: "staatsbuergerschaft", kind: "text", label: "Staatsbürgerschaft:", required: true, span: 4 },
						{
							id: "familienstand",
							kind: "select",
							label: "Familienstand:",
							span: 6,
							options: [
								{ value: "ledig", label: "ledig" },
								{ value: "verheiratet", label: "verheiratet" },
								{ value: "eingetragene Partnerschaft", label: "in eingetragener Partnerschaft" },
								{ value: "geschieden", label: "geschieden" },
								{ value: "verwitwet", label: "verwitwet" },
								{ value: "Lebensgemeinschaft", label: "in Lebensgemeinschaft" },
							],
						},
						{ id: "telefon", kind: "text", label: "Telefonnummer (für Rückfragen):", span: 6, inputMode: "tel", autoComplete: "tel" },
						{ id: "strasse", kind: "text", label: "Wohnadresse – Straße, Haus-Nr., Tür:", required: true, span: 12, autoComplete: "street-address" },
						{ id: "plz", kind: "text", label: "PLZ:", required: true, span: 3, inputMode: "numeric", autoComplete: "postal-code" },
						{ id: "ort", kind: "text", label: "Ort:", required: true, span: 9, autoComplete: "address-level2" },
					],
				},
			],
		},
		{
			id: "partner",
			title: "2. Angaben zur (Ehe-)Partnerin / zum (Ehe-)Partner",
			blocks: [
				{ type: "text", id: "partner_hinweis", text: "Nur ausfüllen, wenn Sie mit einer Partnerin / einem Partner im gemeinsamen Haushalt leben.", style: "note" },
				{
					type: "fields",
					fields: [
						{ id: "partner_familienname", kind: "text", label: "Familienname:", span: 6 },
						{ id: "partner_vorname", kind: "text", label: "Vorname:", span: 6 },
						{ id: "partner_svnr", kind: "text", label: "Sozialversicherungsnummer:", span: 6, inputMode: "numeric", sensitive: true },
						{ id: "partner_geburtsdatum", kind: "date", label: "Geburtsdatum:", span: 6, placeholder: "TT.MM.JJJJ" },
					],
				},
			],
		},
		{
			id: "kind1",
			title: "3. Angaben zum Kind (1. Kind)",
			blocks: [{ type: "fields", fields: childFields(1) }],
		},
		{
			id: "kind2",
			title: "4. Weiteres Kind (falls zutreffend)",
			blocks: [{ type: "fields", fields: childFields(2) }],
		},
		{
			id: "bank",
			title: "5. Bankverbindung für die Auszahlung",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "iban", kind: "text", label: "IBAN:", required: true, span: 8, sensitive: true },
						{ id: "bic", kind: "text", label: "BIC:", span: 4 },
						{ id: "kontoinhaber", kind: "text", label: "Kontoinhaber:in:", span: 12 },
					],
				},
			],
		},
		{
			id: "erklaerung",
			title: "6. Erklärung und Unterschrift",
			blocks: [
				{
					type: "text",
					id: "meldepflicht",
					text: "Ich nehme zur Kenntnis, dass ich jede Änderung, die für den Anspruch auf Familienbeihilfe bedeutsam ist, innerhalb eines Monats dem Finanzamt melden muss.",
					style: "legal",
				},
				{
					type: "fields",
					fields: [
						{ id: "erklaerung_richtig", kind: "checkbox", label: "Ich erkläre, dass meine Angaben vollständig und richtig sind.", required: true, span: 12 },
						{ id: "unterschrift_datum", kind: "date", label: "Datum:", span: 4, placeholder: "TT.MM.JJJJ" },
						{ id: "unterschrift", kind: "signature", label: "Unterschrift (elektronisch über ID Austria):", span: 8 },
					],
				},
			],
		},
	],

	prefill: (p, today) => {
		const addr = parseAddress(p.primaryAddress);
		const partner = p.household.find((m) => m.relation === "partner");
		const children = p.household.filter((m) => m.relation === "child");
		const svnrOf = (name: string) => p.extras?.householdSvnr?.[name];
		const values: Record<string, string> = {
			familienname: p.lastName,
			vorname: p.firstName,
			geburtsdatum: isoToAt(p.birthDate),
			staatsbuergerschaft: countryNameDe(p.nationality),
			...(p.extras?.svnr ? { svnr: p.extras.svnr } : {}),
			...(p.extras?.maritalStatus ? { familienstand: p.extras.maritalStatus } : {}),
			...(p.phone ? { telefon: p.phone } : {}),
			...(p.primaryAddress
				? { strasse: `${addr.street} ${[addr.houseNo, addr.stair, addr.door].filter(Boolean).join("/")}`.trim(), plz: addr.zip, ort: addr.city }
				: {}),
			...(p.extras?.iban ? { iban: p.extras.iban, kontoinhaber: `${p.firstName} ${p.lastName}` } : {}),
			unterschrift_datum: isoToAt(today),
		};
		if (partner) {
			const [first, ...rest] = partner.name.split(" ");
			values.partner_vorname = first;
			values.partner_familienname = rest.join(" ");
			values.partner_geburtsdatum = isoToAt(partner.birthDate);
			if (svnrOf(partner.name)) values.partner_svnr = svnrOf(partner.name)!;
		}
		children.slice(0, 2).forEach((child, i) => {
			const n = i + 1;
			const [first, ...rest] = child.name.split(" ");
			values[`kind${n}_vorname`] = first;
			values[`kind${n}_familienname`] = rest.join(" ");
			values[`kind${n}_geburtsdatum`] = isoToAt(child.birthDate);
			values[`kind${n}_verhaeltnis`] = "leibliches Kind";
			values[`kind${n}_haushalt`] = "ja";
			if (svnrOf(child.name)) values[`kind${n}_svnr`] = svnrOf(child.name)!;
		});
		return values;
	},

	toServiceData: (v) => ({
		applicant_svnr: v.svnr ?? "",
		child_name: [v.kind1_vorname, v.kind1_familienname].filter(Boolean).join(" "),
		child_birth_date: atToIso(v.kind1_geburtsdatum),
		child_relationship: v.kind1_verhaeltnis ?? "",
		same_household: v.kind1_haushalt === "ja" ? "yes" : v.kind1_haushalt === "nein" ? "no" : "",
		...(v.kind2_vorname ? { additional_children: `${v.kind2_vorname} ${v.kind2_familienname ?? ""} (${v.kind2_geburtsdatum ?? ""})`.trim() } : {}),
		iban: (v.iban ?? "").replace(/\s+/g, ""),
		declaration: yesNo(v.erklaerung_richtig),
	}),
};
