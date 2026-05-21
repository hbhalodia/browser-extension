/**
 * Pure helpers for merging DOM-detected site metadata with REST responses.
 * Attached to globalThis for Node smoke tests; webpack imports the same file.
 */
(function () {
	'use strict';

	const NS_SKIP = new Set([
		'wp/v2',
		'wp/v2/fields',
		'wp-site-health/v1',
		'oembed/1.0',
		'wp-block-editor/v1',
		'akismet/v1',
	]);

	function mergeTheme(slug, rest) {
		if (!slug && !rest) {
			return null;
		}
		if (!rest) {
			return { slug, name: slug, version: null, author: null };
		}
		return {
			slug: rest.stylesheet || slug,
			name: rest.name?.rendered || rest.name || slug,
			version: rest.version || null,
			author: rest.author?.rendered || rest.author || null,
		};
	}

	function mergePlugins(domSlugs, restPlugins, namespaces) {
		const bySlug = new Map();

		for (const slug of domSlugs) {
			bySlug.set(slug, { slug, name: null, version: null, active: null, pluginUri: null });
		}

		for (const ns of namespaces || []) {
			if (NS_SKIP.has(ns)) {
				continue;
			}
			const slugFromNs = ns.split('/')[0];
			if (!slugFromNs || slugFromNs === 'wp') {
				continue;
			}
			if (!bySlug.has(slugFromNs)) {
				bySlug.set(slugFromNs, {
					slug: slugFromNs,
					name: null,
					version: null,
					active: null,
					pluginUri: null,
				});
			}
		}

		for (const p of restPlugins || []) {
			const slug = (p.plugin || '').split('/')[0];
			if (!slug) {
				continue;
			}
			const row = {
				slug,
				name: p.name || null,
				version: p.version || null,
				active: p.status === 'active',
				pluginUri: p.plugin_uri || null,
			};
			bySlug.set(slug, row);
		}

		return Array.from(bySlug.values())
			.filter((p) => p.active !== false)
			.sort((a, b) => a.slug.localeCompare(b.slug));
	}

	function stripTags(s) {
		if (typeof s !== 'string') {
			return '';
		}
		return s.replace(/<[^>]*>/g, '').trim();
	}

	const api = { mergePlugins, mergeTheme, stripTags };
	globalThis.WPSiteInfo = api;

	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
