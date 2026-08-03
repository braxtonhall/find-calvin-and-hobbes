import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
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

					const comicsJson = exportComicsJson(projectDir);
					compilation.emitAsset("comics.json", new sources.RawSource(comicsJson));

					const collectionIndexJson = generateCollectionIndex(projectDir);
					compilation.emitAsset("collection-index.json", new sources.RawSource(collectionIndexJson));
				},
			);
		});
	}
}

export default YamlToJsonPlugin;
