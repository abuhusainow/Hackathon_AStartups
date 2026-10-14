/**
 * Which panel is shown on the right (form or appointment selection) + the state of the
 * appointment selection. Same tiny store pattern as form-store.ts.
 */
import { useSyncExternalStore } from "react";
import type { BookingResult, Slot } from "../api";

export type PanelState = {
	active: "form" | "appointments" | null;
	serviceId: string | null;
	slots: Slot[];
	/** Slots the AI suggests (e.g. "Thursday morning"). */
	highlight: string[];
	loading: boolean;
	booked: BookingResult | null;
	/** Increments whenever the AI wants the panel to be visible (mobile tab switch). */
	revealTick: number;
};

const INITIAL: PanelState = { active: null, serviceId: null, slots: [], highlight: [], loading: false, booked: null, revealTick: 0 };

let state: PanelState = INITIAL;
const listeners = new Set<() => void>();

export const panelStore = {
	get: () => state,
	set(patch: Partial<PanelState> | ((s: PanelState) => Partial<PanelState>)) {
		state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
		listeners.forEach((l) => l());
	},
	subscribe(l: () => void) {
		listeners.add(l);
		return () => listeners.delete(l);
	},
	reset() {
		panelStore.set({ ...INITIAL, revealTick: state.revealTick });
	},
};

export function usePanelStore(): PanelState {
	return useSyncExternalStore(panelStore.subscribe, panelStore.get, panelStore.get);
}
