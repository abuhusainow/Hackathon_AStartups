/**
 * Long-term memory about a citizen (D1).
 *
 *   user_memory              key/value facts: preferences, languages, barriers, life context
 *   conversation_summaries   one short summary per session ("what happened last time")
 *
 * These tables are NOT dropped by POST /api/gov/admin/reset (that only resets the mock registers).
 * Citizens can see and delete everything in the UI ("What IDA knows about me") – GDPR transparency.
 */
import type { MemoryCategory, MemoryItem } from "../shared/types";

const SCHEMA = [
	`CREATE TABLE IF NOT EXISTS user_memory (
		id TEXT PRIMARY KEY,
		citizen_id TEXT NOT NULL,
		key TEXT NOT NULL,
		value TEXT NOT NULL,
		category TEXT NOT NULL,
		confidence REAL NOT NULL DEFAULT 0.8,
		source TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		UNIQUE (citizen_id, key)
	)`,
	`CREATE TABLE IF NOT EXISTS conversation_summaries (
		citizen_id TEXT NOT NULL,
		session_id TEXT NOT NULL,
		summary TEXT NOT NULL,
		updated_at TEXT NOT NULL,
		PRIMARY KEY (citizen_id, session_id)
	)`,
];

let ready: Promise<void> | null = null;

export function ensureMemoryTables(db: D1Database): Promise<void> {
	if (!ready) {
		ready = db
			.batch(SCHEMA.map((s) => db.prepare(s)))
			.then(() => undefined)
			.catch((err) => {
				ready = null;
				throw err;
			});
	}
	return ready;
}

type Row = {
	id: string;
	citizen_id: string;
	key: string;
	value: string;
	category: string;
	confidence: number;
	source: string;
	updated_at: string;
};

const CATEGORIES: MemoryCategory[] = ["preference", "language", "barrier", "context"];

function toItem(r: Row): MemoryItem {
	return {
		id: r.id,
		key: r.key,
		value: r.value,
		category: (CATEGORIES as string[]).includes(r.category) ? (r.category as MemoryCategory) : "context",
		confidence: r.confidence,
		source: r.source as MemoryItem["source"],
		updatedAt: r.updated_at,
	};
}

export async function listMemory(db: D1Database, citizenId: string): Promise<MemoryItem[]> {
	await ensureMemoryTables(db);
	const { results } = await db.prepare("SELECT * FROM user_memory WHERE citizen_id = ? ORDER BY category, key").bind(citizenId).all<Row>();
	return results.map(toItem);
}

export type MemoryUpsert = { key: string; value: string; category: MemoryCategory; confidence?: number };

export function normalizeKey(key: string): string {
	return key
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 60);
}

export async function upsertMemory(db: D1Database, citizenId: string, items: MemoryUpsert[], source: MemoryItem["source"]): Promise<void> {
	await ensureMemoryTables(db);
	const now = new Date().toISOString();
	const stmts = items
		.map((i) => ({ ...i, key: normalizeKey(i.key), value: i.value.trim().slice(0, 500) }))
		.filter((i) => i.key && i.value && CATEGORIES.includes(i.category))
		.map((i) =>
			db
				.prepare(
					`INSERT INTO user_memory (id, citizen_id, key, value, category, confidence, source, updated_at)
					 VALUES (?, ?, ?, ?, ?, ?, ?, ?)
					 ON CONFLICT (citizen_id, key) DO UPDATE SET value = excluded.value, category = excluded.category,
					   confidence = excluded.confidence, source = excluded.source, updated_at = excluded.updated_at`,
				)
				.bind(`mem-${crypto.randomUUID().slice(0, 12)}`, citizenId, i.key, i.value, i.category, Math.min(1, Math.max(0, i.confidence ?? 0.8)), source, now),
		);
	if (stmts.length) await db.batch(stmts);
}

export async function deleteMemoryKeys(db: D1Database, citizenId: string, keys: string[]): Promise<void> {
	await ensureMemoryTables(db);
	const stmts = keys.map((k) => db.prepare("DELETE FROM user_memory WHERE citizen_id = ? AND key = ?").bind(citizenId, normalizeKey(k)));
	if (stmts.length) await db.batch(stmts);
}

export async function deleteMemoryItem(db: D1Database, citizenId: string, id: string): Promise<boolean> {
	await ensureMemoryTables(db);
	const res = await db.prepare("DELETE FROM user_memory WHERE citizen_id = ? AND id = ?").bind(citizenId, id).run();
	return (res.meta.changes ?? 0) > 0;
}

export async function clearMemory(db: D1Database, citizenId: string): Promise<void> {
	await ensureMemoryTables(db);
	await db.batch([
		db.prepare("DELETE FROM user_memory WHERE citizen_id = ?").bind(citizenId),
		db.prepare("DELETE FROM conversation_summaries WHERE citizen_id = ?").bind(citizenId),
	]);
}

export async function saveSummary(db: D1Database, citizenId: string, sessionId: string, summary: string): Promise<void> {
	await ensureMemoryTables(db);
	await db
		.prepare(
			`INSERT INTO conversation_summaries (citizen_id, session_id, summary, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (citizen_id, session_id) DO UPDATE SET summary = excluded.summary, updated_at = excluded.updated_at`,
		)
		.bind(citizenId, sessionId, summary.slice(0, 1000), new Date().toISOString())
		.run();
}

export async function recentSummaries(db: D1Database, citizenId: string, limit = 3): Promise<{ summary: string; updatedAt: string }[]> {
	await ensureMemoryTables(db);
	const { results } = await db
		.prepare("SELECT summary, updated_at FROM conversation_summaries WHERE citizen_id = ? ORDER BY updated_at DESC LIMIT ?")
		.bind(citizenId, limit)
		.all<{ summary: string; updated_at: string }>();
	return results.map((r) => ({ summary: r.summary, updatedAt: r.updated_at }));
}
