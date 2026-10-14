/**
 * REST API of the mock e-government backend, built with Hono (https://hono.dev).
 *
 * Mounted at /api/gov. Useful for the frontend, for curl/Postman, and for anything else your team
 * builds (voice bot, case-worker dashboard, ...). See README for example requests.
 *
 * Every endpoint accepts ?simulate=slow|error to test how your assistant handles a slow or failing
 * backend, and most accept ?lang=de|en.
 */
import { Hono, type Context } from "hono";
import { z } from "zod";
import type { Language } from "../shared/types";
import { dbListApplications, dbListHandoffs, resetDatabase, ensureSeeded } from "./db";
import { GovError } from "./errors";
import * as gov from "./service";
import type { SimulateMode } from "./service";

type Variables = { lang: Language; simulate: SimulateMode };
export type GovApp = { Bindings: Env; Variables: Variables };

export const govRoutes = new Hono<GovApp>();

// Read ?lang and ?simulate once for every request.
govRoutes.use("*", async (c, next) => {
	c.set("lang", c.req.query("lang") === "en" ? "en" : "de");
	const simulate = c.req.query("simulate");
	c.set("simulate", simulate === "slow" || simulate === "error" ? simulate : undefined);
	await next();
});

/** Parses and validates the JSON body with a zod schema (400 on invalid input). */
async function body<T extends z.ZodTypeAny>(c: Context<GovApp>, schema: T): Promise<z.infer<T>> {
	const json = await c.req.json().catch(() => ({}));
	const parsed = schema.safeParse(json);
	if (!parsed.success) throw new GovError(400, `Invalid request body: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`);
	return parsed.data;
}

const formData = z.record(z.string(), z.union([z.string(), z.boolean()]));

// --- Citizens ------------------------------------------------------------------------------------

govRoutes.get("/citizens", async (c) => c.json(await gov.listPersonas(c.env)));

govRoutes.get("/citizens/:id", async (c) => c.json(await gov.getCitizenProfile(c.env, c.req.param("id"), c.var.simulate)));

// --- Services ------------------------------------------------------------------------------------

govRoutes.get("/services", (c) => c.json(gov.listServices(c.var.lang)));

govRoutes.get("/services/search", (c) => c.json(gov.findServices(c.req.query("q") ?? "", c.var.lang)));

govRoutes.get("/services/:id", (c) => c.json(gov.getServiceInfo(c.req.param("id"), c.var.lang)));

govRoutes.get("/services/:id/eligibility", async (c) => {
	const citizenId = c.req.query("citizenId");
	if (!citizenId) throw new GovError(400, "Query parameter citizenId is required");
	return c.json(await gov.checkEligibility(c.env, citizenId, c.req.param("id"), c.var.simulate));
});

govRoutes.get("/services/:id/appointments", async (c) =>
	c.json(await gov.getAppointmentSlots(c.env, c.req.param("id"), Number(c.req.query("limit") ?? 6), c.var.simulate)),
);

// --- Appointments --------------------------------------------------------------------------------

govRoutes.post("/appointments/:slotId/book", async (c) => {
	const { citizenId } = await body(c, z.object({ citizenId: z.string() }));
	return c.json(await gov.bookAppointment(c.env, citizenId, c.req.param("slotId"), c.var.lang, c.var.simulate), 201);
});

// --- Applications --------------------------------------------------------------------------------

govRoutes.post("/applications", async (c) => {
	const input = await body(c, z.object({ citizenId: z.string(), serviceId: z.string(), data: formData.optional() }));
	return c.json(await gov.startApplication(c.env, input.citizenId, input.serviceId, input.data ?? {}, c.var.lang, c.var.simulate), 201);
});

govRoutes.get("/applications", async (c) => {
	await ensureSeeded(c.env.GOV_DB);
	return c.json(await dbListApplications(c.env.GOV_DB, c.req.query("citizenId")));
});

govRoutes.get("/applications/:id", async (c) => c.json(await gov.getApplication(c.env, c.req.param("id"), c.var.lang)));

govRoutes.patch("/applications/:id", async (c) => {
	const { data } = await body(c, z.object({ data: formData }));
	return c.json(await gov.updateApplication(c.env, c.req.param("id"), data, c.var.lang, c.var.simulate));
});

govRoutes.post("/applications/:id/submit", async (c) =>
	c.json(await gov.submitApplication(c.env, c.req.param("id"), c.var.lang, c.var.simulate)),
);

// --- Human handoff -------------------------------------------------------------------------------

govRoutes.post("/handoffs", async (c) => {
	const input = await body(
		c,
		z.object({
			citizenId: z.string().nullish(),
			sessionId: z.string().nullish(),
			reason: z.string().min(1),
			summary: z.string().default(""),
			preferredChannel: z.string().nullish(),
		}),
	);
	return c.json(await gov.createHandoff(c.env, input, c.var.lang), 201);
});

// 👉 EXTEND HERE: a case-worker dashboard could read this list.
govRoutes.get("/handoffs", async (c) => {
	await ensureSeeded(c.env.GOV_DB);
	return c.json(await dbListHandoffs(c.env.GOV_DB));
});

// --- Admin ---------------------------------------------------------------------------------------

// Resets the mock database to the original synthetic data (handy before a demo).
govRoutes.post("/admin/reset", async (c) => {
	await resetDatabase(c.env.GOV_DB);
	return c.json({ ok: true, message: "Mock database reset to seed data." });
});
