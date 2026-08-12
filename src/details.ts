import { state } from "./state";

let inFlight: Promise<void> | null = null;

export function loadDescriptions(): Promise<void> {
	if (state.descriptions) return Promise.resolve();
	if (inFlight) return inFlight;

	inFlight = fetch("descriptions.json")
		.then((response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json() as Promise<Record<string, string>>;
		})
		.catch(() => ({}) as Record<string, string>)
		.then((descriptions) => {
			state.descriptions = new Map(Object.entries(descriptions));
			inFlight = null;
		});

	return inFlight;
}

export function getDescription(date: string, id?: string): string | undefined {
	return state.descriptions?.get(id || date);
}
