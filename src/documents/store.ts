/**
 * "Meine Dokumente": everything the citizen submitted or received through IDA.
 *   application    copy of a submitted form (form id + the German form values) – shown as the original form
 *   confirmation   confirmation from the authority (Meldebestätigung, Eingangsbestätigung, Terminbestätigung)
 * Documents are created by the Worker when a submission / booking succeeds (src/routes/app-api.ts).
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS documents_store (
	id TEXT PRIMARY KEY,
	citizen_id TEXT NOT NULL,
	kind TEXT NOT NULL,
	title TEXT NOT NULL,
	form_id TEXT,
	service_id TEXT,
	reference_number TEXT,
	status TEXT NOT NULL DEFAULT 'valid',
	data_json TEXT NOT NULL DEFAULT '{}',
	created_at TEXT NOT NULL
)`;

let ready: Promise<void> | null = null;

function ensure(db: D1Database): Promise<void> {
	if (!ready) {
		ready = db
			.prepare(SCHEMA)
			.run()
			.then(() => undefined)
			.catch((err) => {
				ready = null;
				throw err;
			});
	}
	return ready;
}

export type DocumentKind = "application" | "confirmation";

export type CitizenDocumentRecord = {
	id: string;
	kind: DocumentKind;
	title: string;
	formId: string | null;
	serviceId: string | null;
	referenceNumber: string | null;
	status: "valid" | "cancelled";
	data: Record<string, unknown>;
	createdAt: string;
};

type Row = {
	id: string;
	kind: string;
	title: string;
	form_id: string | null;
	service_id: string | null;
	reference_number: string | null;
	status: string;
	data_json: string;
	created_at: string;
};

function toDoc(r: Row): CitizenDocumentRecord {
	return {
		id: r.id,
		kind: r.kind === "application" ? "application" : "confirmation",
		title: r.title,
		formId: r.form_id,
		serviceId: r.service_id,
		referenceNumber: r.reference_number,
		status: r.status === "cancelled" ? "cancelled" : "valid",
		data: JSON.parse(r.data_json || "{}"),
		createdAt: r.created_at,
	};
}

export async function addDocument(
	db: D1Database,
	citizenId: string,
	doc: { kind: DocumentKind; title: string; formId?: string; serviceId?: string; referenceNumber?: string; data: Record<string, unknown> },
): Promise<string> {
	await ensure(db);
	const id = `doc-${crypto.randomUUID().slice(0, 12)}`;
	await db
		.prepare(
			"INSERT INTO documents_store (id, citizen_id, kind, title, form_id, service_id, reference_number, data_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
		)
		.bind(id, citizenId, doc.kind, doc.title, doc.formId ?? null, doc.serviceId ?? null, doc.referenceNumber ?? null, JSON.stringify(doc.data), new Date().toISOString())
		.run();
	return id;
}

export async function listDocuments(db: D1Database, citizenId: string): Promise<CitizenDocumentRecord[]> {
	await ensure(db);
	const { results } = await db.prepare("SELECT * FROM documents_store WHERE citizen_id = ? ORDER BY created_at DESC").bind(citizenId).all<Row>();
	return results.map(toDoc);
}

export async function getDocument(db: D1Database, citizenId: string, id: string): Promise<CitizenDocumentRecord | null> {
	await ensure(db);
	const row = await db.prepare("SELECT * FROM documents_store WHERE citizen_id = ? AND id = ?").bind(citizenId, id).first<Row>();
	return row ? toDoc(row) : null;
}

/** Marks the confirmation of a cancelled appointment as cancelled. */
export async function markCancelled(db: D1Database, citizenId: string, referenceNumber: string): Promise<void> {
	await ensure(db);
	await db.prepare("UPDATE documents_store SET status = 'cancelled' WHERE citizen_id = ? AND reference_number = ?").bind(citizenId, referenceNumber).run();
}
