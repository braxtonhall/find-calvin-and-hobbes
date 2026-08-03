import { Collection } from "./types";
import { SABBATICALS } from "./constants";

export function compactToDate(compact: string): Date {
	const year = parseInt(compact.slice(0, 4), 10);
	const month = parseInt(compact.slice(4, 6), 10);
	const day = parseInt(compact.slice(6, 8), 10);
	return new Date(Date.UTC(year, month - 1, day));
}

export function dateToCompact(dateStr: string): string {
	return dateStr.replace(/-/g, "");
}

export function parseDailiesRange(entry: string): [string, string] {
	if (entry.includes("-")) {
		const [start, end] = entry.split("-");
		return [start, end];
	}
	return [entry, entry];
}

export function isDateInCollection(dateStr: string, collection: Collection): boolean {
	if (!collection.dailies || collection.dailies.length === 0) return false;
	const compact = dateToCompact(dateStr);
	const sundays = collection.sundays || false;
	if (sundays) {
		const dateObject = new Date(
			Date.UTC(
				parseInt(compact.slice(0, 4), 10),
				parseInt(compact.slice(4, 6), 10) - 1,
				parseInt(compact.slice(6, 8), 10),
			),
		);
		if (dateObject.getUTCDay() !== 0) return false;
	}
	for (const entry of collection.dailies) {
		const [start, end] = parseDailiesRange(entry);
		if (compact >= start && compact <= end) return true;
	}
	return false;
}

export function getCollectionCoverage(collection: Collection): string[] {
	const coverage: string[] = [];
	if (!collection.dailies || collection.dailies.length === 0) return coverage;
	if (collection.sundays) {
		coverage.push("Sundays only");
	} else {
		coverage.push("Dailies & Sundays");
	}
	coverage.push(collection.colour ? "Sundays in colour" : "Sundays in black & white");
	return coverage;
}

export function formatCompactRange(entry: string): string {
	const [start, end] = parseDailiesRange(entry);
	const startDate = compactToDate(start);
	const endDate = compactToDate(end);
	const formatDate = (date: Date) =>
		date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
	return `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`;
}

export function dateToString(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function formatDateRange(start: string, end: string): string {
	const [startYear, startMonth, startDay] = start.split("-").map(Number);
	const [endYear, endMonth, endDay] = end.split("-").map(Number);
	const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
	const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));
	const formatDate = (date: Date) =>
		date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
	return `${formatDate(startDate)} \u2013 ${formatDate(endDate)}`;
}

export function isSabbatical(dateStr: string): boolean {
	return SABBATICALS.some(([sabbaticalStart, sabbaticalEnd]) => dateStr >= sabbaticalStart && dateStr <= sabbaticalEnd);
}
