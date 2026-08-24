# Prerender Implementation Retrospective

This document records what I learned while implementing the prerender plan in this repository. It
is intentionally candid. The implementation eventually built successfully, but several problems
came from mixing three different concerns too early:

- Static-host URL layout
- Client-side application boot and hydration
- Reusing browser renderers from the build process

The next attempt should establish those boundaries before changing the URL scheme.

## What The Application Actually Needed

The app is not simply a blank SPA waiting for one data request. It has several data phases:

1. Calendar dates are known synchronously from constants.
2. A prerendered route may contain enough data to display itself.
3. The full comic corpus is needed for search, adjacent navigation, and complete collection
   highlighting.
4. Collection metadata is needed for collection pages and appearance sections.
5. Descriptions arrive from a separate data file.
6. Bookmarks arrive asynchronously from IndexedDB.

Treating all of that as one boolean, `dataLoaded`, caused most of the timing bugs. A better model
would explicitly distinguish at least:

- `initialMarkupAvailable`
- `comicCorpusLoaded`
- `collectionIndexLoaded`
- `descriptionsLoaded`

The router should decide whether to show a spinner based on the capability required by the target
route, not merely on whether any initial data exists.

## What Worked

### Static route generation

An asset-stage webpack plugin can efficiently emit thousands of route files without launching a
browser per page. The final build emitted approximately 3,150 comic pages plus collection, credits,
search, and fallback pages.

The correct shape is:

```text
comics/1985/11/18/index.html
collection/essential/index.html
credits/index.html
404.html
not_found.html
```

Using `path/index.html` is important for static-host portability. Flat files such as
`1985-11-18.html` would require host-specific rewrite behavior.

### External assets

Inlining the JavaScript into every generated HTML file made the v1 artifact enormous. Extracting
CSS and externalizing the JS reduced the repeated page shell substantially. The stylesheet is now
discovered from the document head, and moving the script injection to the body made CSS discovery
unambiguously earlier.

### Shared pure HTML rendering

The useful reuse boundary was not the existing `renderDetail()` function itself. That function also
mutates the DOM, reads global state, and attaches browser event handlers. The reusable boundary is a
pure function that returns HTML from an explicit context:

```text
renderDetailHtml(context) -> string
```

The browser renderer can put that string into the DOM and attach handlers. The build plugin can call
the same function without a DOM. Collection and credits pages need the same treatment. Any page
whose build template is independently hand-written will eventually drift from the client version.

## Major Pitfalls

### 1. The URL shape was changed inconsistently

The first route implementation generated `/1985/11/18/`, while the desired contract was later
clarified as `/comics/1985/11/18/`. This required changing all of the following together:

- `parseRoute()`
- `buildComicHash()`
- Legacy hash migration
- Build output paths
- Previous/next links
- Canonical URLs
- Copy-link values

The lesson is to define one route table first and derive every URL from it. Do not let the build
plugin and browser router each invent a path format.

### 2. Relative URLs fail from nested pages

Paths such as `assets/book.jpg`, `comics.json`, and `index.js` resolve relative to the current HTML
directory. From `/collection/essential/`, `assets/book.jpg` becomes an incorrect nested path.

There are two valid strategies:

- Emit absolute-from-mount paths such as `/assets/book.jpg`.
- Emit depth-relative paths such as `../../assets/book.jpg`.

Absolute-from-mount paths are simpler, but require the deployment base path to be known. Every asset,
JSON fetch, generated link, canonical URL, and image URL must use the same base-path utility. Fixing
only webpack's `publicPath` is not enough because JSON data contains its own image paths and runtime
fetches have their own URL resolution.

### 3. Initial prerendered HTML and client rendering fought each other

The initial detail page already contained text, links, collection covers, and navigation. The client
then re-rendered it with only the inline comic record. This caused:

- Collection sections to disappear
- Images to flicker as their DOM nodes were replaced
- Previous/next buttons to be disabled because only one comic was in memory
- Description skeletons to appear over already-known descriptions

