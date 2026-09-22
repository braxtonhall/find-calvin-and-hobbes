# Find Calvin and Hobbes

A searchable, browsable archive of every Calvin and Hobbes comic strip (1985–1995) with full-text transcripts, a calendar grid, and collection browsing.

## Search syntax

Type words to search transcripts. Type `@` in the search box for the list of filters.

| Filter     | Example                        | Meaning                                  |
| ---------- | ------------------------------ | ---------------------------------------- |
| `@year:`   | `@year:1990`, `@year:88`       | strips from that year                    |
| `@month:`  | `@month:8`, `@month:august`    | that month, in every year                |
| `@day:`    | `@day:3`, `@day:saturday`      | a day of the month, or a day of the week |
| `@date:`   | `@date:1988`, `@date:1988/9/3` | a date, at whatever precision you give   |
| `@before:` | `@before:1990`                 | strips before that date, excluding it    |
| `@after:`  | `@after:1987`                  | strips after that date, excluding it     |
| `@sunday`  |                                | Sunday strips only                       |
| `@daily`   |                                | weekday strips only                      |
| `@in:`     | `@in:book3`, `@in:complete`    | strips printed in that book              |

Repeating a filter widens; combining different ones narrows. `@day:saturday @day:sunday` is the
weekend, while `@day:1 @day:monday` is the Mondays that fell on the first. Filters combine with
ordinary words, so `@year:1988 snowman` searches 1988 alone.

`@in:` takes a book's id rather than its title, because a filter value takes no spaces. Type `@in:`
and the menu lists every book the archive indexes with its title beside it, so `@in:book3` is _Yukon
Ho!_ and `@in:complete` is the whole Complete. A book that is not on that list matches nothing and
says so.

Filter values are read year first — `@date:1988/9/3` is September 3rd, never March 9th — and take
no spaces. A bare date typed on its own is understood without any `@`, as long as it starts from
the year: `1988`, `august 1988` and `august 3 1988` are all dates, while a day in every year is
what `@month:august @day:3` is for.

## Build

```sh
yarn install
yarn build
yarn serve   # http://localhost:3000
```

The build writes one HTML file per address — `1986-07-07.html`, `collection/yukonho.html`,
`credits.html`, and so on — each holding that page as the app would draw it, plus the data it was
drawn from in a `<script type="application/json">` in the head. A cold load paints before the
script runs and unfurls with its own title and description when shared; once the script runs it
takes the page over in place and every further click is drawn client-side, as before. The home
page is also written as `404.html` and `not_found.html` for the addresses that have no file, which
the app reads and draws from the archive.

Addresses need a host that serves `credits.html` for `/credits`, which GitHub Pages and Neocities
do. For a host that does not, set `PAGE_LAYOUT=directory` to write `credits/index.html` instead
(see `.env.sample`). `yarn serve` handles either, and it is what to use locally, since the app
routes on the path and does not work from `file://`.

Every page is built by the same code the app uses to draw it: the view builders in `src/pages/`
have no DOM and take a `Page` of plain data, and `src/views/` wraps them with the handlers. The
pages are written by `build-chain/PagesPlugin.ts`.

### Domain

The site's own URL is optional at build time. Set `SITE_URL` to have the build
emit the `og:url` and canonical tags on every page, a `robots.txt` sitemap pointer,
`sitemap.xml`, and a `CNAME` file for a GitHub Pages custom domain.

A `SITE_URL` with a path — `https://user.github.io/repo`, as a GitHub project page is served —
mounts the site there: every link, fetch and image is written from `/repo/`, the app reads the
address bar through it, and no `CNAME` is emitted. The mount is compiled into the bundle, so a
change to it needs a fresh build rather than a `--watch` rebuild.

```sh
cp .env.sample .env
# then edit .env and uncomment/set SITE_URL
```

Leave `SITE_URL` unset to build without those files.

### Images

Comic strip images go in `assets/comics/` named by date as `YYYYMMDD.ext` (e.g. `assets/comics/19851118.gif`). Collection cover images go directly in `assets/` (e.g. `assets/book1.png`). The webpack build discovers these automatically and copies them into `dist/assets/`.
