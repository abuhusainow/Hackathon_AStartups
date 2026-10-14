/**
 * Meldezettel (registration form) incl. Wohnungsgeberbestätigung (housing provider confirmation).
 * Replica of the structure of the official form (Anlage A zum Meldegesetz) – simplified, fictional authority.
 */
import { atToIso, countryNameDe, formatAddress, isoToAt, yesNo, type FormDefinition } from "./types";

export const MELDEZETTEL: FormDefinition = {
	id: "meldezettel",
	serviceId: "change-of-residence",
	version: 1,
	authority: "Musterstadt · Bürger- und Meldeservice",
	title: "Meldezettel und Wohnungsgeberbestätigung",
	subtitle: "zur Vorlage bei der Meldebehörde gemäß § 3 und § 19 Meldegesetz 1991 (MeldeG)",
	legal: "Bitte gut leserlich in Blockschrift ausfüllen. Die Meldung ist innerhalb von drei Tagen nach dem Einzug vorzunehmen.",
	sections: [
		{
			id: "art",
			title: "1. Art des Meldevorgangs",
			blocks: [
				{
					type: "fields",
					fields: [
						{
							id: "meldeart",
							kind: "radio",
							label: "Es handelt sich um eine:",
							required: true,
							span: 12,
							options: [
								{ value: "anmeldung", label: "Anmeldung" },
								{ value: "ummeldung", label: "Ummeldung (Wohnsitzwechsel innerhalb Österreichs)" },
							],
						},
						{ id: "einzugsdatum", kind: "date", label: "Datum des Einzugs (TT.MM.JJJJ):", required: true, span: 6, placeholder: "TT.MM.JJJJ" },
					],
				},
			],
		},
		{
			id: "person",
			title: "2. Angaben zur Person",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "familienname", kind: "text", label: "Familienname (Nachname):", required: true, span: 6, autoComplete: "family-name" },
						{ id: "vorname", kind: "text", label: "Vorname(n):", required: true, span: 6, autoComplete: "given-name" },
						{ id: "name_vor_ehe", kind: "text", label: "Familienname vor der ersten Eheschließung:", span: 6 },
						{ id: "geburtsdatum", kind: "date", label: "Geburtsdatum:", required: true, span: 3, placeholder: "TT.MM.JJJJ", autoComplete: "bday" },
						{
							id: "geschlecht",
							kind: "select",
							label: "Geschlecht:",
							span: 3,
							options: [
								{ value: "männlich", label: "männlich" },
								{ value: "weiblich", label: "weiblich" },
								{ value: "divers", label: "divers" },
								{ value: "keine Angabe", label: "keine Angabe" },
							],
						},
						{ id: "geburtsort", kind: "text", label: "Geburtsort (lt. Reisedokument):", span: 6 },
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
							],
						},
						{ id: "staatsangehoerigkeit", kind: "text", label: "Staatsangehörigkeit:", required: true, span: 6 },
						{ id: "zmr_zahl", kind: "text", label: "ZMR-Zahl (falls bekannt):", span: 6, inputMode: "numeric" },
					],
				},
			],
		},
		{
			id: "dokument",
			title: "3. Amtlicher Lichtbildausweis / Reisedokument",
			blocks: [
				{ type: "text", id: "dokument_hinweis", text: "Fremde Staatsangehörige geben bitte das Reisedokument an.", style: "note" },
				{
					type: "fields",
					fields: [
						{
							id: "dokument_art",
							kind: "select",
							label: "Art des Dokuments:",
							required: true,
							span: 4,
							options: [
								{ value: "Reisepass", label: "Reisepass" },
								{ value: "Personalausweis", label: "Personalausweis" },
								{ value: "Aufenthaltstitel", label: "Aufenthaltstitel" },
								{ value: "Anmeldebescheinigung", label: "Anmeldebescheinigung (EWR)" },
							],
						},
						{ id: "dokument_nummer", kind: "text", label: "Nummer:", required: true, span: 4 },
						{ id: "dokument_gueltig", kind: "date", label: "Gültig bis:", span: 4, placeholder: "TT.MM.JJJJ" },
					],
				},
			],
		},
		{
			id: "unterkunft",
			title: "4. Anschrift der betroffenen Wohnung (neue Unterkunft)",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "strasse", kind: "text", label: "Straße (bzw. Platz):", required: true, span: 6, autoComplete: "address-line1" },
						{ id: "hausnummer", kind: "text", label: "Haus-Nr.:", required: true, span: 2 },
						{ id: "stiege", kind: "text", label: "Stiege:", span: 2 },
						{ id: "tuer", kind: "text", label: "Tür:", span: 2 },
						{ id: "plz", kind: "text", label: "Postleitzahl (PLZ):", required: true, span: 3, inputMode: "numeric", autoComplete: "postal-code" },
						{ id: "ort", kind: "text", label: "Ort / Gemeinde:", required: true, span: 9, autoComplete: "address-level2" },
						{
							id: "hauptwohnsitz",
							kind: "radio",
							label: "Ist diese Unterkunft Hauptwohnsitz?",
							required: true,
							span: 12,
							hint: "Hauptwohnsitz ist dort, wo Sie den Mittelpunkt Ihrer Lebensbeziehungen haben.",
							options: [
								{ value: "ja", label: "ja" },
								{ value: "nein", label: "nein (Nebenwohnsitz)" },
							],
						},
						{
							id: "zuzug_ausland",
							kind: "radio",
							label: "Zuzug aus dem Ausland?",
							span: 6,
							options: [
								{ value: "nein", label: "nein" },
								{ value: "ja", label: "ja" },
							],
						},
						{ id: "zuzug_staat", kind: "text", label: "Wenn ja, aus welchem Staat:", span: 6 },
					],
				},
			],
		},
		{
			id: "abmeldung",
			title: "5. Bisherige Unterkunft",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "bisherige_adresse", kind: "text", label: "Bisherige Anschrift (Straße, Haus-Nr., Tür, PLZ, Ort):", span: 12 },
						{ id: "abmeldung_gleichzeitig", kind: "checkbox", label: "Die bisherige Unterkunft wird gleichzeitig abgemeldet.", span: 12 },
					],
				},
			],
		},
		{
			id: "unterkunftgeber",
			title: "6. Angaben zum Unterkunftgeber (Vermieter:in / Eigentümer:in)",
			blocks: [
				{
					type: "text",
					id: "wohnungsgeber_hinweis",
					text: "Wohnungsgeberbestätigung: Der Unterkunftgeber bestätigt mit seiner Unterschrift die Unterkunftnahme.",
					style: "note",
				},
				{
					type: "fields",
					fields: [
						{ id: "unterkunftgeber_name", kind: "text", label: "Name / Firma des Unterkunftgebers:", required: true, span: 12 },
						{ id: "unterkunftgeber_anschrift", kind: "text", label: "Anschrift (Straße, Haus-Nr., PLZ, Ort) des Unterkunftgebers:", span: 12 },
						{
							id: "unterkunftgeber_unterschrift",
							kind: "checkbox",
							label: "Der Unterkunftgeber hat die Wohnungsgeberbestätigung unterschrieben.",
							required: true,
							span: 12,
						},
					],
				},
			],
		},
		{
			id: "erklaerung",
			title: "7. Unterschrift der meldepflichtigen Person",
			blocks: [
				{
					type: "fields",
					fields: [
						{ id: "erklaerung_richtig", kind: "checkbox", label: "Ich bestätige die Richtigkeit und Vollständigkeit meiner Angaben.", required: true, span: 12 },
						{ id: "unterschrift_datum", kind: "date", label: "Datum:", span: 4, placeholder: "TT.MM.JJJJ" },
						{ id: "unterschrift", kind: "signature", label: "Unterschrift (elektronisch über ID Austria):", span: 8 },
					],
				},
			],
		},
	],

	prefill: (p, today) => {
		const id = p.documents.find((d) => d.status !== "expired" && ["passport", "id_card", "residence_permit", "eu_registration_certificate"].includes(d.type));
		const docType: Record<string, string> = {
			passport: "Reisepass",
			id_card: "Personalausweis",
			residence_permit: "Aufenthaltstitel",
			eu_registration_certificate: "Anmeldebescheinigung",
		};
		return {
			meldeart: p.primaryAddress ? "ummeldung" : "anmeldung",
			familienname: p.lastName,
			vorname: p.firstName,
			geburtsdatum: isoToAt(p.birthDate),
			...(p.extras?.sex ? { geschlecht: p.extras.sex } : {}),
			...(p.extras?.birthPlace ? { geburtsort: p.extras.birthPlace } : {}),
			...(p.extras?.maritalStatus ? { familienstand: p.extras.maritalStatus } : {}),
			...(p.extras?.zmr ? { zmr_zahl: p.extras.zmr } : {}),
			staatsangehoerigkeit: countryNameDe(p.nationality),
			...(id ? { dokument_art: docType[id.type] ?? id.type, dokument_nummer: id.number, dokument_gueltig: isoToAt(id.validUntil) } : {}),
			...(p.primaryAddress ? { bisherige_adresse: p.primaryAddress, abmeldung_gleichzeitig: "yes", zuzug_ausland: "nein" } : {}),
			hauptwohnsitz: "ja",
			unterschrift_datum: isoToAt(today),
		};
	},

	toServiceData: (v) => ({
		new_address: formatAddress({ street: v.strasse, houseNo: v.hausnummer, stair: v.stiege, door: v.tuer, zip: v.plz, city: v.ort }),
		move_in_date: atToIso(v.einzugsdatum),
		residence_type: v.hauptwohnsitz === "nein" ? "secondary" : "main",
		...(v.bisherige_adresse ? { previous_address: v.bisherige_adresse } : {}),
		deregister_previous: yesNo(v.abmeldung_gleichzeitig),
		landlord_signature: yesNo(v.unterkunftgeber_unterschrift),
		id_document: [v.dokument_art, v.dokument_nummer].filter(Boolean).join(" "),
	}),
};
