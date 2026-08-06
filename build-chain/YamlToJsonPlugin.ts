import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { loadCollectionData } from "./collectionPages";
import { exportComicDetails } from "./exportComicDetails";
import { exportComicsJson } from "./exportComicsJson";
import { generateCollectionIndex } from "./generateCollectionIndex";

const PLUGIN_NAME = "YamlToJsonPlugin";

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
					const collectionData = loadCollectionData(projectDir);

					const comicsJson = exportComicsJson(projectDir);
					compilation.emitAsset("comics.json", new sources.RawSource(comicsJson));

					const collectionIndexJson = generateCollectionIndex(collectionData);
					compilation.emitAsset("collection-index.json", new sources.RawSource(collectionIndexJson));

					for (const [name, json] of exportComicDetails(projectDir, collectionData)) {
						compilation.emitAsset(name, new sources.RawSource(json));
					}
				},
			);
		});
	}
}

export default YamlToJsonPlugin;
