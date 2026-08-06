import fs from "fs";
import path from "path";
import { loadComicSource } from "./comicSource";

const EXTENSIONS = [".gif", ".jpg", ".jpeg", ".png", ".webp", ".bmp"];

function findImage(key: string, assetsDir: string): string {
	for (const ext of EXTENSIONS) {
		const candidate = path.join(assetsDir, `${key}${ext}`);
		if (fs.existsSync(candidate)) {
			return `assets/comics/${key}${ext}`;
		}
	}
	return "";
}

function formatDate(dateStr: string): string {
	return `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`;
}

interface Entry {
	date: string;
	transcript: string;
	image?: string;
	id?: string;
	sort?: number;
	aspectRatio?: number;
}

export function exportComicsJson(projectDir: string): string {
	const assetsDir = path.join(projectDir, "assets", "comics");
	const source = loadComicSource(path.join(projectDir, "comics.yaml"));

	const entries: Entry[] = [];

	for (const [dateStr, daily] of Object.entries(source.dailies)) {
		const entry: Entry = {
			date: formatDate(dateStr),
			transcript: daily.transcript,
		};
		const img = findImage(dateStr, assetsDir);
		if (img) entry.image = img;
		entries.push(entry);
	}

	for (const [sid, special] of Object.entries(source.specials)) {
		const entry: Entry = {
			date: formatDate(special.date),
			transcript: special.transcript,
			id: sid,
		};
		if (special.sort) entry.sort = special.sort;
		if (special["aspect-ratio"]) entry.aspectRatio = special["aspect-ratio"];
		const img = findImage(sid, assetsDir);
		if (img) entry.image = img;
		entries.push(entry);
	}

	entries.sort((a, b) => {
		if (a.date !== b.date) return a.date.localeCompare(b.date);
		if ((a.sort || 0) !== (b.sort || 0)) return (a.sort || 0) - (b.sort || 0);
		return (a.id || "").localeCompare(b.id || "");
	});

	return JSON.stringify(entries);
}
