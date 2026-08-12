/**
 * A light stemmer: inflection only, never derivation.
 *
 * The engine already bridges one direction of this by prefix — a query for `snack` reaches
 * `snacks` because the corpus word is the longer one. The other direction has nothing:
 * `complained` cannot reach `complains`, `growing` cannot reach `grow`, and the term is not
 * merely unhelpful but expensive, since it still counts toward the coverage the field has to
 * carry.
 *
 * This is Porter's first step and nothing after it. Steps 2 onward are derivational —
 * `relational -> relate`, `hopefulness -> hope` — and change what a word means rather than
 * how it is inflected. `-er` and `-est` are left out for the same reason: every agent noun
 * ends in `-er`, so the rule that reaches `fast` from `faster` also reaches `wait` from
 * `waiter` and `moth` from `mother`.
 *
 * The output is never shown to anyone and does not have to be a word. It only has to be
 * consistent: every form of one word must reduce to the same string, and two unrelated words
 * must not. `nothing -> noth` is therefore not a defect, while `care -> car` would be, and
 * the conditions on the silent `e` below are what keep the two apart.
 */

const VOWELS = new Set(["a", "e", "i", "o", "u"]);

// `y` is a vowel only where it stands in for one: consonantal in `young`, vocalic in `happy`.
function isConsonant(word: string, index: number): boolean {
	const letter = word[index];
	if (VOWELS.has(letter)) return false;
	if (letter !== "y") return true;
	return index === 0 || !isConsonant(word, index - 1);
}

// Porter's m: how many vowel-then-consonant groups the word has after any leading consonants.
// It stands in for length in syllables, which is what decides whether a short stem is a whole
// word missing its silent `e` (`hop`, m = 1) or already complete (`complain`, m = 2).
function measure(word: string): number {
	let index = 0;
	let groups = 0;
	while (index < word.length && isConsonant(word, index)) index++;
	while (index < word.length) {
		while (index < word.length && !isConsonant(word, index)) index++;
		if (index === word.length) break;
		groups++;
		while (index < word.length && isConsonant(word, index)) index++;
	}
	return groups;
}

function hasVowel(word: string): boolean {
	for (let index = 0; index < word.length; index++) if (!isConsonant(word, index)) return true;
	return false;
}

function endsDoubled(word: string): boolean {
	return word.length >= 2 && word[word.length - 1] === word[word.length - 2] && isConsonant(word, word.length - 1);
}

// Consonant-vowel-consonant with a final consonant that can carry a silent `e`. `w`, `x` and
// `y` never do, so `grow` and `fix` are excluded.
function consonantVowelConsonant(word: string): boolean {
	if (word.length < 3) return false;
	const last = word[word.length - 1];
	return (
		isConsonant(word, word.length - 3) &&
		!isConsonant(word, word.length - 2) &&
		isConsonant(word, word.length - 1) &&
		!"wxy".includes(last)
	);
}

/**
 * Restores what stripping `-ed` or `-ing` took with it. `hoping` and `hopping` both arrive as
 * a bare `hop`-shaped stem and have to be told apart: the doubled consonant of `hopping` is
 * the suffix's doing and comes off, while the single consonant of `hoping` means a silent `e`
 * was dropped and goes back on. Without this the two collapse together, and so do `car` and
 * `care`, `strip` and `stripe`, `rob` and `robe`.
 */
function restore(stem: string): string {
	if (stem.endsWith("at") || stem.endsWith("bl") || stem.endsWith("iz")) return stem + "e";
	if (endsDoubled(stem) && !"lsz".includes(stem[stem.length - 1])) return stem.slice(0, -1);
	if (measure(stem) === 1 && consonantVowelConsonant(stem)) return stem + "e";
	return stem;
}

// `-es` is a syllable of its own only after these. After a single `s` it is not — `houses` is
// `house` plus `s`, not `hous` plus `es` — which is why the plain `-s` rule has to take those.
const SIBILANT = /(?:x|z|ch|sh|ss)$/;

// Nothing English pluralises with these, so a word ending in one ends in it for its own
// reasons: `bus`, `this`, `us`, `glass`. Taking the `s` off leaves a stem no other form of
// the word will ever reach.
const NOT_PLURAL = /(?:ss|us|is)$/;

function plural(word: string): string {
	if (word.endsWith("ies")) return word.slice(0, -2);
	if (word.endsWith("es") && SIBILANT.test(word.slice(0, -2))) return word.slice(0, -2);
	if (!word.endsWith("s") || NOT_PLURAL.test(word)) return word;
	return word.slice(0, -1);
}

function tense(word: string): string {
	if (word.endsWith("eed")) return measure(word.slice(0, -3)) > 0 ? word.slice(0, -1) : word;
	if (word.endsWith("ed") && hasVowel(word.slice(0, -2))) return restore(word.slice(0, -2));
	if (word.endsWith("ing") && hasVowel(word.slice(0, -3))) return restore(word.slice(0, -3));
	return word;
}

// A final `y` becomes `i` so that `hurry`, `hurries` and `hurried` — which the rules above
// leave as `hurry`, `hurri` and `hurri` — all agree.
function settleY(word: string): string {
	return word.endsWith("y") && hasVowel(word.slice(0, -1)) ? word.slice(0, -1) + "i" : word;
}

export function stem(word: string): string {
	const owned = word.endsWith("'s") ? word.slice(0, -2) : word.endsWith("'") ? word.slice(0, -1) : word;
	return settleY(tense(plural(owned)));
}
