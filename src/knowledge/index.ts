/**
 * Curated knowledge about each public service. The assistant must base factual answers on this
 * content (via the get_service_info tool) and cite the source URL.
 *
 * ⚠️⚠️ VERIFY BEFORE YOUR DEMO ⚠️⚠️
 * These summaries are a STARTING POINT written for the template and have NOT been verified
 * against the official pages. The jury scores factual accuracy (20%)!
 *   1. Open the official page on https://www.oesterreich.gv.at (Topics & Services / Form search)
 *   2. Check and correct the text below
 *   3. Replace `sourceUrl` with the exact page and set `verified: true`
 *
 * 👉 EXTEND HERE: for larger content, consider Cloudflare AI Search (RAG over official pages):
 *    https://developers.cloudflare.com/ai-search/
 */
import type { Language } from "../shared/types";

export type KnowledgeEntry = {
	serviceId: string;
	sourceUrl: string;
	verified: boolean;
	content: Record<Language, string>;
};

const OFFICIAL_PORTAL = "https://www.oesterreich.gv.at/en/formsearch";

export const KNOWLEDGE: KnowledgeEntry[] = [
	{
		serviceId: "change-of-residence",
		sourceUrl: OFFICIAL_PORTAL, // TODO: replace with the exact page on oesterreich.gv.at
		verified: false,
		content: {
			de: `Meldepflicht: Wer in eine Wohnung zieht, muss sich innerhalb von drei Tagen nach dem Einzug bei der Meldebehörde (Gemeindeamt bzw. Magistrat) anmelden.
Benötigt wird: ein ausgefüllter Meldezettel, der von der Unterkunftgeberin bzw. dem Unterkunftgeber (z. B. Vermieter:in) unterschrieben ist, sowie ein amtlicher Lichtbildausweis. Nicht-österreichische Staatsangehörige bringen zusätzlich ein Reisedokument bzw. ihren Aufenthaltstitel mit.
Hauptwohnsitz ist der Ort, an dem man den Mittelpunkt seiner Lebensbeziehungen hat. Man kann daneben Nebenwohnsitze haben.
Die Abmeldung der alten Adresse kann bei der Ummeldung gleichzeitig erledigt werden.
Die Anmeldung ist in vielen Fällen auch online mit ID Austria möglich.`,
			en: `Registration obligation: anyone who moves into a home must register with the registration office (municipal office) within three days of moving in.
You need: a completed registration form (Meldezettel) signed by the accommodation provider (e.g. landlord), and an official photo ID. Non-Austrian citizens also bring their travel document or residence title.
The main residence is where your life is centred. You can also have secondary residences.
Deregistering the old address can be done at the same time.
In many cases, registration is also possible online with ID Austria.`,
		},
	},
	{
		serviceId: "passport-renewal",
		sourceUrl: OFFICIAL_PORTAL, // TODO: replace with the exact page on oesterreich.gv.at
		verified: false,
		content: {
			de: `Ein Reisepass wird persönlich bei einer Passbehörde beantragt (in Österreich: Bezirkshauptmannschaft bzw. Magistrat; im Ausland: österreichische Botschaft oder Konsulat). Bei der Antragstellung werden Fingerabdrücke abgenommen.
Mitzubringen sind in der Regel: der bisherige Reisepass (falls vorhanden), ein aktuelles Passfoto und ein Lichtbildausweis. In bestimmten Fällen sind weitere Dokumente nötig (z. B. Staatsbürgerschaftsnachweis).
Für die Ausstellung fallen Gebühren an. Der Pass wird in der Regel per Post zugestellt.
Österreichische Reisepässe werden nur an österreichische Staatsbürger:innen ausgestellt.`,
			en: `A passport is applied for in person at a passport authority (in Austria: the district authority or municipal office; abroad: the Austrian embassy or consulate). Fingerprints are taken when you apply.
You usually bring: your old passport (if you have one), a current passport photo and a photo ID. In some cases further documents are needed (e.g. proof of citizenship).
Fees apply. The passport is usually delivered by post.
Austrian passports are only issued to Austrian citizens.`,
		},
	},
	{
		serviceId: "childcare-subsidy",
		sourceUrl: OFFICIAL_PORTAL, // TODO: replace with the exact page on oesterreich.gv.at
		verified: false,
		content: {
			de: `Kinderbetreuungsgeld ist eine finanzielle Leistung für Eltern von Kleinkindern. Es gibt zwei Systeme: das pauschale Kinderbetreuungsgeld-Konto und das einkommensabhängige Kinderbetreuungsgeld.
Zuständig ist der Krankenversicherungsträger (z. B. die Österreichische Gesundheitskasse, ÖGK).
Wichtige Voraussetzungen sind u. a.: Bezug der Familienbeihilfe für das Kind, gemeinsamer Haushalt mit dem Kind, Lebensmittelpunkt in Österreich, rechtmäßiger Aufenthalt und die Durchführung der Eltern-Kind-Pass-Untersuchungen.
Der Antrag kann frühestens ab dem Tag der Geburt gestellt werden.`,
			en: `Childcare benefit (Kinderbetreuungsgeld) is financial support for parents of young children. There are two systems: the flat-rate childcare benefit account and the income-related childcare benefit.
It is handled by the health insurance provider (e.g. the Austrian Health Insurance Fund, ÖGK).
Key requirements include: receiving family allowance (Familienbeihilfe) for the child, living in the same household as the child, centre of life in Austria, lawful residence, and completing the Eltern-Kind-Pass (parent-child health booklet) examinations.
You can apply from the day of birth at the earliest.`,
		},
	},
	{
		serviceId: "family-allowance",
		sourceUrl: OFFICIAL_PORTAL, // TODO: replace with the exact page on oesterreich.gv.at / bmf.gv.at
		verified: false,
		content: {
			de: `Familienbeihilfe ist eine monatliche Leistung für Eltern bzw. für Personen, zu deren Haushalt ein Kind gehört. Zuständig ist das Finanzamt Österreich.
Anspruch besteht grundsätzlich für minderjährige Kinder; für volljährige Kinder nur unter bestimmten Voraussetzungen (z. B. Berufsausbildung), längstens bis zu einer Altersgrenze.
Voraussetzungen sind u. a. der Mittelpunkt der Lebensinteressen in Österreich und – bei Nicht-Österreicher:innen – ein rechtmäßiger Aufenthalt. Für bestimmte Gruppen (z. B. Vertriebene aus der Ukraine) gelten Sonderregeln.
Nach der Geburt eines Kindes in Österreich wird die Familienbeihilfe in vielen Fällen automatisch (antraglos) gewährt; sonst wird sie mit dem Formular Beih 100 beantragt.
Änderungen, die den Anspruch betreffen, müssen innerhalb eines Monats gemeldet werden.`,
			en: `Family allowance (Familienbeihilfe) is a monthly payment for parents or for people whose household includes a child. It is handled by the Tax Office Austria (Finanzamt Österreich).
It is generally paid for children under 18; for adult children only under certain conditions (e.g. vocational training), up to an age limit.
Requirements include having the centre of your life in Austria and – for non-Austrians – lawful residence. Special rules apply to certain groups (e.g. displaced persons from Ukraine).
After a child is born in Austria, family allowance is often granted automatically (without application); otherwise you apply with form Beih 100.
Changes that affect the entitlement must be reported within one month.`,
		},
	},
];

export function getKnowledge(serviceId: string): KnowledgeEntry | undefined {
	return KNOWLEDGE.find((k) => k.serviceId === serviceId);
}
