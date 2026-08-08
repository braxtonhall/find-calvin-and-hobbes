# Find Calvin and Hobbes

A searchable, browsable archive of every Calvin and Hobbes comic strip (1985–1995) with full-text transcripts, a calendar grid, and collection browsing.

## Build

```sh
yarn install
yarn build
```

### Images

Comic strip images go in `assets/comics/` named by date as `YYYYMMDD.ext` (e.g. `assets/comics/19851118.gif`). Collection cover images go directly in `assets/` (e.g. `assets/book1.png`). The webpack build discovers these automatically and copies them into `dist/assets/`.
