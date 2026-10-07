import fs from "fs";
import path from "path";
import type { Compiler, Compilation } from "webpack";
import { sources } from "webpack";
import { exportArcsJson, loadArcs } from "./arcs";
import { loadCharacters } from "./characters";
import { loadCollectionData } from "./collectionPages";
import { loadComicSource } from "./comicSource";
import { loadCreators } from "./creators";
import { COMIC_IMAGES_PATH, exportComicsJson } from "./exportComicsJson";
import { emitVariants } from "./imageVariants";
import { exportDescriptions } from "./exportDescriptions";
import { generateCollectionIndex } from "./generateCollectionIndex";
import { exportRerunsJson } from "./reruns";
import { setSiteData } from "./siteData";
import { watchConfigIn, loadComicImages, loadSiteConfig } from "./siteConfig";

const PLUGIN_NAME = "YamlToJsonPlugin";

class YamlToJsonPlugin {
	apply(compiler: Compiler): void {
		compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation: Compilation) => {
			compilation.hooks.processAssets.tapPromise(
				{
					name: PLUGIN_NAME,
					stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
				},
				async () => {
					// Which data files this read, so `--watch` rebuilds when they change: the configuration and
					// everything it imports, and the folders it imports the books from.
					watchConfigIn(compilation);
					const collectionData = loadCollectionData();
					// The strips' images, which are found by looking in their folder, there or not, so an image
					// dropped in or taken out is noticed.
					const comicImages = loadComicImages();
					if (comicImages) compilation.contextDependencies.add(comicImages);
					// The covers, each where the books link to it. Watched, since the configuration names them by path.
					for (const [published, file] of collectionData.files) {
						compilation.fileDependencies.add(file);
						compilation.emitAsset(published, new sources.RawSource(fs.readFileSync(file)));
					}
					// Each cover's and strip's smaller copies, beside it, for a page that shows it small. The
					// strips themselves are copied by `CopyWebpackPlugin`. See `src/srcset.ts`.
					const stripImages =
						comicImages && fs.existsSync(comicImages)
							? fs
									.readdirSync(comicImages)
									.map((name): [string, string] => [`${COMIC_IMAGES_PATH}${name}`, path.join(comicImages, name)])
							: [];
					await emitVariants(compilation, [...collectionData.files, ...stripImages]);
					// The images are named from the mount, so the app can show them from any page as they are.
					const basePath = loadSiteConfig()?.basePath ?? "/";

					const source = loadComicSource();
					const arcs = loadArcs(source, collectionData);
					const arcsJson = exportArcsJson(arcs);

					const characters = loadCharacters();
					const creators = loadCreators(source, basePath);
					// The portraits, each where the creators link to it, as the covers are.
					for (const [published, file] of creators.files) {
						compilation.fileDependencies.add(file);
						compilation.emitAsset(published, new sources.RawSource(fs.readFileSync(file)));
					}
					const comicsJson = exportComicsJson(collectionData, basePath, arcs, characters, creators.byStrip);
					compilation.emitAsset("comics.json", new sources.RawSource(comicsJson));

					// Not emitted: the app has these, and the characters and the creators, inside its script. See `bundledData.ts`.
					const rerunsJson = exportRerunsJson(source);
					const collectionIndexJson = generateCollectionIndex(collectionData, basePath);

					const descriptionsJson = exportDescriptions();
					compilation.emitAsset("descriptions.json", new sources.RawSource(descriptionsJson));

					setSiteData(compilation, {
						comics: JSON.parse(comicsJson),
						reruns: JSON.parse(rerunsJson),
						collectionIndex: JSON.parse(collectionIndexJson),
						descriptions: JSON.parse(descriptionsJson),
						arcs: JSON.parse(arcsJson),
						characters,
						creators: creators.creators,
					});
				},
			);
		});
	}
}

export default YamlToJsonPlugin;
