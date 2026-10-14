/**
 * Tests for the IDA platform logic (no AI calls): forms ↔ services, tool registry, Live schema,
 * session security, memory parsing and the session-scoped API. Run: pnpm test
 */
import { SELF } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { liveFunctionDeclarations, TOOL_SPECS } from "../src/agent/tools";
import { agentNameFor, newSession, personaFromAgentName, signSession, verifySession } from "../src/auth/session";
import { getServiceDefinition } from "../src/gov/data/services";
import { PERSONAS } from "../src/gov/data/personas";
import { validateApplicationData } from "../src/gov/service";
import { normalizeKey } from "../src/memory/store";
import { parseDecision, preferencesFrom } from "../src/memory/extract";
import { atToIso, collectTexts, FORMS, isoToAt, missingRequired, parseAddress, allFields } from "../src/shared/forms";
import { CLIENT_TOOL_NAMES, SERVER_TOOL_NAMES } from "../src/shared/tool-names";

const env = { SESSION_SECRET: "test-secret-with-enough-length-123" } as unknown as Env;

describe("forms", () => {
	it("every form maps to an existing service and only produces known service fields", () => {
		for (const form of FORMS) {
			const service = getServiceDefinition(form.serviceId);
			expect(service, form.id).toBeDefined();
			const keys = Object.keys(form.toServiceData({}));
			const known = new Set(service!.fields.map((f) => f.id));
			for (const k of keys) expect(known.has(k), `${form.id} → ${k}`).toBe(true);
		}
	});

	it("a fully filled form produces a valid application for every persona", () => {
		for (const form of FORMS) {
			const persona = PERSONAS.find((p) => p.id === "oksana-kovalenko")!;
			const values = form.prefill(persona, "2026-10-14");
			// fill the remaining required fields with plausible values
			for (const f of allFields(form)) {
				if (!f.required || values[f.id]) continue;
				values[f.id] =
					f.kind === "checkbox" ? "yes" : f.kind === "date" ? "01.10.2026" : f.options ? f.options[0].value : f.id === "plz" ? "1100" : "Test 1";
			}
			expect(missingRequired(form, values), form.id).toEqual([]);
			const problems = validateApplicationData(getServiceDefinition(form.serviceId)!, form.toServiceData(values));
			expect(problems, form.id).toEqual([]);
		}
	});

	it("collects stable, unique text ids for the translation layer", () => {
		for (const form of FORMS) {
			const texts = collectTexts(form);
			expect(texts.title).toBe(form.title);
			expect(Object.keys(texts).length).toBeGreaterThan(20);
			for (const f of allFields(form)) expect(texts[`f.${f.id}`]).toBe(f.label);
		}
	});

	it("parses Austrian addresses and dates", () => {
		expect(parseAddress("Favoritenstraße 112/4/9, 1100 Wien")).toEqual({ street: "Favoritenstraße", houseNo: "112", stair: "4", door: "9", zip: "1100", city: "Wien" });
		expect(parseAddress("Annenstraße 24/3, 8020 Graz").door).toBe("3");
		expect(isoToAt("2026-10-01")).toBe("01.10.2026");
		expect(atToIso("1.10.2026")).toBe("2026-10-01");
	});

	it("pre-fills the family allowance form with children and partner", () => {
		const form = FORMS.find((f) => f.id === "familienbeihilfe")!;
		const values = form.prefill(PERSONAS.find((p) => p.id === "oksana-kovalenko")!, "2026-10-14");
		expect(values.kind1_vorname).toBe("Sofiia");
		expect(values.kind2_vorname).toBe("Maksym");
		expect(values.partner_vorname).toBe("Andrij");
		expect(values.svnr).toBe("7788210389");
	});
});

