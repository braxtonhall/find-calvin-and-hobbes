import fs from "fs";
import os from "os";
import path from "path";

/** A theme for a test that is not about one, since `config.yaml` must have one. */
export const SAMPLE_THEME = `theme:
  background: "#ffffff"
  text: "#000000"
  textMuted: "#777777"
  main: "#3366cc"
  bookmark: "#cc3333"
  neutral: "#dddddd"
  selected: "#000000"
  hover: "#ffcc00"
  hoverRow: "#fff8e0"
  match: "#ffff66"
  matchApproximate: "#ffffcc"
`;

/** A strip's shape for a test that is not about one, since `config.yaml` must give a daily's. */
export const SAMPLE_ASPECT_RATIO = `aspectRatio:
  daily: 3
`;

/**
 * The archive's optional parts, all turned off, for a test that is not about them, since
 * `config.yaml` must say. A part the test gives keeps its own.
 */
export const SAMPLE_PARTS = ["arcs", "reruns", "compounds", "characters"];

/**
 * A project holding just this configuration, for `loadPageConfig` to read — with `SAMPLE_THEME`,
 * `SAMPLE_ASPECT_RATIO` and `SAMPLE_PARTS` added where it gives none of its own — and, beside it,
 * `files`, by their names, for it to import. `run` is given the configuration's path, and the folder.
 *
 * Named `site.yaml`, not `config.yaml`, so that nothing can find it by its name.
 */
export function withConfig<T>(
	contents: string,
	run: (config: string, projectDir: string) => T,
	files: Record<string, string> = {},
): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-"));
	try {
		const themed = /^theme:/m.test(contents) ? contents : `${contents}\n${SAMPLE_THEME}`;
		const shaped = /^aspectRatio:/m.test(themed) ? themed : `${themed}\n${SAMPLE_ASPECT_RATIO}`;
		const parted = SAMPLE_PARTS.reduce(
			(config, part) => (new RegExp(`^${part}:`, "m").test(config) ? config : `${config}\n${part}: false\n`),
			shaped,
		);
		const config = path.join(projectDir, "site.yaml");
		fs.writeFileSync(config, parted);
		for (const [name, text] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(projectDir, name)), { recursive: true });
			fs.writeFileSync(path.join(projectDir, name), text);
		}
		return run(config, projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}