The eventual mitigation was to preserve prerendered detail and collection DOM on first boot, then
update only application state and the grid once the full corpus loaded. This is workable, but it is
more complicated than an explicit hydration/adoption design.

The next design should decide up front between:

- Adopt existing server markup and attach behavior to it, or
- Re-render it once, with a complete initial model and no visible transition.

Doing half of both creates flicker and state races.

### 4. `dataLoaded` was overloaded

Initially, the presence of an inline comic record caused `state.dataLoaded` to become true. That made
a click to another comic render immediately with a partial corpus and show `No comics found`.

Conversely, leaving `dataLoaded` false made the router replace useful prerendered content with a
spinner on the initial route. The fix was an exemption for the first prerendered route, but that
exemption had to be consumed at exactly the right time for credits, collections, and details.

This is the clearest signal that one flag was the wrong abstraction.

### 5. The landing page was not the only first-paint concern

The original app waited for IndexedDB bookmarks before building the grid and handling the route. A
slow or unavailable IndexedDB implementation delayed startup even though bookmarks are optional.

The first render should happen first. Optional bookmark state should load afterward and update the
grid incrementally.

### 6. Multiple `active` views produced bad initial output

The source shell starts with the landing view active. Prerendering detail or credits content without
removing that class left both landing and destination views active in the emitted HTML. Before
JavaScript booted, the views competed visually and could make the page appear blank or incorrect.

Every generated document must have exactly one active view before the script runs.

### 7. Build renderers drifted from real renderers

The first collection and credits build templates were shortened versions of the browser templates.
That caused visible regressions:

- Collection notes such as forewords disappeared.
- Publication dates became `4/1988` instead of `April 1988`.
- Comic summaries lost `strips in order`.
- Credits lost most sections and the back button.
- Read/license links initially lost their external-link icons.

This directly violated the requirement to reuse the real HTML rendering code. The correct approach is
to extract the browser renderer's HTML logic before writing any build template, then make both call
that extracted function.

### 8. Descriptions were already build data, but were not used

The build already emits `descriptions.json`. Passing `null` to the prerender renderer made every
text-only comic emit a description skeleton even though the description was available at build time.

The build plugin should consume the same generated description map that the browser fetches. The
image/description rule should be explicit:

- If the comic has an image, prerender the image.
- Otherwise, prerender its description when one exists.
- Never emit a loading skeleton when the build already knows the answer.

### 9. Collection highlighting required two different data sources

Collection metadata includes date ranges, so collection membership can be computed before
`comics.json` arrives. The original code only iterated `state.comicsByDate`, which was empty during
initial boot, so the entire grid was greyed out.

The interim solution uses known calendar dates while the corpus is absent, then actual comic dates
afterward. This should be represented as a deliberate capability in the data model rather than an
implicit `Map.size === 0` test.

### 10. CSS extraction has development consequences

Production already used a stylesheet link, but development used `style-loader`, which injects CSS
after JavaScript executes. That made `yarn watch` show an unstyled document briefly.

The development build was changed to extract CSS too. This improves first paint but sacrifices some
of the normal style-loader HMR experience. That tradeoff should be explicit in the build config.

### 11. Legacy hash migration belongs before history initialization

Old links such as `/#/comic/1985-11-18` need to become clean paths before the initial history entry is
recorded. Otherwise the old hash can be treated as an in-app route, and browser back behavior becomes
confusing.

The migration must handle at least:

- `#/` -> `/`
- `#/comic/YYYY-MM-DD` -> `/comics/YYYY/MM/DD/`
- `#/search?...` -> `/search?...`
- `#/collection/id` -> `/collection/id/`
- `#/credits` -> `/credits/`

It should leave unrelated fragments such as `#main` alone.

### 12. CNAME and subpath deployment assumptions were easy to conflate

Allowing a path in `SITE_URL` is necessary for project-site deployments, but CNAME emission is a
separate concern. The request here was to always emit CNAME when configured, so that behavior should
not be silently changed while solving base paths.

The build configuration needs separate concepts for:

- Public absolute site URL
- Public deployment base path
- CNAME contents

