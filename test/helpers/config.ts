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

/** No characters, for a test that is not about them, since `config.yaml` must say. */
export const SAMPLE_CHARACTERS = `characters: false
`;

/**
 * A project holding just this `config.yaml`, for `loadPageConfig` to read — with `SAMPLE_THEME`,
 * `SAMPLE_ASPECT_RATIO` and `SAMPLE_CHARACTERS` added where it gives none of its own.
 */
export function withConfig<T>(contents: string, run: (projectDir: string) => T): T {
	const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-"));
	try {
		const themed = /^theme:/m.test(contents) ? contents : `${contents}\n${SAMPLE_THEME}`;
		const shaped = /^aspectRatio:/m.test(themed) ? themed : `${themed}\n${SAMPLE_ASPECT_RATIO}`;
		const cast = /^characters:/m.test(shaped) ? shaped : `${shaped}\n${SAMPLE_CHARACTERS}`;
		fs.writeFileSync(path.join(projectDir, "config.yaml"), cast);
		return run(projectDir);
	} finally {
		fs.rmSync(projectDir, { recursive: true, force: true });
	}
}
