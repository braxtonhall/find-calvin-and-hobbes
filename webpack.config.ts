import path from "path";
import webpack, { Configuration, WebpackOptionsNormalized } from "webpack";
import MiniCssExtractPlugin from "mini-css-extract-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import SiteFilesPlugin from "./build-chain/SiteFilesPlugin";
import YamlToJsonPlugin from "./build-chain/YamlToJsonPlugin";
import PagesPlugin from "./build-chain/PagesPlugin";
import { loadSiteConfig } from "./build-chain/siteConfig";

const srcDir = path.join(__dirname, "src");
const staticDir = path.join(__dirname, "static");
const outputDir = path.join(__dirname, "dist");

// Read once, here: the bundle is compiled with the mount as a literal, so a change to it needs a
// fresh `webpack` run anyway.
const basePath = loadSiteConfig()?.basePath ?? "/";

module.exports = (_env: unknown, options: WebpackOptionsNormalized): Configuration => ({
	devtool: options.mode !== "production" ? "source-map" : undefined,
	performance: {
		hints: false,
	},
	entry: {
		index: path.join(srcDir, "index"),
	},
	output: {
		// Every page lives in its own directory, so everything it references is named from the mount.
		publicPath: basePath,
		path: path.join(outputDir),
		// Unhashed on purpose: a hashed name would put a new script tag in all three thousand pages
		// on every change to the script, and the hosts this deploys to set no cache headers anyway.
		filename: "[name].js",
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				exclude: /node_modules/,
				use: {
					loader: "ts-loader",
				},
			},
			{
				test: /\.css$/,
				use: [MiniCssExtractPlugin.loader, "css-loader"],
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".json", ".js"],
	},
	plugins: [
		// The mount, for the app's addresses; see `src/base-path.ts`.
		new webpack.DefinePlugin({ __BASE_PATH__: JSON.stringify(basePath) }),
		new YamlToJsonPlugin(),
		new CopyWebpackPlugin({
			patterns: [{ from: "assets", to: "assets", context: path.join(__dirname) }],
		}),
		// A stylesheet of its own rather than one injected by the script: a prerendered page has
		// content to paint before the script runs, and it should be painted styled.
		new MiniCssExtractPlugin({ filename: "[name].css" }),
		new PagesPlugin(path.join(srcDir, "index.html")),
		new SiteFilesPlugin(staticDir),
	],
});
