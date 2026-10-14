/**
 * Antrag auf Ausstellung eines Reisepasses – simplified replica.
 */
import { countryNameDe, formatAddress, isoToAt, parseAddress, yesNo, type FormDefinition } from "./types";

export const REISEPASS: FormDefinition = {
	id: "reisepass",
	serviceId: "passport-renewal",
	version: 1,
	authority: "Passbehörde · Bezirkshauptmannschaft / Magistrat",
	title: "Antrag auf Ausstellung eines Reisepasses",
	subtitle: "gemäß Passgesetz 1992 – persönliche Antragstellung mit Termin",
	legal: "Bei der Antragstellung werden Fingerabdrücke abgenommen. Bitte bringen Sie ein aktuelles Passfoto mit.",
	sections: [
		{
			id: "person",
			title: "1. Angaben zur Person",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "familienname", kind: "text", label: "Familienname:", required: true, span: 6 },
						{ id: "vorname", kind: "text", label: "Vorname(n):", required: true, span: 6 },
						{ id: "geburtsdatum", kind: "date", label: "Geburtsdatum:", required: true, span: 4, placeholder: "TT.MM.JJJJ" },
						{ id: "geburtsort", kind: "text", label: "Geburtsort:", span: 4 },
						{ id: "staatsbuergerschaft", kind: "text", label: "Staatsbürgerschaft:", required: true, span: 4 },
					],
				},
			],
		},
		{
			id: "antrag",
			title: "2. Grund der Antragstellung",
			blocks: [
				{
					type: "fields",
					fields: [
						{
							id: "grund",
							kind: "radio",
							label: "Grund:",
							required: true,
							span: 12,
							options: [
								{ value: "expired", label: "Reisepass abgelaufen / läuft bald ab" },
								{ value: "lost_or_stolen", label: "Reisepass verloren oder gestohlen" },
								{ value: "damaged", label: "Reisepass beschädigt" },
								{ value: "name_change", label: "Namensänderung" },
							],
						},
						{ id: "bisheriger_pass", kind: "text", label: "Nummer des bisherigen Reisepasses:", span: 6 },
						{ id: "bisheriger_pass_gueltig", kind: "date", label: "Gültig bis:", span: 6, placeholder: "TT.MM.JJJJ" },
					],
				},
			],
		},
		{
			id: "zustellung",
			title: "3. Zustellung",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "strasse", kind: "text", label: "Zustelladresse – Straße, Haus-Nr., Tür:", required: true, span: 12 },
						{ id: "plz", kind: "text", label: "PLZ:", required: true, span: 3, inputMode: "numeric" },
						{ id: "ort", kind: "text", label: "Ort:", required: true, span: 9 },
					],
				},
			],
		},
		{
			id: "erklaerung",
			title: "4. Erklärung",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "passfoto", kind: "checkbox", label: "Ich bringe ein aktuelles Passfoto (35 × 45 mm) zum Termin mit.", required: true, span: 12 },
						{ id: "erklaerung_richtig", kind: "checkbox", label: "Ich bestätige die Richtigkeit meiner Angaben.", required: true, span: 12 },
					],
				},
			],
		},
	],

	prefill: (p) => {
		const addr = parseAddress(p.primaryAddress);
		const passport = p.documents.find((d) => d.type === "passport");
		return {
			familienname: p.lastName,
			vorname: p.firstName,
			geburtsdatum: isoToAt(p.birthDate),
			...(p.extras?.birthPlace ? { geburtsort: p.extras.birthPlace } : {}),
			staatsbuergerschaft: countryNameDe(p.nationality),
			...(passport ? { bisheriger_pass: passport.number, bisheriger_pass_gueltig: isoToAt(passport.validUntil) } : {}),
			...(passport?.status === "expired" ? { grund: "expired" } : {}),
			...(p.primaryAddress
				? { strasse: `${addr.street} ${[addr.houseNo, addr.stair, addr.door].filter(Boolean).join("/")}`.trim(), plz: addr.zip, ort: addr.city }
				: {}),
		};
	},

	toServiceData: (v) => ({
		reason: v.grund ?? "",
		delivery_address: formatAddress({ street: v.strasse, zip: v.plz, city: v.ort }),
		biometric_photo: yesNo(v.passfoto),
	}),
};
