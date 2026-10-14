/**
 * List of the citizen's conversations with IDA (sidebar "Gespräche").
 * The messages themselves live in the chat agent's Durable Object ("<personaId>--<conversationId>");
 * this table only keeps title and timestamps so old conversations can be found and reopened.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS conversations (
	id TEXT NOT NULL,
	citizen_id TEXT NOT NULL,
	title TEXT NOT NULL DEFAULT '',
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	deleted INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (citizen_id, id)
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

export type Conversation = { id: string; title: string; createdAt: string; updatedAt: string };

/** Conversation ids are random UUIDs created by the server. */
export function isConversationId(id: string): boolean {
	return /^[a-f0-9-]{8,64}$/.test(id);
}

export function shortTitle(text: string): string {
	const clean = text.replace(/\s+/g, " ").trim();
	return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()} …` : clean;
}

export async function createConversation(db: D1Database, citizenId: string): Promise<Conversation> {
	await ensure(db);
	const now = new Date().toISOString();
	const conv = { id: crypto.randomUUID(), title: "", createdAt: now, updatedAt: now };
	await db
		.prepare("INSERT INTO conversations (id, citizen_id, title, created_at, updated_at) VALUES (?, ?, '', ?, ?)")
		.bind(conv.id, citizenId, now, now)
		.run();
	return conv;
}

/** Called on every message: creates the row if needed, sets the title once (first message). */
export async function touchConversation(db: D1Database, citizenId: string, id: string, titleCandidate?: string): Promise<void> {
	if (!isConversationId(id)) return;
	await ensure(db);
	const now = new Date().toISOString();
	const title = titleCandidate ? shortTitle(titleCandidate) : "";
	await db.batch([
		db
			.prepare("INSERT OR IGNORE INTO conversations (id, citizen_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
			.bind(id, citizenId, title, now, now),
		db
			.prepare("UPDATE conversations SET updated_at = ?, deleted = 0, title = CASE WHEN title = '' THEN ? ELSE title END WHERE citizen_id = ? AND id = ?")
			.bind(now, title, citizenId, id),
	]);
}

export async function renameConversation(db: D1Database, citizenId: string, id: string, title: string): Promise<boolean> {
	await ensure(db);
	const res = await db.prepare("UPDATE conversations SET title = ? WHERE citizen_id = ? AND id = ?").bind(shortTitle(title), citizenId, id).run();
	return (res.meta.changes ?? 0) > 0;
}

/** Conversations with at least one message (= a title), newest first. */
export async function listConversations(db: D1Database, citizenId: string): Promise<Conversation[]> {
	await ensure(db);
	const { results } = await db
		.prepare("SELECT id, title, created_at, updated_at FROM conversations WHERE citizen_id = ? AND deleted = 0 AND title != '' ORDER BY updated_at DESC LIMIT 100")
		.bind(citizenId)
		.all<{ id: string; title: string; created_at: string; updated_at: string }>();
	return results.map((r) => ({ id: r.id, title: r.title, createdAt: r.created_at, updatedAt: r.updated_at }));
}

export async function deleteConversation(db: D1Database, citizenId: string, id: string): Promise<boolean> {
	await ensure(db);
	const res = await db.prepare("UPDATE conversations SET deleted = 1 WHERE citizen_id = ? AND id = ?").bind(citizenId, id).run();
	return (res.meta.changes ?? 0) > 0;
}
