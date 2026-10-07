import { loadComicSource } from "./comicSource";

function formatDate(dateStr: string): string {
	return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

export function exportDescriptions(config?: string): string {
	const source = loadComicSource(config);

	const descriptions: Record<string, string> = {};

	for (const [dateStr, daily] of Object.entries(source.dailies)) {
		if (daily.description) descriptions[formatDate(dateStr)] = daily.description;
	}

	for (const [sid, special] of Object.entries(source.specials)) {
		if (special.description) descriptions[sid] = special.description;
	}

	return JSON.stringify(descriptions);
}
