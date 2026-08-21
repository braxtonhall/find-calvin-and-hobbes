# Find Calvin and Hobbes

A searchable, browsable archive of every Calvin and Hobbes comic strip (1985–1995) with full-text transcripts, a calendar grid, and collection browsing.

## Search syntax

Type words to search transcripts. Type `@` in the search box for the list of filters, and Tab to
accept one.

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

Repeating a filter widens; combining different ones narrows. `@day:saturday @day:sunday` is the
weekend, while `@day:1 @day:monday` is the Mondays that fell on the first. Filters combine with
ordinary words, so `@year:1988 snowman` searches 1988 alone.

Filter values are read year first — `@date:1988/9/3` is September 3rd, never March 9th — and take
no spaces. A bare date typed on its own (`august 3 1988`) is understood without any `@`.

## Build

```sh
yarn install
yarn build
```

### Images

Comic strip images go in `assets/comics/` named by date as `YYYYMMDD.ext` (e.g. `assets/comics/19851118.gif`). Collection cover images go directly in `assets/` (e.g. `assets/book1.png`). The webpack build discovers these automatically and copies them into `dist/assets/`.
