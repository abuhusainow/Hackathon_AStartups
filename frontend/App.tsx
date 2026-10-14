/**
 * IDA – barrierefreie KI-Bürgerservice-Plattform.
 * Auth gate: simulated ID Austria login → portal (chat, voice, forms with translation layer).
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me } from "./api";
import { formStore } from "./lib/form-store";
import { panelStore } from "./lib/panel-store";
import { Login } from "./screens/Login";
import { Portal } from "./screens/Portal";

/** Remembers the open conversation per citizen (reload keeps the chat). */
const convKey = (pid: string) => `ida-conversation:${pid}`;

export function App() {
	const [me, setMe] = useState<Me | null>(null);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		setLoading(true);
		api
			.me()
			.then(async (m) => {
				let id: string | null = null;
				try {
					id = localStorage.getItem(convKey(m.profile.id));
				} catch {
					/* private mode */
				}
				if (!id) {
					id = (await api.newConversation()).id;
					try {
						localStorage.setItem(convKey(m.profile.id), id);
					} catch {
						/* private mode */
					}
				}
				setConversationId(id);
				setMe(m);
				setError(null);
			})
			.catch((err) => {
				setMe(null);
				if (!(err instanceof ApiError && err.status === 401)) setError(err.message);
			})
			.finally(() => setLoading(false));
	}, []);

	useEffect(load, [load]);

	if (loading)
		return (
			<div style={{ display: "grid", placeItems: "center", minHeight: "100vh" }} role="status">
				<span className="spinner" aria-label="Laden …" />
			</div>
		);

	if (!me)
		return (
			<>
				{error && (
					<p role="alert" className="badge pending" style={{ display: "block", margin: 16 }}>
						{error}
					</p>
				)}
				<Login onLoggedIn={load} />
			</>
		);

	const openConversation = (id: string) => {
		try {
			localStorage.setItem(convKey(me.profile.id), id);
		} catch {
			/* private mode */
		}
		formStore.reset();
		panelStore.reset();
		setConversationId(id);
	};

	return (
		<Portal
			key={conversationId ?? "none"}
			me={me}
			conversationId={conversationId ?? me.agentName.split("--")[1]}
			onOpenConversation={openConversation}
			onNewConversation={async () => openConversation((await api.newConversation()).id)}
			onLogout={async () => {
				await api.logout().catch(() => {});
				formStore.reset();
				document.documentElement.removeAttribute("data-contrast");
				document.documentElement.style.removeProperty("--text-scale");
				document.documentElement.dir = "ltr";
				setMe(null);
			}}
		/>
	);
}
