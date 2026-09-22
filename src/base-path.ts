/**
 * Where the site is mounted: `/`, or `/some/prefix/` when `SITE_URL` has a path, as a GitHub
 * project page does. `routes.ts` spells every path from the mount, so the mount is added on the
 * way out — a link's href, a `history` entry, a fetch — and taken off on the way in, from the
 * address bar or a clicked link. Always begins and ends with a slash.
 *
 * The environment defines `__BASE_PATH__`: webpack's `DefinePlugin` writes it into the bundle as
 * a literal, and `PagesPlugin` sets it as a global in the build process before writing a page.
 * Where neither has — the tests — the site is at the root.
 */
declare const __BASE_PATH__: string | undefined;

export function basePath(): string {
	return typeof __BASE_PATH__ === "string" ? __BASE_PATH__ : "/";
}

/** A path from the mount (`/credits`, `/search?q=…`) as the address bar spells it (`/prefix/credits`). */
export function addressOf(path: string): string {
	return basePath().slice(0, -1) + path;
}

/** The path from the mount that an address names, or `null` when the address is outside the mount. */
export function pathOf(pathname: string): string | null {
	const base = basePath();
	if (base === "/") return pathname;
	if (pathname === base.slice(0, -1)) return "/";
	return pathname.startsWith(base) ? pathname.slice(base.length - 1) : null;
}
