# Find Calvin and Hobbes

A searchable, browsable archive of every Calvin and Hobbes comic strip (1985–1995) with full-text transcripts, a calendar grid, and collection browsing.

## Search syntax

Type words to search transcripts. Type `@` in the search box for the list of filters.

| Filter        | Example                        | Meaning                                                   |
| ------------- | ------------------------------ | --------------------------------------------------------- |
| `@year:`      | `@year:1990`, `@year:88`       | strips from that year, or any year ending in those digits |
| `@month:`     | `@month:8`, `@month:august`    | that month, in every year                                 |
| `@day:`       | `@day:3`, `@day:saturday`      | a day of the month, or a day of the week                  |
| `@date:`      | `@date:1988`, `@date:1988/9/3` | a date, at whatever precision you give                    |
| `@before:`    | `@before:1990`                 | strips before that date, excluding it                     |
| `@after:`     | `@after:1987`                  | strips after that date, excluding it                      |
| `@in:`        | `@in:book3`, `@in:complete`    | strips printed in that book                               |
| `@is:`        | `@is:sunday`, `@is:rerun`      | strips with that tag                                      |
| `@i:`         | `@i:own`, `@i:bookmarked`      | strips you own, bookmarked or noted                       |
| `@featuring:` | `@featuring:susie`             | strips featuring that character                           |
| `@by:`        | `@by:watterson`                | strips by that creator                                    |
| `@during:`    | `@during:goonarmy`             | strips in that story arc                                  |

The tags are `sunday` and `daily` (the colour Sundays and the black-and-white dailies), `reused`
(a strip on the day it first ran, where it was later rerun), `rerun` (a strip on a day it ran
again), `altered` (a strip some book printed with changes), `empty` (a strip with an empty
transcript) and `standalone` (a strip in no arc). Those are facts about the strip; `@i:` is your
relationship to it, kept in your browser: `@i:own` (a printing you own), `@i:bookmarked` and
`@i:noted` (a strip you wrote a note on). Reruns only appear in results when the search asks for
`@is:rerun` or `@i:`, or names the exact date one ran.

Different filters narrow. Repeating a filter widens where a strip can have only one value for it —
`@day:saturday @day:sunday` is the weekend, and `@year:1988 @year:1989` is either year — and for
books, which mostly share no strips: `@in:book1 @in:book3` is the strips printed in either book
(`@in:book1 @and @in:book3` is both) — and for creators, who mostly either made every strip together
or took over from each other: `@by:foster @by:murphy` is either one's strips. Writing `@or` between some of them changes nothing:
`@year:1988 @or @year:1989 @year:1990` is any of the three years. Repeating a tag narrows, for `@i:` as for `@is:`: `@is:sunday @is:rerun` is the Sundays
that ran again, and so does repeating a character: `@featuring:susie @featuring:rosalyn` is the
strips with both. `@day:1 @day:monday` is the Mondays that fell
on the first, because a day of the month and a day of the week are different things. Filters combine
with ordinary words, so `@year:1988 snowman` searches 1988 alone.

Three operators combine words and filters, tightest first:

| Operator | Example                         | Meaning                                        |
| -------- | ------------------------------- | ---------------------------------------------- |
| `@not`   | `snowman @not @is:sunday`       | without the next word, filter, or `(group)`    |
| `@or`    | `@day:saturday @or @day:sunday` | either the word, filter or `(group)` each side |
| `@and`   | `@year:1988 @and @month:8`      | both — a space, without the widening above     |

Quotation marks ask for exact words: `"snow goons"` is those two words, in that order, side by
side, with no other spelling, inflection or near miss of either — though punctuation between them
and a compound written the other way (`"snow man"` for `snowman`) still count. Everything inside is
text, so `"rosalyn @or baby"` is a phrase rather than a choice; it is never read as a date either,
so `"1988"` finds the strips that say it. A quotation left open closes at the end, and curly quotes
work too. A quotation is one atom to the operators above, so `@not "baby sitter"` is anything that
does not say baby sitter.

So `rosalyn @or baby sitter` is `(rosalyn @or baby) sitter`; the phrase needs parentheses,
`rosalyn @or (baby sitter)`. `@not baby sitter` is sitter without baby, and `@not (baby sitter)` is
anything without both. A word under `@not` is matched literally, in any inflection, rather than
searched for.

`@in:` takes a book's id rather than its title, because a filter value takes no spaces. Type `@in:`
and the menu lists every book the archive indexes with its title beside it, so `@in:book3` is _Yukon
Ho!_ and `@in:complete` is the whole Complete. A book that is not on that list matches nothing and
says so.

### Strips and their collections

Books, story arcs, creators and characters are each a collection of strips, and one operator crosses
from a strip to each kind: `@in` to its books, `@during` to its arcs, `@by` to its creators and
`@featuring` to its characters. Each takes the one word, filter or `(group)` after it, which is about
the collection rather than the strip — `@in:book3` is short for `@in (@id:book3)`:

