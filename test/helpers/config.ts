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

/** A GIF of this size, all the build reads of one: the head of the file, where its size is. */
export function sampleGif(width: number, height: number): Buffer {
	const head = Buffer.from("GIF89a\0\0\0\0", "latin1");
	head.writeUInt16LE(width, 6);
	head.writeUInt16LE(height, 8);
	return head;
}

/**
 * The archive's optional parts, all turned off, for a test that is not about them, since
 * `config.yaml` must say. A part the test gives keeps its own.
 */
export const SAMPLE_PARTS = ["arcs", "reruns", "compounds", "characters"];

/**
 * A project holding just this configuration, for `loadPageConfig` to read — with `SAMPLE_THEME` and
 * `SAMPLE_PARTS` added where it gives none of its own — and, beside it, `files`, by their names, for
 * it to import. `run` is given the configuration's path, and the folder.
 *
 * Named `site.yaml`, not `config.yaml`, so that nothing can find it by its name.
 */
export function withConfig<T>(
	contents: string,
	run: (config: string, projectDir: string) => T,
	files: Record<string, string | Buffer> = {},
): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-"));
	try {
		const themed = /^theme:/m.test(contents) ? contents : `${contents}\n${SAMPLE_THEME}`;
		const parted = SAMPLE_PARTS.reduce(
			(config, part) => (new RegExp(`^${part}:`, "m").test(config) ? config : `${config}\n${part}: false\n`),
			themed,
		);
		const config = path.join(projectDir, "site.yaml");
		fs.writeFileSync(config, parted);
		for (const [name, contents] of Object.entries(files)) {
			fs.mkdirSync(path.dirname(path.join(projectDir, name)), { recursive: true });
			fs.writeFileSync(path.join(projectDir, name), contents);
		}
		return run(config, projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}
