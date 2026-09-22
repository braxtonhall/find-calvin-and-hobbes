import { Day } from "./types";
import { RANGE_START, RANGE_END } from "./constants";
import { dateToString, isSabbatical } from "./date-utils";

/**
 * Every day of the run, in order, with the week it falls in. Pure so that the build can walk the
 * same calendar the grid draws: the previous and next arrows on a prerendered page are found by
 * the same stepping the app does.
 */
export function computeDays(): Day[] {
	const [startYear, startMonth, startDay] = RANGE_START.split("-").map(Number);
	const [endYear, endMonth, endDay] = RANGE_END.split("-").map(Number);

	const startDate = new Date(Date.UTC(startYear, startMonth - 1, startDay));
	const endDate = new Date(Date.UTC(endYear, endMonth - 1, endDay));

	const firstMonday = new Date(startDate);
	firstMonday.setUTCDate(startDate.getUTCDate() - ((startDate.getUTCDay() + 6) % 7));

	const days: Day[] = [];
	const current = new Date(startDate);

	while (current <= endDate) {
		const year = current.getUTCFullYear();
		const month = current.getUTCMonth() + 1;
		const day = current.getUTCDate();
		const dateStr = dateToString(year, month, day);
		const dayOfWeek = current.getUTCDay();
		const msDiff = current.getTime() - firstMonday.getTime();
		const weekIndex = Math.floor(msDiff / (7 * 24 * 60 * 60 * 1000));

		const stateLabel = isSabbatical(dateStr) ? "none" : "has-comic";

		days.push({ date: dateStr, weekIndex, dayOfWeek, state: stateLabel });
		current.setUTCDate(current.getUTCDate() + 1);
	}

	return days;
}
