import { ComicDetail, MonthShard } from "./types";
import { state } from "./state";

const inFlight = new Map<string, Promise<MonthShard | null>>();

export function monthOf(date: string): string {
	return date.slice(0, 7);
}

export async function loadMonthShard(month: string): Promise<MonthShard | null> {
	if (state.detailsByMonth.has(month)) return state.detailsByMonth.get(month)!;

	const pending = inFlight.get(month);
	if (pending) return pending;

	const request = fetch(`comics/${month}.json`)
		.then((response) => {
			if (!response.ok) throw new Error(`HTTP ${response.status}`);
			return response.json() as Promise<MonthShard>;
		})
		.catch(() => null)
		.then((shard) => {
			state.detailsByMonth.set(month, shard);
			inFlight.delete(month);
			return shard;
		});

	inFlight.set(month, request);
	return request;
}

export function getComicDetail(date: string, id?: string): ComicDetail | undefined {
	const shard = state.detailsByMonth.get(monthOf(date));
	if (!shard) return undefined;
	return shard[id || date];
}

export function prefetchMonthsAround(date: string): void {
	const [year, month] = date.split("-").map(Number);
	for (const offset of [-1, 1]) {
		const neighbour = new Date(Date.UTC(year, month - 1 + offset, 1));
		const key = `${neighbour.getUTCFullYear()}-${String(neighbour.getUTCMonth() + 1).padStart(2, "0")}`;
		void loadMonthShard(key);
	}
}