| Example                         | Meaning                                         |
| ------------------------------- | ----------------------------------------------- |
| `@in @i:own`                    | in a book you own                               |
| `@i:own @or @in @i:own`         | a printing you own, or in a book you own        |
| `@only @in @i:own`              | in at least one book, and only in books you own |
| `@in (@id:book1 @here:altered)` | altered in Book 1                               |

<!-- @strips: is not user facing yet.
| `@in (@i:own @strips:<1000)`            | in an owned book that isn't one of the huge Completes |
| `@not @in @strips:>0`                   | in no book at all                                     |
| `@during (@strips:>20 @has @is:sunday)` | in a long arc that has a Sunday                       |
-->

`@only` before any of these is "at least one, and all of them". `@here:altered`, inside one, is
about how that collection prints that strip, where `@is:altered` is altered in any book.

The Collections page has a search box too, and the tab you are on says which kind of collection it
finds. A collection's words are its own — a book's title, an arc's description
— and every word of its strips, so `susie mom` finds the arcs where both appear, in one strip or
two. Anything about its strips goes in `@has`, which crosses back down: `@has @is:sunday` is an arc
with a Sunday, `@not @has @is:sunday` one without, and `@only @has @year:1988` one entirely in 1988.
A collection's own filters are `@is:` (`book`, `arc`, `creator`, `character`, `colour`, `writer`,
`artist` — a tag that cannot be true of a kind is false), `@i:` (`own`, `noted` — only a book), `@id:`
<!-- @strips: is not user facing yet.
`@strips:` (`>5`, `>=5`, `<5`, `<=5`, `5`, `5..10`)
-->

and `@published:` (a year, as `@year:` takes it: a book's year, or any year one of an arc's strips ran;
two side by side mean either).

Filter values are read year first — `@date:1988/9/3` is September 3rd, never March 9th — and take
no spaces. A bare date typed on its own is understood without any `@`, as long as it starts from
the year: `1988`, `august 1988` and `august 3 1988` are all dates, while a day in every year is
what `@month:august @day:3` is for.

A two-digit year is every year ending in those digits, never a guess at the century: `@year:88`,
`@date:88/9/3` and a bare `aug 3 '88` all mean any year ending in 88 — in this archive, only
1988 — while `@before:` and `@after:` need all four digits, because a bound has to be a single day.

## Build

```sh
yarn install
yarn build
yarn serve   # http://localhost:3000
```

The build writes one HTML file per address — `1986-07-07.html`, `book/yukonho.html`,
`credits.html`, and so on — each holding that page as the app would draw it, plus the data it was
drawn from in a `<script type="application/json">` in the head. A cold load paints before the
script runs and unfurls with its own title and description when shared; once the script runs it
takes the page over in place and every further click is drawn client-side, as before. The home
page is also written as `404.html` and `not_found.html` for the addresses that have no file, which
the app reads and draws from the archive.

Addresses need a host that serves `credits.html` for `/credits`, which GitHub Pages and Neocities
do. For a host that does not, set `PAGE_LAYOUT=directory` to write `credits/index.html` instead
(see `config.yaml`). `yarn serve` handles either, and it is what to use locally, since the app
routes on the path and does not work from `file://`.

Every page is built by the same code the app uses to draw it: the view builders in `src/pages/`
have no DOM and take a `Page` of plain data, and `src/views/` wraps them with the handlers. The
pages are written by `build-chain/PagesPlugin.ts`.

### Configuration

Everything about the site and its archive is in `config.yaml`, and its comments explain each
setting. The build reads whichever file `SITE_CONFIG` names, which every script in `package.json`
sets to `config.yaml`; to build from another, run `SITE_CONFIG=other.yaml npx webpack --mode production`.

The search's tuning is measured in `test/tuning`: `yarn tune` sweeps its values, `yarn probe "<query>"`
shows what a query returns, and `yarn candidates` lists compound words `compounds` doesn't mention yet.

### Domain

`SITE_URL` sets the site's address, which turns on its canonical tags, sitemap and `CNAME`, and can
mount it under a path. Set it in `.env` (copy `.env.sample`) or the Actions variables; `config.yaml`
explains the rest. The mount is compiled into the bundle, so changing it needs a fresh build rather
than a `--watch` rebuild.

### Corrections

Every page with something correctable on it links to a form for reporting it. Where each link
leads is a template in `config.yaml`. Forks should leave these as they are, so corrections all
reach the same form. Set `CORRECTIONS=false` to leave the link off every page.

### Images

A strip's image goes in the folder `calvin-and-hobbes/comics/`, as `YYYYMMDD.ext` or a special's id — drop
one in and that strip has an image.
