/**
 * IDA – barrierefreie KI-Bürgerservice-Plattform.
 * Auth gate: simulated ID Austria login → portal (chat, voice, forms with translation layer).
 */
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, type Me } from "./api";
import { formStore } from "./lib/form-store";
import { Login } from "./screens/Login";
import { Portal } from "./screens/Portal";

export function App() {
	const [me, setMe] = useState<Me | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = useCallback(() => {
		setLoading(true);
		api
			.me()
			.then((m) => {
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

	return (
		<Portal
			key={me.agentName}
			me={me}
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
