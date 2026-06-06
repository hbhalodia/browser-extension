/**
 * Build config layered on top of @wordpress/scripts defaults.
 *
 * Two differences from a standard WP plugin build:
 *
 *   1. Dual entry points — the popup bundle that ships with the extension,
 *      and a separate `preview` bundle used by popup/preview.html for
 *      local visual iteration of every popup state.
 *
 *   2. No dependency extraction — @wordpress/scripts assumes @wordpress/*
 *      packages are available on the `wp.*` global at runtime (true inside
 *      wp-admin, false in a browser extension). We strip the
 *      DependencyExtractionWebpackPlugin so those packages get bundled
 *      into the popup itself.
 *
 * Output stays in dist/ — popup.html, the Safari Xcode project, and the
 * packaging scripts all reference that path.
 */
const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

module.exports = {
	...defaultConfig,
	entry: {
		popup: path.resolve(__dirname, 'src/popup/index.js'),
		preview: path.resolve(__dirname, 'src/popup/preview.js'),
	},
	output: {
		...defaultConfig.output,
		path: path.resolve(__dirname, 'dist'),
		filename: '[name].js',
	},
	// The dependency-extraction plugin (a transitive of @wordpress/scripts,
	// not directly require-able here) is matched by constructor name.
	plugins: defaultConfig.plugins.filter(
		(plugin) => plugin.constructor.name !== 'DependencyExtractionWebpackPlugin',
	),
};
