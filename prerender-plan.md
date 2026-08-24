# Removing hash routing from `find-calvin-and-hobbes`

Working notes from a design conversation. Goal: drop `#/` from URLs, keep the site
fully static and host-portable, keep the SPA transitions that already exist, and
serve ~3,200 routes.

---

## Context

|                      |                                                                             |
| -------------------- | --------------------------------------------------------------------------- |
| Stack                | Hand-rolled TS SPA, webpack, `ts-loader`, `style-loader`                    |
| Routing today        | Hash-based                                                                  |
| Hosting              | GitHub Pages + custom domain (CNAME); Neocities as a possible future target |
| Route count          | ~3,200 — of which ~3,150 are strip pages, structurally identical            |
| Current `index.html` | 129K, with HTML + JS + CSS all inlined                                      |
| Data                 | `comics.json` fetched at runtime; spinner on the results page               |

Constraints: no server, no rewrite rules, no cache-header control.

---

## The core idea

**A prerendered HTML file is a cold-load entry point and nothing else.**

- **Cold load** (paste a URL, hard refresh) — the host serves the file for that
  path, content paints, then JS boots and takes over. No transition, because
  there is no previous view.
- **Warm navigation** (clicking a link in a live app) — the router intercepts,
  renders, transitions, `pushState`. The browser never requests the HTML file.

So prerendering and SPA transitions never occur at the same moment. Existing
transition code is untouched.

**Corollary: if every route has a real file, no host configuration is needed.**
The `404.html` SPA hack exists only because a SPA has no file at `/about`. Emit
one and every static host serves it correctly — GitHub Pages, Neocities, S3, a
USB stick.

---

## Recommendations

### 1. Router changes

- Read `location.pathname` instead of `location.hash`; `pushState` instead of
  hash assignment; listen for `popstate`.
- Intercept link clicks, but **pass through**: modified clicks (cmd/ctrl/shift,
  middle-click), `target`, `download`, and cross-origin hrefs. Turbo's source is
  a good reference for the exhaustive list.
- Things hash routing let you skip, now yours to own: scroll restoration per
  history entry, focus management on route change, `<title>` updates, and an
  `aria-live` announcement.
- **Handle the base path** — the router must strip it before matching and prefix
  it when pushing. See §8.

### 2. File layout

- **`path/index.html`, never `path.html`.** Serving `index.html` for a directory
  request is the one universal static-host behavior. Clean-URL rewriting
  (`/about` → `about.html`) is a per-host feature and relying on it is exactly
  the portability leak to avoid.
- Emit the shell to **both `404.html` and `not_found.html`** — GitHub Pages
  (also Netlify, Cloudflare, Vercel) uses the first, Neocities the second. A few
  KB, no conditional config, and it covers search-result URLs and anything not
  enumerated. Note GitHub Pages serves it with a real 404 status; irrelevant for
  routes that have real files.
- Normalize the trailing slash in the router; hosts differ on whether `/about`
  is served directly or 301'd to `/about/`.
- **Leave `sitemap.xml` at the ~50 real pages.** A sitemap does one thing: tell
  crawlers what to index. Since visibility isn't a goal, 3,151 entries generate
  a few hundred KB of XML per build for nobody. Nice-looking links come entirely
  from `og:` tags — pasting a URL into Slack fetches that page and unfurls from
  its meta tags, with no sitemap involved. The per-strip prerendering is still
  fully justified; only the sitemap half isn't.

### 3. Webpack changes

**Fix `publicPath: ""` — do this first.** This is a silent blocker. Relative
asset URLs resolve fine from `/index.html`, but from `/1985/11/18/index.html` a
reference to `assets/comics/19851118.gif` becomes
`/1985/11/18/assets/comics/19851118.gif` and 404s. Set it to the base path (`/`
at root, `/foo/` on a project site) — see §8.

**Drop `HtmlInlineScriptPlugin`.** 129K × 3,151 ≈ 410MB of near-identical bytes,
re-downloaded in full on every cold load. Externalize with `<script defer
src="/index.js">`. Inlining was correct when the file was an empty clone — JS was
on the critical path then. Once pages have prerendered content it is not.

**Keep `filename: "[name].js"` unhashed.** Already correct. Content-hashed names
mean any code change rewrites all 3,151 HTML files, turning every deploy into a
full re-upload and defeating incremental push. No cache-header control on these
hosts anyway.

**Replace `style-loader` with `mini-css-extract-plugin`.** Runtime-injected CSS
is the actual cause of any flash — the browser paints unstyled, then restyles
when the bundle runs. External CSS in `<head>` is render-blocking but does _not_
flash; it just delays first paint by one round trip. Keep `style-loader` in dev
for HMR:

```js
use: [dev ? "style-loader" : MiniCssExtractPlugin.loader, "css-loader"];
```

