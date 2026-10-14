/**
 * Evaluation runner: sends every scenario in evals/scenarios.json to the assistant and checks
 * the answers with simple, transparent rules. Produces the "logs and test results" deliverable.
 *
 *   pnpm dev                       # in one terminal
 *   pnpm evals                     # in another (defaults to http://localhost:5173)
 *   BASE_URL=https://<your-worker>.workers.dev pnpm evals
 *   pnpm evals english             # only run some scenario ids
 *
 * Output: test-results/report.md and test-results/results.json
 *
 * 👉 EXTEND HERE:
 *   - add scenarios: only 3 examples ship with the template. Cover the announced cases, noisy and
 *     combined requests, guardrails and outages yourself – the jury will try unannounced ones.
 *   - add an "LLM as judge" check for tone, clarity and plain language
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";

const BASE_URL = (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");

type Expect = {
	toolsCalled?: string[]; // all of these must be called
	anyToolCalled?: string[]; // at least one of these must be called
	toolsNotCalled?: string[]; // none of these may be called
	textIncludesAny?: string[]; // answer contains at least one (case-insensitive)
	textIncludesAll?: string[][]; // for each group, answer contains at least one
	textExcludes?: string[]; // answer must not contain any
	language?: "de" | "en";
};

type Scenario = {
	id: string;
	title: string;
	category: string;
	persona: string;
	language?: "de" | "en";
	messages: string[];
	expect: Expect;
};

type AssistantResult = {
	text: string;
	toolCalls: { tool: string; input: unknown; output: unknown }[];
	steps: number;
	durationMs: number;
};

const GERMAN_HINTS = /\b(und|der|die|das|Sie|ist|nicht|bitte|Ihre?n?|können|müssen)\b/gi;
const ENGLISH_HINTS = /\b(and|the|you|your|is|not|please|can|need|will)\b/gi;

function detectLanguage(text: string): "de" | "en" {
	const de = text.match(GERMAN_HINTS)?.length ?? 0;
	const en = text.match(ENGLISH_HINTS)?.length ?? 0;
	return de >= en ? "de" : "en";
}

function check(expect: Expect, result: AssistantResult): string[] {
	const failures: string[] = [];
	const called = new Set(result.toolCalls.map((c) => c.tool));
	const text = result.text.toLowerCase();
	const has = (s: string) => text.includes(s.toLowerCase());

	for (const tool of expect.toolsCalled ?? []) if (!called.has(tool)) failures.push(`expected tool ${tool} to be called`);
	if (expect.anyToolCalled && !expect.anyToolCalled.some((t) => called.has(t)))
		failures.push(`expected one of [${expect.anyToolCalled.join(", ")}] to be called`);
	for (const tool of expect.toolsNotCalled ?? []) if (called.has(tool)) failures.push(`tool ${tool} must NOT be called`);
	if (expect.textIncludesAny && !expect.textIncludesAny.some(has)) failures.push(`answer should mention one of: ${expect.textIncludesAny.join(" | ")}`);
	for (const group of expect.textIncludesAll ?? []) if (!group.some(has)) failures.push(`answer should mention one of: ${group.join(" | ")}`);
	for (const s of expect.textExcludes ?? []) if (has(s)) failures.push(`answer must NOT contain "${s}"`);
	if (expect.language && result.text && detectLanguage(result.text) !== expect.language)
		failures.push(`answer should be in ${expect.language === "de" ? "German" : "English"}`);
	if (!result.text.trim()) failures.push("empty answer");
	return failures;
}

async function runScenario(s: Scenario) {
	const res = await fetch(`${BASE_URL}/api/evals/chat`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			messages: s.messages.map((content) => ({ role: "user", content })),
			settings: { personaId: s.persona, language: s.language ?? s.expect.language ?? "de" },
		}),
	});
	if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
	return (await res.json()) as AssistantResult;
}

async function main() {
	const all: Scenario[] = JSON.parse(await readFile(new URL("./scenarios.json", import.meta.url), "utf8"));
	const only = process.argv.slice(2);
	const scenarios = only.length ? all.filter((s) => only.includes(s.id)) : all;
	console.log(`Running ${scenarios.length} scenarios against ${BASE_URL}\n`);

	const results = [];
	for (const s of scenarios) {
		process.stdout.write(`• ${s.title} … `);
		try {
			const result = await runScenario(s);
			const failures = check(s.expect, result);
			results.push({ scenario: s, result, failures, passed: failures.length === 0 });
			console.log(failures.length === 0 ? "✅" : `❌\n    ${failures.join("\n    ")}`);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			results.push({ scenario: s, result: null, failures: [message], passed: false });
			console.log(`💥 ${message}`);
		}
	}

	const passed = results.filter((r) => r.passed).length;
	console.log(`\n${passed}/${results.length} passed`);

	await mkdir("test-results", { recursive: true });
	await writeFile("test-results/results.json", JSON.stringify({ baseUrl: BASE_URL, date: new Date().toISOString(), results }, null, 2));
	await writeFile("test-results/report.md", renderReport(results, passed));
	console.log("Report written to test-results/report.md");
}

function renderReport(results: { scenario: Scenario; result: AssistantResult | null; failures: string[]; passed: boolean }[], passed: number) {
	const lines = [
		`# Test results`,
		``,
		`- Date: ${new Date().toISOString()}`,
		`- Target: ${BASE_URL}`,
		`- **Passed: ${passed}/${results.length}**`,
		``,
		`| Scenario | Category | Result | Tools called | Time |`,
		`|---|---|---|---|---|`,
		...results.map(
			(r) =>
				`| ${r.scenario.title} | ${r.scenario.category} | ${r.passed ? "✅" : "❌"} | ${r.result?.toolCalls.map((c) => c.tool).join(", ") ?? "–"} | ${r.result ? `${(r.result.durationMs / 1000).toFixed(1)}s` : "–"} |`,
		),
		``,
		`## Details`,
	];
	for (const r of results) {
		lines.push(``, `### ${r.passed ? "✅" : "❌"} ${r.scenario.title}`, ``, `**Persona:** ${r.scenario.persona}`, ``);
		for (const m of r.scenario.messages) lines.push(`> ${m}`, ``);
		if (r.result) lines.push(`**Answer:**`, ``, r.result.text.split("\n").map((l) => `    ${l}`).join("\n"), ``);
		if (r.failures.length) lines.push(`**Failed checks:**`, ...r.failures.map((f) => `- ${f}`), ``);
	}
	return lines.join("\n");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
