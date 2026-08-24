declare const __SITE_BASE_PATH__: string;

/** The webpack build injects the mount point so nested static pages can address shared assets. */
export function basePath(): string {
	return typeof __SITE_BASE_PATH__ === "string" ? __SITE_BASE_PATH__ : "/";
}

export function assetUrl(path: string): string {
	return basePath() + path.replace(/^\/+/, "");
}

export function routeUrl(path: string): string {
	const normalized = path.startsWith("/") ? path : `/${path}`;
	return (
		basePath().replace(/\/$/, "") + (normalized === "/" ? "/" : normalized + (normalized.endsWith("/") ? "" : "/"))
	);
}
