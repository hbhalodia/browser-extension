/**
 * Unit tests for lib/site-info.js merge helpers.
 *
 *   cd test && npm install && npm test
 */
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const siteInfoSrc = readFileSync(join(__dirname, '..', 'lib', 'site-info.js'), 'utf8');

const ctx = { globalThis };
new Function('globalThis', siteInfoSrc)(ctx);
const { mergePlugins, mergeTheme } = ctx.WPSiteInfo;

let failures = 0;

function assert(cond, msg) {
	if (!cond) {
		failures++;
		console.error('  FAIL:', msg);
	} else {
		console.log('  ok  :', msg);
	}
}

console.log('\n[20] mergePlugins — DOM slugs + REST active list');
{
	const rows = mergePlugins(
		['woocommerce', 'akismet'],
		[
			{ plugin: 'woocommerce/woocommerce.php', name: 'WooCommerce', status: 'active' },
			{ plugin: 'akismet/akismet.php', name: 'Akismet', status: 'inactive' },
			{ plugin: 'jetpack/jetpack.php', name: 'Jetpack', status: 'active' },
		],
		['wp/v2'],
	);
	assert(rows.length === 2, `2 active rows (got ${rows.length})`);
	assert(rows.some((r) => r.slug === 'woocommerce' && r.name === 'WooCommerce'),
		'woocommerce row from REST');
	assert(rows.some((r) => r.slug === 'jetpack' && r.name === 'Jetpack'),
		'jetpack row from REST');
	assert(!rows.some((r) => r.slug === 'akismet'),
		'inactive akismet dropped');
}

console.log('\n[21] mergePlugins — namespace hints without DOM overlap');
{
	const rows = mergePlugins([], null, ['wp/v2', 'yoast/v1']);
	assert(rows.length === 1 && rows[0].slug === 'yoast',
		'yoast slug inferred from namespace');
}

console.log('\n[22] mergeTheme — REST overrides slug label');
{
	const theme = mergeTheme('twentytwentyfive', {
		stylesheet: 'twentytwentyfive',
		name: { rendered: 'Twenty Twenty-Five' },
		version: '1.5',
	});
	assert(theme.name === 'Twenty Twenty-Five', 'rendered name used');
	assert(theme.version === '1.5', 'version surfaced');
}

console.log('\n[23] mergePlugins — plugin URI scheme validation');
{
	const restPlugins = [
		{ plugin: 'good/good.php',  name: 'Good',   status: 'active', plugin_uri: 'https://example.com/plugin' },
		{ plugin: 'http-ok/h.php',  name: 'HTTPOK', status: 'active', plugin_uri: 'http://legacy.example/plugin' },
		{ plugin: 'evil/evil.php',  name: 'Evil',   status: 'active', plugin_uri: 'javascript:alert(1)' },
		{ plugin: 'datauri/d.php',  name: 'Data',   status: 'active', plugin_uri: 'data:text/html,<h1>x</h1>' },
		{ plugin: 'malformed/m.php',name: 'Mal',    status: 'active', plugin_uri: 'not-a-url' },
		{ plugin: 'empty/e.php',    name: 'Empty',  status: 'active', plugin_uri: '' },
	];
	const rows = mergePlugins([], restPlugins, null);
	const byName = Object.fromEntries(rows.map((r) => [r.name, r]));
	assert(byName.Good.pluginUri === 'https://example.com/plugin',  'https plugin URI kept');
	assert(byName.HTTPOK.pluginUri === 'http://legacy.example/plugin', 'http plugin URI kept');
	assert(byName.Evil.pluginUri === null,   'javascript: scheme rejected');
	assert(byName.Data.pluginUri === null,   'data: scheme rejected');
	assert(byName.Mal.pluginUri === null,    'malformed URL rejected');
	assert(byName.Empty.pluginUri === null,  'empty string yields null');
}

console.log(`\n${failures === 0 ? 'Site-info tests passed.' : failures + ' failure(s).'}`);
process.exit(failures === 0 ? 0 : 1);