**Write a `StripPagesPlugin`; don't instantiate `HtmlWebpackPlugin` 3,151
times.** Same shape as the existing `SiteFilesPlugin`. Hook a late compilation
stage, read the emitted shell, stamp out variants by string substitution against
placeholder tokens in `src/index.html` (next to the existing `siteUrl`
parameter). Seconds, not minutes.

```ts
compilation.hooks.processAssets.tap(
	{ name: "StripPagesPlugin", stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE },
	(assets) => {
		const shell = assets["index.html"].source().toString();
		for (const strip of strips) {
			compilation.emitAsset(
				`${strip.year}/${strip.month}/${strip.day}/index.html`,
				new sources.RawSource(fillTemplate(shell, strip)),
			);
		}
	},
);
```

### 4. What goes in a strip page

Keep it lean — the chrome (nav, footer, layout) stays JS-rendered. What must be
in the file is what crawlers and the preload scanner need:

- **`og:image` pointing at that strip's file.** This is the real payoff. Social
  crawlers don't run JS, so per-strip previews are only achievable with files on
  disk. Currently every shared URL previews identically.
- `<title>`, `og:title`, `og:description` (the transcript), canonical URL.
- **The real `<img>`.** The filename is known at build time, so the preload
  scanner finds it while parsing the head — before `index.js` is downloaded, let
  alone executed. LCP becomes independent of the bundle.
- The transcript as markup.
- **That strip's record inlined** as `<script type="application/json">`. A few
  hundred bytes, and it kills the spinner on 3,150 of 3,200 pages.

Estimated ~3–4K per file, so ~12MB total rather than 64MB.

### 5. Data loading

- **Defer the `comics.json` fetch on strip pages.** If it kicks off at module
  load it competes with the comic image for bandwidth on exactly the pages that
  don't need it. Start after first paint, or on first search-implying
  interaction.
- Keep it eager on the search page; consider `<link rel="preload" as="fetch">`
  there, now that the head can vary by page type.
- If it turns out large: split a lightweight search index (dates, tokens, ids)
  from the full transcript records. Search runs on the small file, records load
  on demand. **Only if the numbers justify it.**

### 6. CSS sizing

Extract first, then look at the split. Order of preference:

1. If the stylesheet is small (a few KB), inline the whole thing per page.
2. If not, extract a critical subset **once** from a representative strip page,
   hardcode that block into all of them, and `<link>` the full sheet.

At 3,151 pages, inlining a 15K sheet is ~47MB of duplication; a 3K critical
block is ~9MB and still removes the round trip. Since the pages are structurally
identical, one hand-picked subset genuinely covers all of them.

### 7. Boot behaviour

Once pages ship real content, the router boots into a DOM that is already
correct and may re-render over it.

- Start with: let it re-render, but **suppress the entrance transition on the
  first render** and reset scroll. The image won't refetch (same URL, cached),
  so this is cheap.
- Only if flicker is visible: adopt the existing DOM instead — boot with
  `currentRoute` set and listeners attached but no render. Easy with delegated
  event handling at the document root, harder with per-node listeners.

### 8. Base path (subpath deployment)

The site may be served from a subpath — `https://me.github.io/foo` — rather than
the root of a custom domain. Design this in now; retrofitting means touching
every link and asset reference.

Derive it from the `SITE_URL` the build already reads, so there's one variable
rather than two:

```ts
const siteUrl = loadSiteConfig()?.siteUrl;
// "https://me.github.io/foo" -> "/foo/"   |   unset or root -> "/"
const basePath = siteUrl ? new URL(siteUrl).pathname.replace(/\/?$/, "/") : "/";
```

It threads through five places:

1. **`publicPath`** — set to `basePath`.
2. **The router** — strip before matching, prefix when pushing. Webpack exposes
   `publicPath` at runtime, so no second injection point is needed:

   ```ts
   const base = __webpack_public_path__; // "/foo/"
   const route = location.pathname.slice(base.length - 1) || "/";
   history.pushState(null, "", base.replace(/\/$/, "") + route);
   ```

3. **Every generated `href`** — without the prefix, clicks land outside the
   mount point.
4. **Canonical, `og:url`, `og:image`, `sitemap.xml`** — need the full absolute
   URL including the subpath. Already true if `SITE_URL` carries it.
5. **`CNAME`** — do _not_ emit it when the target is `*.github.io`. The build
   currently writes it whenever `SITE_URL` is set, which is wrong for a project
   site.

No special handling needed for `404.html` (GitHub Pages serves `/foo/404.html`
for unknown paths under `/foo`) or for `StripPagesPlugin` (`emitAsset` paths are
relative to the output directory).

**Tradeoff:** this makes the build artifact mount-specific. See the last row of
"Considered and set aside" for the fully-relocatable alternative.

---

## Do not do

**Don't have `about/index.html` redirect to `#/about`.** It puts the hash back in
the URL bar, which is the thing being removed.

**Don't reach for the `404.html` SPA fallback as the primary mechanism.** It's a
workaround for not having files. You'll have files. Keep it only for genuinely
unknown paths.

**Don't inline the JS at this page count.** 410MB, and nothing is cacheable
across pages.