## Things I Missed

### Search is not a finite prerender route

`/search?q=...` has an unbounded query space. It is possible to prerender the search shell, but not
every result page. The search route must remain a client-rendered route backed by the corpus fetch.
Only finite pages such as landing, credits, collections, and comics can have complete generated
content.

### Inline JSON must be script-safe

Inline JSON placed inside a `<script>` tag must escape at least `<` so transcript content cannot close
the script with `</script>`. The current implementation should be hardened with a JSON-for-script
serializer before being considered production-safe.

### First-load browser testing was missing

The unit suite does not exercise:

- Browser first paint
- CSS request ordering
- Direct nested URL loads
- `history.pushState` and back/forward behavior
- DOM preservation during hydration
- Images loading from nested pages
- A click during an in-flight corpus fetch

A small browser smoke suite would have found several regressions earlier than manual iteration.

### Generated pages need output-level assertions

Compilation success alone did not prove that the generated HTML was correct. The build can succeed
while:

- The wrong view is active
- A route has the wrong directory prefix
- A relative image path is broken
- A description skeleton is present unnecessarily
- A page has incomplete content

The build should parse representative generated files and assert their route-specific content.

### The existing test command has a shell/glob issue

`yarn test` currently passes the literal `test/**/*.test.ts` to Node in this environment, so it
reports that no test file exists. Running `node --import tsx --test test/*.test.ts` executes the suite
successfully. The package script should be fixed independently so the canonical test command is
trustworthy.

## Recommended Design For The Next Attempt

### 1. Define a route manifest

Create one typed route manifest used by both build and browser code:

```text
landing: /
credits: /credits/
collection: /collection/:id/
comic: /comics/:year/:month/:day/
search: /search/?...
```

Use it to generate paths, parse paths, create links, and choose output filenames.

### 2. Define explicit data capabilities

Replace the single loading boolean with route requirements:

```text
landing: calendar dates only
credits: no archive data
collection: collection index, then corpus for highlighting
comic: initial comic record, then corpus for navigation
search: complete corpus
```

The router can then show initial content, preserve initial content, or show a spinner based on the
target's actual requirement.

### 3. Extract pure renderers before prerender generation

Move all HTML-producing logic into DOM-free modules first. Browser view modules should become small
adapters that:

- Build a render context from application state
- Set `innerHTML`
- Attach listeners
- Perform browser-only progressive patches

The build plugin should call those same HTML functions, never a second hand-written template.

### 4. Centralize URL resolution

Have one URL module with separate functions for:

- `routeHref()`
- `assetHref()`
- `absoluteCanonicalUrl()`
- `fetchAssetUrl()`

Do not store unresolved relative image paths in data that is consumed by both nested HTML and the
browser.

### 5. Make prerendered page boot an explicit mode

Put a small typed bootstrap payload in the page and expose a clear mode:

```text
window.__INITIAL_PAGE__ = {
  kind: "comic",
  route: ...,
  data: ...
}
```

The boot sequence should then be:

1. Read initial payload.
2. Render or adopt initial markup.
3. Attach handlers.
4. Start optional/full data fetches.
5. Patch state without replacing stable image/content DOM unnecessarily.

### 6. Add an output and browser test matrix

At minimum, test these paths both directly and through warm navigation:

- `/`
- `/credits/`
- `/collection/essential/`
- `/comics/1985/11/18/`
- `/search/?q=snow`
- `/404/unknown/`
- `/#/comic/1985-11-18`

For each, verify title, active view, primary content, asset URLs, spinner behavior, and final URL.

## Bottom Line

The core prerender strategy is viable. The difficult part is not emitting 3,000 HTML files. The
difficult part is making server HTML, partial client data, full client data, and browser event
behavior agree without replacing useful DOM.

The highest-value changes for a second attempt are:

1. Model data phases explicitly.
2. Define the route manifest before changing links.
3. Extract pure renderers before writing build plugins.
4. Test direct browser loads, not just compilation.
5. Treat URL resolution and inline-data safety as first-class build concerns.
