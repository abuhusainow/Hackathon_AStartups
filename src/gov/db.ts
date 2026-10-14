/**
 * D1 database for the mock e-government backend.
 *
 * The schema is created and filled with synthetic data automatically on the first request
 * (lazy seeding), so a fresh deploy works without running migrations.
 * Reset anytime with: POST /api/gov/admin/reset
 */
import { PERSONAS } from "./data/personas";
import type { Application, AppointmentSlot, Citizen, CitizenDocument, Handoff } from "./types";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS citizens (
		id TEXT PRIMARY KEY,
		first_name TEXT NOT NULL,
		last_name TEXT NOT NULL,
		birth_date TEXT NOT NULL,
		nationality TEXT NOT NULL,
		residence_status TEXT NOT NULL,
		primary_address TEXT,
		secondary_address TEXT,
		phone TEXT,
		email TEXT,
		preferred_language TEXT NOT NULL,
		digital_literacy TEXT NOT NULL,
		household_json TEXT NOT NULL DEFAULT '[]',
		notes TEXT NOT NULL DEFAULT '',
		scenario_hint TEXT NOT NULL DEFAULT ''
	)`,
	`CREATE TABLE IF NOT EXISTS documents (
		id TEXT PRIMARY KEY,
		citizen_id TEXT NOT NULL,
		type TEXT NOT NULL,
		number TEXT NOT NULL,
		valid_until TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS applications (
		id TEXT PRIMARY KEY,
		citizen_id TEXT NOT NULL,
		service_id TEXT NOT NULL,
		status TEXT NOT NULL,
		data_json TEXT NOT NULL DEFAULT '{}',
		reference_number TEXT,
		created_at TEXT NOT NULL,
		submitted_at TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS appointments (
		id TEXT PRIMARY KEY,
		office TEXT NOT NULL,
		service_id TEXT NOT NULL,
		slot_time TEXT NOT NULL,
		citizen_id TEXT
	)`,
	`CREATE TABLE IF NOT EXISTS handoffs (
		id TEXT PRIMARY KEY,
		citizen_id TEXT,
		session_id TEXT,
		reason TEXT NOT NULL,
		summary TEXT NOT NULL,
		preferred_channel TEXT,
		created_at TEXT NOT NULL
	)`,
];

const TABLES = ["citizens", "documents", "applications", "appointments", "handoffs"];

const OFFICES = ["Passbehörde Wien – Bezirksamt Mitte (Mock)", "Bezirkshauptmannschaft Linz-Land (Mock)"];

// ---------------------------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------------------------

let seeding: Promise<void> | null = null;

/** Makes sure the tables exist and contain the synthetic data. Cheap after the first call. */
export function ensureSeeded(db: D1Database): Promise<void> {
	if (!seeding) {
		seeding = seed(db).catch((err) => {
			seeding = null;
			throw err;
		});
	}
	return seeding;
}

/** Drops all tables and seeds them again. */
export async function resetDatabase(db: D1Database): Promise<void> {
	await db.batch(TABLES.map((t) => db.prepare(`DROP TABLE IF EXISTS ${t}`)));
	seeding = null;
	await ensureSeeded(db);
}

async function seed(db: D1Database): Promise<void> {
	await db.batch(SCHEMA.map((sql) => db.prepare(sql)));
	const row = await db.prepare("SELECT COUNT(*) AS n FROM citizens").first<{ n: number }>();
	// Re-seed (INSERT OR IGNORE) when personas were added after the database was created.
	if (row && row.n >= PERSONAS.length) return;

	const statements: D1PreparedStatement[] = [];
	for (const c of PERSONAS) {
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO citizens (id, first_name, last_name, birth_date, nationality, residence_status,
					primary_address, secondary_address, phone, email, preferred_language, digital_literacy, household_json, notes, scenario_hint)
					VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					c.id, c.firstName, c.lastName, c.birthDate, c.nationality, c.residenceStatus,
					c.primaryAddress, c.secondaryAddress, c.phone, c.email, c.preferredLanguage, c.digitalLiteracy,
					JSON.stringify(c.household), c.notes, c.scenarioHint,
				),
		);
		for (const d of c.documents) {
			statements.push(
				db
					.prepare("INSERT OR IGNORE INTO documents (id, citizen_id, type, number, valid_until) VALUES (?, ?, ?, ?, ?)")
					.bind(d.id, c.id, d.type, d.number, d.validUntil),
			);
		}
	}
	for (const slot of generateSlots()) {
		statements.push(
			db
				.prepare("INSERT OR IGNORE INTO appointments (id, office, service_id, slot_time, citizen_id) VALUES (?, ?, ?, ?, NULL)")
				.bind(slot.id, slot.office, slot.serviceId, slot.slotTime),
		);
	}
	await db.batch(statements);
}

/** Appointment slots for the next 10 working days (passport renewal). */
function generateSlots(): Omit<AppointmentSlot, "citizenId">[] {
	const times = ["08:00", "09:30", "11:00", "13:30"];
	const slots: Omit<AppointmentSlot, "citizenId">[] = [];
	const day = new Date();
	let workingDays = 0;
	let n = 0;
	while (workingDays < 10) {
		day.setUTCDate(day.getUTCDate() + 1);
		const weekday = day.getUTCDay();
		if (weekday === 0 || weekday === 6) continue;
		workingDays++;
		const date = day.toISOString().slice(0, 10);
		times.forEach((time, i) => {
			n++;
			slots.push({
				id: `apt-passport-${String(n).padStart(3, "0")}`,
				office: OFFICES[i % OFFICES.length],
				serviceId: "passport-renewal",
				slotTime: `${date}T${time}`,
			});
		});
	}
	return slots;
}

// ---------------------------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------------------------

type CitizenRow = {
	id: string;
	first_name: string;
	last_name: string;
	birth_date: string;
	nationality: string;
	residence_status: string;
	primary_address: string | null;
	secondary_address: string | null;
	phone: string | null;
	email: string | null;
	preferred_language: string;
	digital_literacy: string;
	household_json: string;
	notes: string;
	scenario_hint: string;
};

type DocumentRow = { id: string; citizen_id: string; type: string; number: string; valid_until: string | null };

type ApplicationRow = {
	id: string;
	citizen_id: string;
	service_id: string;
	status: string;
	data_json: string;
	reference_number: string | null;
	created_at: string;
	submitted_at: string | null;
};

type AppointmentRow = { id: string; office: string; service_id: string; slot_time: string; citizen_id: string | null };

type HandoffRow = {
	id: string;
	citizen_id: string | null;
	session_id: string | null;
	reason: string;
	summary: string;
	preferred_channel: string | null;
	created_at: string;
};

function toCitizen(row: CitizenRow, documents: CitizenDocument[]): Citizen {
	const persona = PERSONAS.find((p) => p.id === row.id);
	return {
		id: row.id,
		firstName: row.first_name,
		lastName: row.last_name,
		birthDate: row.birth_date,
		nationality: row.nationality,
		residenceStatus: row.residence_status,
		primaryAddress: row.primary_address,
		secondaryAddress: row.secondary_address,
		phone: row.phone,
		email: row.email,
		preferredLanguage: row.preferred_language,
		digitalLiteracy: row.digital_literacy as Citizen["digitalLiteracy"],
		household: JSON.parse(row.household_json || "[]"),
		notes: row.notes,
		scenarioHint: row.scenario_hint,
		documents,
		// Static persona data (not stored in D1): accessibility needs, languages, extra register data.
		languages: persona?.languages ?? [row.preferred_language],
		accessibility: persona?.accessibility ?? {},
		extras: persona?.extras ?? {},
	};
}

function toApplication(row: ApplicationRow): Application {
	return {
		id: row.id,
		citizenId: row.citizen_id,
		serviceId: row.service_id,
		status: row.status === "submitted" ? "submitted" : "draft",
		data: JSON.parse(row.data_json || "{}"),
		referenceNumber: row.reference_number,
		createdAt: row.created_at,
		submittedAt: row.submitted_at,
	};
}

function toSlot(row: AppointmentRow): AppointmentSlot {
	return { id: row.id, office: row.office, serviceId: row.service_id, slotTime: row.slot_time, citizenId: row.citizen_id };
}

function toHandoff(row: HandoffRow): Handoff {
	return {
		id: row.id,
		citizenId: row.citizen_id,
		sessionId: row.session_id,
		reason: row.reason,
		summary: row.summary,
		preferredChannel: row.preferred_channel,
		createdAt: row.created_at,
	};
}

// ---------------------------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------------------------

export async function dbListCitizens(db: D1Database): Promise<Citizen[]> {
	const { results } = await db.prepare("SELECT * FROM citizens ORDER BY rowid").all<CitizenRow>();
	return results.map((r) => toCitizen(r, []));
}

export async function dbGetCitizen(db: D1Database, id: string): Promise<Citizen | null> {
	const row = await db.prepare("SELECT * FROM citizens WHERE id = ?").bind(id).first<CitizenRow>();
	if (!row) return null;
	const { results } = await db.prepare("SELECT * FROM documents WHERE citizen_id = ?").bind(id).all<DocumentRow>();
	const docs: CitizenDocument[] = results.map((d) => ({
		id: d.id,
		type: d.type as CitizenDocument["type"],
		number: d.number,
		validUntil: d.valid_until,
	}));
	return toCitizen(row, docs);
}

export async function dbGetApplication(db: D1Database, id: string): Promise<Application | null> {
	const row = await db.prepare("SELECT * FROM applications WHERE id = ?").bind(id).first<ApplicationRow>();
	return row ? toApplication(row) : null;
}

export async function dbGetDraft(db: D1Database, citizenId: string, serviceId: string): Promise<Application | null> {
	const row = await db
		.prepare("SELECT * FROM applications WHERE citizen_id = ? AND service_id = ? AND status = 'draft' ORDER BY created_at DESC LIMIT 1")
		.bind(citizenId, serviceId)
		.first<ApplicationRow>();
	return row ? toApplication(row) : null;
}

export async function dbListApplications(db: D1Database, citizenId?: string): Promise<Application[]> {
	const stmt = citizenId
		? db.prepare("SELECT * FROM applications WHERE citizen_id = ? ORDER BY created_at DESC").bind(citizenId)
		: db.prepare("SELECT * FROM applications ORDER BY created_at DESC LIMIT 200");
	const { results } = await stmt.all<ApplicationRow>();
	return results.map(toApplication);
}

export async function dbInsertApplication(db: D1Database, app: Application): Promise<void> {
	await db
		.prepare(
			"INSERT INTO applications (id, citizen_id, service_id, status, data_json, reference_number, created_at, submitted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(app.id, app.citizenId, app.serviceId, app.status, JSON.stringify(app.data), app.referenceNumber, app.createdAt, app.submittedAt)
		.run();
}

export async function dbUpdateApplication(db: D1Database, app: Application): Promise<void> {
	await db
		.prepare("UPDATE applications SET status = ?, data_json = ?, reference_number = ?, submitted_at = ? WHERE id = ?")
		.bind(app.status, JSON.stringify(app.data), app.referenceNumber, app.submittedAt, app.id)
		.run();
}

export async function dbListFreeSlots(db: D1Database, serviceId: string, fromTime: string, limit: number): Promise<AppointmentSlot[]> {
	const { results } = await db
		.prepare("SELECT * FROM appointments WHERE service_id = ? AND citizen_id IS NULL AND slot_time >= ? ORDER BY slot_time LIMIT ?")
		.bind(serviceId, fromTime, limit)
		.all<AppointmentRow>();
	return results.map(toSlot);
}

export async function dbGetSlot(db: D1Database, id: string): Promise<AppointmentSlot | null> {
	const row = await db.prepare("SELECT * FROM appointments WHERE id = ?").bind(id).first<AppointmentRow>();
	return row ? toSlot(row) : null;
}

/** Books a slot if it is still free. Returns true on success. */
export async function dbBookSlot(db: D1Database, id: string, citizenId: string): Promise<boolean> {
	const res = await db.prepare("UPDATE appointments SET citizen_id = ? WHERE id = ? AND citizen_id IS NULL").bind(citizenId, id).run();
	return (res.meta.changes ?? 0) > 0;
}

export async function dbInsertHandoff(db: D1Database, h: Handoff): Promise<void> {
	await db
		.prepare("INSERT INTO handoffs (id, citizen_id, session_id, reason, summary, preferred_channel, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
		.bind(h.id, h.citizenId, h.sessionId, h.reason, h.summary, h.preferredChannel, h.createdAt)
		.run();
}

export async function dbListHandoffs(db: D1Database): Promise<Handoff[]> {
	const { results } = await db.prepare("SELECT * FROM handoffs ORDER BY created_at DESC LIMIT 200").all<HandoffRow>();
	return results.map(toHandoff);
}
