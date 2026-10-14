/** Small helpers for calling the Worker's REST API from the browser (cookies carry the session). */
import type { AccessibilityProfile, AssistantSettings, FormState, MemoryItem } from "../src/shared/types";
import type { ProfileForForms } from "../src/shared/forms";

export type Persona = {
	id: string;
	name: string;
	preferredLanguage: string;
	languages: string[];
	accessibility: AccessibilityProfile;
	scenarioHint: string;
};

export type Profile = ProfileForForms & {
	id: string;
	preferredLanguage: string;
	languages: string[];
	accessibility: AccessibilityProfile;
	digitalLiteracy: string;
	today: string;
};

export type Me = {
	agentName: string;
	levelOfAssurance: string;
	profile: Profile;
	memory: MemoryItem[];
	preferences: Partial<AssistantSettings>;
	capabilities: { gemini: boolean; decisionModel: string };
};

export type SubmissionResult = {
	type: "submission_result";
	referenceNumber: string;
	serviceName: string;
	authority: string;
	submittedAt: string;
	nextSteps: string[];
};

export type BookingResult = {
	type: "booking_result";
	bookingId: string;
	referenceNumber: string;
	serviceName: string;
	office: string;
	slotTime: string;
	nextSteps: string[];
};

export type Slot = { id: string; office: string; serviceId: string; slotTime: string };

export type MyAppointment = {
	bookingId: string;
	serviceId: string;
	serviceName: string;
	office: string;
	slotTime: string;
	referenceNumber: string;
	status: "booked" | "cancelled";
	past: boolean;
	nextSteps: string[];
};

export class ApiError extends Error {
	constructor(
		public status: number,
		message: string,
	) {
		super(message);
	}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
	const res = await fetch(path, {
		...init,
		credentials: "same-origin",
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
	});
	if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => ({}))) as { error?: string }).error ?? res.statusText);
	return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });

export const api = {
	personas: () => request<Persona[]>("/api/personas"),
	login: (personaId: string) => post<{ agentName: string }>("/api/auth/login", { personaId }),
	logout: () => post("/api/auth/logout"),
	me: () => request<Me>("/api/auth/me"),
	memory: () => request<MemoryItem[]>("/api/memory"),
	deleteMemory: (id: string) => request(`/api/memory/${encodeURIComponent(id)}`, { method: "DELETE" }),
	clearMemory: () => request("/api/memory", { method: "DELETE" }),
	ingestTranscript: (transcript: { role: "user" | "assistant"; text: string }[]) => post("/api/memory/ingest", { transcript }),
	translateForm: (formId: string, lang: string) => post<{ texts: Record<string, string>; cached: boolean }>("/api/translate", { kind: "form", formId, lang }),
	translateUi: (lang: string) => post<{ texts: Record<string, string> }>("/api/translate", { kind: "ui", lang }),
	liveToken: (mode: "voice" | "dictation", settings: AssistantSettings, formState: FormState | null, attempt = 0) =>
		post<{ token: string; wsUrl: string; model: string }>("/api/live/token", { mode, settings, formState, attempt }),
	serverTool: (name: string, input: unknown, settings: AssistantSettings) => post<{ result: unknown }>(`/api/tools/${name}`, { input, settings }),
	transcribe: (audio: string, mimeType: string, language: string) => post<{ text: string }>("/api/transcribe", { audio, mimeType, language }),
	saveDraft: (formId: string, values: Record<string, string>, lang: string) =>
		post<{ applicationId: string; missingOrInvalid: string[]; formMissing: string[] }>(`/api/forms/${formId}/draft`, { values, lang }),
	submitForm: (formId: string, values: Record<string, string>, lang: string) => post<SubmissionResult>(`/api/forms/${formId}/submit`, { values, lang }),
	bookAppointment: (slotId: string, lang: string) => post<BookingResult>(`/api/appointments/${encodeURIComponent(slotId)}/book?lang=${lang}`),
	appointments: (lang: string) => request<{ upcoming: MyAppointment[]; history: MyAppointment[] }>(`/api/appointments?lang=${lang}`),
	appointmentServices: (lang: string) => request<{ id: string; name: string }[]>(`/api/appointments/services?lang=${lang}`),
	appointmentSlots: (serviceId: string) => request<{ slots: Slot[] }>(`/api/appointments/slots?serviceId=${encodeURIComponent(serviceId)}`),
	cancelAppointment: (bookingId: string) => post<{ cancelled: boolean }>(`/api/appointments/${encodeURIComponent(bookingId)}/cancel`),
};
