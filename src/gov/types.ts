/**
 * Types for the mock e-government backend.
 */
import type { CitizenExtras } from "../shared/forms/types";
import type { AccessibilityProfile, Language } from "../shared/types";

export type Localized = Record<Language, string>;

export type DocumentType = "passport" | "id_card" | "residence_permit" | "eu_registration_certificate";

export type CitizenDocument = {
	id: string;
	type: DocumentType;
	number: string;
	/** ISO date (YYYY-MM-DD) or null if unlimited. */
	validUntil: string | null;
};

export type HouseholdMember = {
	name: string;
	relation: "child" | "partner" | "other";
	birthDate: string;
};

export type Citizen = {
	id: string;
	firstName: string;
	lastName: string;
	birthDate: string;
	/** ISO 3166 country code, e.g. "AT". */
	nationality: string;
	/** Free text, e.g. "Austrian citizen", "Rot-Weiß-Rot – Karte plus". */
	residenceStatus: string;
	primaryAddress: string | null;
	secondaryAddress: string | null;
	phone: string | null;
	email: string | null;
	/** BCP-47 code, e.g. "de", "en", "uk". */
	preferredLanguage: string;
	/** Languages the citizen speaks (BCP-47), best first. */
	languages: string[];
	/** Accessibility needs known from earlier contact with the authority (fictional). */
	accessibility: AccessibilityProfile;
	/** Extra register data from the simulated ID Austria login (used for pre-filling forms). */
	extras: CitizenExtras;
	digitalLiteracy: "low" | "medium" | "high";
	household: HouseholdMember[];
	/** Internal notes (e.g. accessibility needs). Visible to the assistant. */
	notes: string;
	/** Short hint for hackathon teams: what this persona is good for testing. */
	scenarioHint: string;
	documents: CitizenDocument[];
};

export type FieldType = "text" | "date" | "select" | "boolean";

export type FormField = {
	id: string;
	label: Localized;
	type: FieldType;
	required: boolean;
	/** For boolean fields: the value must be "yes" to submit. */
	mustBeTrue?: boolean;
	options?: { value: string; label: Localized }[];
	hint?: Localized;
};

export type EligibilityResult = {
	eligible: boolean;
	/** Why the citizen is (not) eligible. */
	reasons: string[];
	/** Documents or data that are missing. */
	missing: string[];
	/** Things worth mentioning (e.g. passport still valid). */
	warnings: string[];
};

export type ServiceDefinition = {
	id: string;
	/** "full" = modelled end to end; "mock" = simplified rules, clearly labelled. */
	implementation: "full" | "mock";
	referencePrefix: string;
	name: Localized;
	summary: Localized;
	authority: Localized;
	keywords: string[];
	requiresAppointment: boolean;
	fields: FormField[];
	/** Values that can be pre-filled from the citizen profile. */
	prefill: (citizen: Citizen, today: string) => Record<string, string>;
	eligibility: (citizen: Citizen, today: string) => EligibilityResult;
	nextSteps: Record<Language, string[]>;
};

export type Application = {
	id: string;
	citizenId: string;
	serviceId: string;
	status: "draft" | "submitted";
	data: Record<string, string>;
	referenceNumber: string | null;
	createdAt: string;
	submittedAt: string | null;
};

export type AppointmentSlot = {
	id: string;
	office: string;
	serviceId: string;
	/** Local Vienna time, e.g. "2026-10-20T09:30". */
	slotTime: string;
	citizenId: string | null;
};

export type Booking = {
	id: string;
	citizenId: string;
	slotId: string;
	serviceId: string;
	office: string;
	/** Local Vienna time, e.g. "2026-10-20T09:30". */
	slotTime: string;
	referenceNumber: string;
	status: "booked" | "cancelled";
	createdAt: string;
};

export type Handoff = {
	id: string;
	citizenId: string | null;
	sessionId: string | null;
	reason: string;
	summary: string;
	preferredChannel: string | null;
	createdAt: string;
};