describe("tool registry", () => {
	it("shared tool names match the server registry", () => {
		const server = Object.entries(TOOL_SPECS)
			.filter(([, s]) => s.side === "server")
			.map(([n]) => n)
			.sort();
		const client = Object.entries(TOOL_SPECS)
			.filter(([, s]) => s.side === "client")
			.map(([n]) => n)
			.sort();
		expect(server).toEqual([...SERVER_TOOL_NAMES].sort());
		expect(client).toEqual([...CLIENT_TOOL_NAMES].sort());
	});

	it("produces Gemini Live function declarations (upper-case types, no JSON-schema meta keys)", () => {
		const decls = liveFunctionDeclarations();
		expect(decls).toHaveLength(Object.keys(TOOL_SPECS).length);
		const json = JSON.stringify(decls);
		expect(json).not.toContain("$schema");
		expect(json).not.toContain("additionalProperties");
		const fill = decls.find((d) => d.name === "fill_fields") as { parameters: { properties: { fields: { type: string; items: { type: string } } } } };
		expect(fill.parameters.properties.fields.type).toBe("ARRAY");
		expect(fill.parameters.properties.fields.items.type).toBe("OBJECT");
	});
});

describe("simulated ID Austria session", () => {
	it("signs and verifies, rejects tampering", async () => {
		const session = newSession("lena-huber");
		const token = await signSession(env, session);
		expect((await verifySession(env, token))?.pid).toBe("lena-huber");
		const [payload, sig] = token.split(".");
		const forged = btoa(JSON.stringify({ ...session, pid: "josef-gruber" })).replace(/=+$/, "");
		expect(await verifySession(env, `${forged}.${sig}`)).toBeNull();
		expect(await verifySession(env, `${payload}.x${sig.slice(1)}`)).toBeNull();
	});

	it("binds the agent instance to the persona", () => {
		const session = newSession("oksana-kovalenko");
		expect(personaFromAgentName(agentNameFor(session))).toBe("oksana-kovalenko");
	});
});

describe("memory", () => {
	it("parses decision model output, also when wrapped in prose", () => {
		const d = parseDecision('Sure:\n```json\n{"upserts":[{"key":"preferred_language","value":"uk","category":"language"}],"deletes":[],"summary":"Asked for family allowance."}\n```');
		expect(d?.upserts[0].value).toBe("uk");
		expect(parseDecision("no json here")).toBeNull();
	});

	it("normalizes keys", () => {
		expect(normalizeKey("Preferred Language")).toBe("preferred_language");
		expect(normalizeKey("Sehvermögen/Brille")).toBe("sehvermogen_brille");
	});

	it("derives UI preferences from memory and accessibility needs", () => {
		const now = new Date().toISOString();
		const prefs = preferencesFrom(
			[
				{ id: "1", key: "preferred_language", value: "tr", category: "language", confidence: 1, source: "chat", updatedAt: now },
				{ id: "2", key: "easy_language", value: "true", category: "preference", confidence: 1, source: "chat", updatedAt: now },
			],
			{ vision: "low_vision" },
			"de",
		);
		expect(prefs).toMatchObject({ language: "tr", textScale: 1.5, contrast: "high", easyLanguage: true });
	});
});

