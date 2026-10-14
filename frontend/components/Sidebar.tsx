/**
 * Left sidebar (like common AI chat apps): new conversation, main navigation and the list of
 * earlier conversations. On small screens it is a drawer opened from the header.
 */
import type { Conversation } from "../api";
import type { T } from "../i18n";
import { uiLocale } from "../lib/datetime";

export type View = "assistant" | "appointments" | "documents" | "memory";

type Props = {
	t: T;
	lang: string;
	open: boolean;
	view: View;
	conversations: Conversation[];
	currentConversationId: string;
	onNavigate: (view: View) => void;
	onNewConversation: () => void;
	onSelectConversation: (id: string) => void;
	onDeleteConversation: (c: Conversation) => void;
	onClose: () => void;
};

function relativeDay(iso: string, lang: string): string {
	const d = new Date(iso);
	const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
	const locale = uiLocale(lang);
	if (days <= 6) {
		try {
			return new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(-days, "day");
		} catch {
			/* fall through */
		}
	}
	return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}

export function Sidebar(p: Props) {
	const nav: { view: View; icon: string; label: string }[] = [
		{ view: "assistant", icon: "support_agent", label: p.t("navAssistant") },
		{ view: "appointments", icon: "event", label: p.t("navAppointments") },
		{ view: "documents", icon: "folder_shared", label: p.t("navDocuments") },
	];

	// Group conversations by relative day ("heute", "gestern", date).
	const groups = new Map<string, Conversation[]>();
	for (const c of p.conversations) {
		const key = relativeDay(c.updatedAt, p.lang);
		groups.set(key, [...(groups.get(key) ?? []), c]);
	}

	return (
		<>
			{p.open && <div className="sidebar-backdrop" onClick={p.onClose} aria-hidden="true" />}
			<aside className={`sidebar${p.open ? " open" : ""}`} aria-label={p.t("navAssistant")}>
				<button type="button" className="btn btn-primary sidebar-new" onClick={p.onNewConversation}>
					<span className="material-symbols-outlined" aria-hidden="true">
						add_comment
					</span>
					{p.t("newChat")}
				</button>

				<nav className="sidebar-nav" aria-label="Hauptnavigation">
					{nav.map((n) => (
						<button key={n.view} type="button" aria-current={p.view === n.view ? "page" : undefined} onClick={() => p.onNavigate(n.view)}>
							<span className="material-symbols-outlined" aria-hidden="true">
								{n.icon}
							</span>
							{n.label}
						</button>
					))}
					{/* MVP: inbox is only a placeholder entry without function. */}
					<button type="button" className="sidebar-inbox" aria-disabled="true" title={p.t("soon")}>
						<span className="material-symbols-outlined" aria-hidden="true">
							inbox
						</span>
						{p.t("navInbox")}
						<span className="soon-badge">{p.t("soon")}</span>
					</button>
					<button type="button" aria-current={p.view === "memory" ? "page" : undefined} onClick={() => p.onNavigate("memory")}>
						<span className="material-symbols-outlined" aria-hidden="true">
							psychology
						</span>
						{p.t("navMemory")}
					</button>
				</nav>

				<div className="sidebar-section">
					<h2>{p.t("conversations")}</h2>
					{p.conversations.length === 0 && <p className="muted sidebar-empty">{p.t("noConversations")}</p>}
					{[...groups.entries()].map(([day, list]) => (
						<div key={day} className="conv-group">
							<h3>{day}</h3>
							<ul>
								{list.map((c) => {
									const current = c.id === p.currentConversationId && p.view === "assistant";
									return (
										<li key={c.id} className={current ? "current" : undefined}>
											<button type="button" className="conv-link" aria-current={current ? "page" : undefined} onClick={() => p.onSelectConversation(c.id)} title={c.title}>
												{c.title || p.t("untitledConversation")}
											</button>
											<button type="button" className="conv-delete" aria-label={`${p.t("deleteConversation")}: ${c.title}`} title={p.t("deleteConversation")} onClick={() => p.onDeleteConversation(c)}>
												<span className="material-symbols-outlined" aria-hidden="true">
													delete
												</span>
											</button>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</div>
			</aside>
		</>
	);
}
