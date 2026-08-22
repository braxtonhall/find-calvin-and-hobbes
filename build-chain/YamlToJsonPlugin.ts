import fs from "fs";
import path from "path";
import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { loadCollectionData } from "./collectionPages";
import { exportComicsJson } from "./exportComicsJson";
import { exportDescriptions } from "./exportDescriptions";
import { generateCollectionIndex } from "./generateCollectionIndex";

const PLUGIN_NAME = "YamlToJsonPlugin";

/**
 * Tells webpack which data files this plugin read, so `--watch` rebuilds when they change.
 * The collections directory itself is a dependency too, so added and removed files are noticed.
 */
function watchDataFiles(compilation: Compilation, projectDir: string): void {
	const collectionsDir = path.join(projectDir, "collections");
	compilation.fileDependencies.add(path.join(projectDir, "comics.yaml"));
	compilation.contextDependencies.add(collectionsDir);
	for (const file of fs.readdirSync(collectionsDir)) {
		if (file.endsWith(".yaml")) {
			compilation.fileDependencies.add(path.join(collectionsDir, file));
		}
	}
}

class YamlToJsonPlugin {
	apply(compiler: Compiler): void {
		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
			compilation.hooks.processAssets.tap(
				{
					name: PLUGIN_NAME,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				() => {
					const projectDir = compiler.context;
					watchDataFiles(compilation, projectDir);
					const collectionData = loadCollectionData(projectDir);

					const comicsJson = exportComicsJson(projectDir, collectionData);
					compilation.emitAsset("comics.json", new sources.RawSource(comicsJson));

					const collectionIndexJson = generateCollectionIndex(collectionData);
					compilation.emitAsset("collection-index.json", new sources.RawSource(collectionIndexJson));

					const descriptionsJson = exportDescriptions(projectDir);
					compilation.emitAsset("descriptions.json", new sources.RawSource(descriptionsJson));
				},
			);
		});
	}
}

export default YamlToJsonPlugin;
