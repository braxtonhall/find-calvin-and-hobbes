/**
 * Draws strips for the generating agent to write queries about.
 *
 *   yarn sample                  10 strips, seed 1
 *   yarn sample 6 --seed 1004    6 strips, reproducibly
 *
 * Seeded so a run can be repeated exactly, and so two iterations of the loop can be given
 * different seeds without overlapping by accident.
 */
import { loadRealArchive } from "./helpers/archive";

function parseArguments(argv: string[]): { count: number; seed: number } {
	const seedFlag = argv.indexOf("--seed");
	const seed = seedFlag === -1 ? 1 : Number(argv[seedFlag + 1]);
	const positional = argv.filter((argument, index) => !argument.startsWith("--") && index !== seedFlag + 1);
	return { count: Number(positional[0]) || 10, seed };
}

function randomSequence(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), 1 | state);
		value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

const { count, seed } = parseArguments(process.argv.slice(2));
const archive = loadRealArchive();
const next = randomSequence(seed);

const indices = new Set<number>();
while (indices.size < Math.min(count, archive.comics.length)) {
	indices.add(Math.floor(next() * archive.comics.length));
}

const sample = [...indices].map((index) => {
	const comic = archive.comics[index];
	return {
		date: comic.date,
		id: comic.id,
		transcript: comic.transcript,
		alternate: comic.alternate,
		description: archive.descriptions.get(comic.id || comic.date) || null,
	};
});

console.log(JSON.stringify({ seed, count: sample.length, strips: sample }, null, "\t"));
