import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { loadCollectionData } from "./collectionPages";
import { exportComicsJson } from "./exportComicsJson";
import { exportDescriptions } from "./exportDescriptions";
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