**Don't content-hash asset filenames here.** Total churn on every deploy.

**Don't run Beasties / per-page critical CSS.** It would analyze 3,150
structurally identical documents and reach the same answer each time — build
cost plus a state-dependent-styles bug class for no gain. Extract once by hand
instead. (Beasties, the maintained fork of the archived Critters, is the right
tool if this ever _is_ the problem — it's designed for prerendered SPAs.)

**Don't inline a critical CSS subset without lazy-loading the rest.** Client-side
navigation would land on a page whose styles were never loaded.

**Don't use a headless browser to prerender 3,151 pages.** Tens of minutes.
String templating from the emitted shell is seconds.

**Don't switch to Turbo-style HTML swapping.** That pattern is for people without
a client renderer. You have one; warm navigation should keep using it.

**Don't code-split JS per route.** It would let each page preload only its own
chunk, but warm navigation would then wait on a chunk fetch — precisely the
snappiness being preserved.

**Don't commit `dist/` or use a `gh-pages` branch.** ~3,151 fully-churning files
per build will bloat history fast. Deploy the artifact from Actions.

**Don't put the 3,151 strips in `sitemap.xml`.** It only feeds crawlers, which
isn't a goal here. Link previews come from `og:` tags and need no sitemap.

**Don't hardcode `/` as the base path.** The site may be served from
`/foo` — see §8.

**Don't expect SEO from 3,150 near-duplicate pages.** Search engines classify
that as thin content and will index few of them. Link previews work regardless —
that's the goal being bought.

**Don't adopt `experiments.css` yet.** Native webpack CSS is real and becomes the
default in webpack 6, and since 5.109 the option defaults to `'auto'` (suppressed
by an existing `.css` rule). Still experimental. Revisit at v6.

**Don't worry about HTML duplication on disk.** ~12MB against Neocities' 1GB free
tier. Deploy churn was the real concern, and unhashed filenames address it.

---

## Measure before deciding

- **CSS vs JS split of the 129K.** `ls -la dist/` after extraction. Determines
  whether inlining the whole sheet is viable.
- **`comics.json` size**, and whether the host is compressing it:
  `curl -sI -H 'Accept-Encoding: gzip, br' <url> | grep -i content-encoding`
- **What's in the bundle.** If it's ~110K of JS for a hand-rolled site, there may
  be a dependency worth dropping — likely a bigger win than anything above.

---

## Sequencing

**v1 — get the hashes out.** Router to pathname/pushState. Clone the existing
inlined `index.html` to every route plus `404.html` and `not_found.html`. All
files byte-identical, so there's no prerendered content for the router to
conflict with and the boot problem doesn't exist yet.

```bash
for p in $ROUTES; do mkdir -p "dist/$p" && cp dist/index.html "dist/$p/index.html"; done
```

Fix `publicPath` here — it's needed the moment anything lives in a subdirectory.
Thread the base path through at the same time (§8); retrofitting it later means
touching every link and asset reference.

**v2 — make the pages real.** Drop `HtmlInlineScriptPlugin`, extract CSS, add
`StripPagesPlugin`. Per-strip meta tags, `<img>`, transcript, inlined record.
Defer the corpus fetch. This is where the og:image and LCP wins land.

**v3 — only if measurement says so.** Critical CSS subset, split search index,
bundle diet.

---

## Considered and set aside

| Option                                                                   | Why not                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keep hash routing                                                        | The thing being removed                                                                                                                                                                                                                                                                                                                                                                      |
| Cross-document view transitions (`@view-transition`)                     | Would delete the router entirely, but loses client state, prefetch, and interruptible transitions. Chromium 126+, Safari 18.2+; Firefox reports conflict — check caniuse                                                                                                                                                                                                                     |
| Turbo / HTML-swap navigation                                             | For apps without a client renderer                                                                                                                                                                                                                                                                                                                                                           |
| Two representations (HTML + `.data` sidecars, React Router / Next style) | Saves warm-nav bandwidth, costs the hydration-mismatch bug class. Not worth it at this size                                                                                                                                                                                                                                                                                                  |
| Per-page critical CSS                                                    | Pages are identical; extract once instead                                                                                                                                                                                                                                                                                                                                                    |
| PurgeCSS                                                                 | Different problem (globally dead rules). Worth it only if the stylesheet has accumulated cruft                                                                                                                                                                                                                                                                                               |
| SPA fallback for the long tail instead of files                          | Viable, but forfeits per-strip og:image — the main reason to do this                                                                                                                                                                                                                                                                                                                         |
| Fully relocatable build (depth-relative asset URLs + `<base href>`)      | One artifact that drops anywhere with zero config. `StripPagesPlugin` knows each file's depth so it can emit `../../../index.js`, and the router reads `document.baseURI` to derive its own mount point. But `<base>` breaks in-page `#anchor` links, and `pushState` wants absolute paths anyway. More machinery than a build variable is worth unless relocatability is a hard requirement |
