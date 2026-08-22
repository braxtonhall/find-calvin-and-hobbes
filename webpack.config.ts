import path from "path";
import { Configuration, WebpackOptionsNormalized } from "webpack";
import HtmlWebpackPlugin from "html-webpack-plugin";
import HtmlInlineScriptPlugin from "html-inline-script-webpack-plugin";
import CopyWebpackPlugin from "copy-webpack-plugin";
import SiteFilesPlugin from "./build-chain/SiteFilesPlugin";
import { loadSiteConfig } from "./build-chain/siteConfig";
import YamlToJsonPlugin from "./build-chain/YamlToJsonPlugin";

const srcDir = path.join(__dirname, "src");
const staticDir = path.join(__dirname, "static");
const outputDir = path.join(__dirname, "dist");

module.exports = (_env: unknown, options: WebpackOptionsNormalized): Configuration => ({
	devtool: options.mode !== "production" ? "source-map" : undefined,
	performance: {
		hints: false,
	},
	entry: {
		index: path.join(srcDir, "index"),
	},
	output: {
		publicPath: "",
		path: path.join(outputDir),
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
				use: ["style-loader", "css-loader"],
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".json", ".js"],
	},
	plugins: [
		new YamlToJsonPlugin(),
		new CopyWebpackPlugin({
			patterns: [{ from: "assets", to: "assets", context: path.join(__dirname) }],
		}),
		new HtmlWebpackPlugin({
			filename: "index.html",
			template: path.join(srcDir, "index.html"),
			chunks: ["index"],
			cache: false,
			templateParameters: () => ({ siteUrl: loadSiteConfig()?.siteUrl ?? "" }),
		}),
		new HtmlInlineScriptPlugin({
			scriptMatchPattern: [/index/],
		}),
		new SiteFilesPlugin(staticDir),
	],
});