describe("session-scoped API", () => {
	async function login(personaId: string) {
		const res = await SELF.fetch("https://example.com/api/auth/login", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ personaId }),
		});
		expect(res.status).toBe(200);
		return res.headers.get("set-cookie")!.split(";")[0];
	}

	it("requires a login", async () => {
		expect((await SELF.fetch("https://example.com/api/auth/me")).status).toBe(401);
		expect((await SELF.fetch("https://example.com/api/memory")).status).toBe(401);
	});

	it("returns the logged-in citizen and applies their needs", async () => {
		const cookie = await login("mehmet-yilmaz");
		const me = (await (await SELF.fetch("https://example.com/api/auth/me", { headers: { cookie } })).json()) as any;
		expect(me.profile.id).toBe("mehmet-yilmaz");
		expect(me.preferences).toMatchObject({ language: "tr", textScale: 1.5, contrast: "high" });
	});

	it("runs server tools for the voice channel with the session's citizen", async () => {
		const cookie = await login("josef-gruber");
		const res = await SELF.fetch("https://example.com/api/tools/get_my_profile", {
			method: "POST",
			headers: { cookie, "content-type": "application/json" },
			body: JSON.stringify({ input: { citizenId: "lena-huber" } }),
		});
		const body = (await res.json()) as any;
		expect(body.result.id).toBe("josef-gruber");
	});

	it("refuses a chat agent of another citizen", async () => {
		const cookie = await login("lena-huber");
		const res = await SELF.fetch("https://example.com/agents/citizen-assistant/josef-gruber--abc", { headers: { cookie } });
		expect(res.status).toBe(403);
	});

	it("submits a complete Meldezettel via the form endpoint", async () => {
		const cookie = await login("lena-huber");
		const form = FORMS.find((f) => f.id === "meldezettel")!;
		const values = {
			...form.prefill(PERSONAS[0], "2026-10-14"),
			einzugsdatum: "01.10.2026",
			strasse: "Mariahilfer Straße",
			hausnummer: "45",
			plz: "1060",
			ort: "Wien",
			unterkunftgeber_name: "Wohnbau Muster GmbH",
			unterkunftgeber_unterschrift: "yes",
			erklaerung_richtig: "yes",
		};
		const res = await SELF.fetch("https://example.com/api/forms/meldezettel/submit", {
			method: "POST",
			headers: { cookie, "content-type": "application/json" },
			body: JSON.stringify({ values, lang: "de" }),
		});
		const body = (await res.json()) as any;
		expect(res.status).toBe(200);
		expect(body.referenceNumber).toMatch(/^MEL-\d{4}-\d{6}$/);
	});

	it("rejects an incomplete form", async () => {
		const cookie = await login("lena-huber");
		const res = await SELF.fetch("https://example.com/api/forms/familienbeihilfe/submit", {
			method: "POST",
			headers: { cookie, "content-type": "application/json" },
			body: JSON.stringify({ values: {} }),
		});
		expect(res.status).toBe(400);
	});

	it("books, lists and cancels an appointment (slot becomes free again)", async () => {
		const cookie = await login("josef-gruber");
		const headers = { cookie, "content-type": "application/json" };
		const slots = (await (await SELF.fetch("https://example.com/api/appointments/slots?serviceId=passport-renewal", { headers })).json()) as any;
		const slot = slots.slots[0];
		const booked = (await (await SELF.fetch(`https://example.com/api/appointments/${slot.id}/book`, { method: "POST", headers })).json()) as any;
		expect(booked.referenceNumber).toMatch(/^TERMIN-/);

		const mine = (await (await SELF.fetch("https://example.com/api/appointments", { headers })).json()) as any;
		expect(mine.upcoming.map((a: any) => a.bookingId)).toContain(booked.bookingId);

		const cancel = await SELF.fetch(`https://example.com/api/appointments/${booked.bookingId}/cancel`, { method: "POST", headers });
		expect(cancel.status).toBe(200);
		const after = (await (await SELF.fetch("https://example.com/api/appointments", { headers })).json()) as any;
		expect(after.upcoming.map((a: any) => a.bookingId)).not.toContain(booked.bookingId);
		const free = (await (await SELF.fetch("https://example.com/api/appointments/slots?serviceId=passport-renewal", { headers })).json()) as any;
		expect(free.slots.map((s: any) => s.id)).toContain(slot.id);
	});

	it("cannot cancel another citizen's appointment", async () => {
		const josef = await login("josef-gruber");
		const slots = (await (await SELF.fetch("https://example.com/api/appointments/slots?serviceId=passport-renewal", { headers: { cookie: josef } })).json()) as any;
		const booked = (await (await SELF.fetch(`https://example.com/api/appointments/${slots.slots[1].id}/book`, { method: "POST", headers: { cookie: josef } })).json()) as any;
		const lena = await login("lena-huber");
		const res = await SELF.fetch(`https://example.com/api/appointments/${booked.bookingId}/cancel`, { method: "POST", headers: { cookie: lena } });
		expect(res.status).toBe(404);
	});
});
