/**
 * Unit/integration tests for the mock backend (no AI calls). Run: pnpm test
 * For AI quality tests (scenarios), use: pnpm evals
 */
import { SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";

const BASE = "https://example.com/api/gov";

async function json(path: string, init?: RequestInit) {
	const res = await SELF.fetch(`${BASE}${path}`, {
		...init,
		headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
	});
	return { status: res.status, body: (await res.json()) as any };
}

describe("mock e-government API", () => {
	beforeAll(async () => {
		await json("/admin/reset", { method: "POST" });
	});

	it("lists the synthetic personas", async () => {
		const { status, body } = await json("/citizens");
		expect(status).toBe(200);
		expect(body.length).toBeGreaterThanOrEqual(6);
	});

	it("flags an expired passport", async () => {
		const { body } = await json("/citizens/josef-gruber");
		expect(body.documents[0].status).toBe("expired");
	});

	it("finds the change-of-residence service from colloquial input", async () => {
		const { body } = await json(`/services/search?q=${encodeURIComponent("i bin umzogn")}`);
		expect(body.matches[0].id).toBe("change-of-residence");
	});

	it("rejects incomplete applications and accepts complete ones", async () => {
		const created = await json("/applications", {
			method: "POST",
			body: JSON.stringify({ citizenId: "lena-huber", serviceId: "change-of-residence" }),
		});
		expect(created.status).toBe(201);
		const id = created.body.applicationId;

		const early = await json(`/applications/${id}/submit`, { method: "POST" });
		expect(early.status).toBe(400);

		await json(`/applications/${id}`, {
			method: "PATCH",
			body: JSON.stringify({
				data: { new_address: "Kaiserstraße 1/5, 1070 Wien", move_in_date: "2026-10-01", residence_type: "main", landlord_signature: true },
			}),
		});
		const ok = await json(`/applications/${id}/submit`, { method: "POST" });
		expect(ok.status).toBe(200);
		expect(ok.body.referenceNumber).toMatch(/^MEL-\d{4}-\d{6}$/);
	});

	it("simulates an outage", async () => {
		const { status } = await json("/citizens/lena-huber?simulate=error");
		expect(status).toBe(503);
	});
});
