/**
 * Shows what a query currently returns.
 *
 *   yarn probe "calvin rosalyn help"
 *   yarn probe "rosalyn susie" --limit 20
 *
 * For debugging and for reading tuning results. NOT for use while generating or validating
 * queries: an agent that can see the rankings will write queries the current configuration
 * already answers, and the loop then measures its own tail instead of the product.
 */
import { search } from "../src/search";
import { install, loadRealArchive } from "./helpers/archive";

const argv = process.argv.slice(2);
const limitFlag = argv.indexOf("--limit");
const limit = limitFlag === -1 ? 10 : Number(argv[limitFlag + 1]) || 10;
const query = argv.filter((argument, index) => !argument.startsWith("--") && index !== limitFlag + 1).join(" ");

if (!query) {
	console.error('usage: yarn probe "<query>" [--limit n]');
	process.exit(1);
}

const archive = loadRealArchive();
install(archive);

const results = search(query, "rank");
console.log(`"${query}" -> ${results.length} results\n`);

for (const [position, result] of results.slice(0, limit).entries()) {
	const snippet = result.text.slice(0, 88).replace(/\s+/g, " ");
	console.log(
		`${String(position + 1).padStart(3)}. ${result.comic.date}  ${result.score.toFixed(3).padStart(7)}  ` +
			`${result.source.padEnd(11)} ${snippet}`,
	);
}

if (results.length > limit) console.log(`\n… ${results.length - limit} more`);
