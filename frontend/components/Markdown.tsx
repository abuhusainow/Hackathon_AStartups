/**
 * Tiny, safe markdown renderer for assistant answers (paragraphs, lists, **bold**, *italic*, links).
 * Builds React elements – never uses innerHTML.
 */
import type { ReactNode } from "react";

function inline(text: string, keyPrefix: string): ReactNode[] {
	const out: ReactNode[] = [];
	const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|\[[^\]]+\]\((https?:\/\/[^)\s]+)\)|https?:\/\/[^\s)]+)/g;
	let last = 0;
	let m: RegExpExecArray | null;
	let i = 0;
	while ((m = re.exec(text))) {
		if (m.index > last) out.push(text.slice(last, m.index));
		const token = m[0];
		const key = `${keyPrefix}-${i++}`;
		if (token.startsWith("**")) out.push(<strong key={key}>{token.slice(2, -2)}</strong>);
		else if (token.startsWith("[")) {
			const label = token.slice(1, token.indexOf("]"));
			out.push(
				<a key={key} href={m[2]} target="_blank" rel="noreferrer noopener">
					{label}
				</a>,
			);
		} else if (token.startsWith("http"))
			out.push(
				<a key={key} href={token} target="_blank" rel="noreferrer noopener">
					{token}
				</a>,
			);
		else out.push(<em key={key}>{token.slice(1, -1)}</em>);
		last = m.index + token.length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

export function Markdown({ text }: { text: string }) {
	const blocks: ReactNode[] = [];
	const lines = text.replace(/\r/g, "").split("\n");
	let list: { ordered: boolean; items: string[] } | null = null;
	let para: string[] = [];

	const flushPara = () => {
		if (para.length) blocks.push(<p key={`p${blocks.length}`}>{inline(para.join(" "), `p${blocks.length}`)}</p>);
		para = [];
	};
	const flushList = () => {
		if (!list) return;
		const items = list.items.map((it, i) => <li key={i}>{inline(it, `l${blocks.length}-${i}`)}</li>);
		blocks.push(list.ordered ? <ol key={`l${blocks.length}`}>{items}</ol> : <ul key={`l${blocks.length}`}>{items}</ul>);
		list = null;
	};

	for (const raw of lines) {
		const line = raw.trim();
		const bullet = /^[-*•]\s+(.*)$/.exec(line);
		const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
		const heading = /^#{1,4}\s+(.*)$/.exec(line);
		if (!line) {
			flushPara();
			flushList();
		} else if (bullet || numbered) {
			flushPara();
			const ordered = !!numbered;
			if (list && list.ordered !== ordered) flushList();
			if (!list) list = { ordered, items: [] };
			list.items.push((bullet ?? numbered)![1]);
		} else if (heading) {
			flushPara();
			flushList();
			blocks.push(
				<p key={`h${blocks.length}`}>
					<strong>{inline(heading[1], `h${blocks.length}`)}</strong>
				</p>,
			);
		} else {
			flushList();
			para.push(line);
		}
	}
	flushPara();
	flushList();
	return <>{blocks}</>;
}
