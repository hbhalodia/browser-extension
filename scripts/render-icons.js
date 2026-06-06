#!/usr/bin/env node
/**
 * Renders the W-mark SVG variants to the PNG icon sets the manifest expects.
 *
 * Two sets are produced:
 *
 *   icons/src/wmark.svg          → icons/icon-{16,32,48,128}.png
 *   icons/src/wmark-active.svg   → icons/icon-{16,32}-active.png
 *   icons/src/wmark-inactive.svg → icons/icon-{16,32}-inactive.png
 *     Full-color (WP blue / dark gray circle, white W). Used by Chrome
 *     so the icon stays legible against any toolbar chrome.
 *
 *   icons/src/template/wmark.svg          → icons/template/icon-{16,32,48,128}.png
 *   icons/src/template/wmark-active.svg   → icons/template/icon-{16,32}-active.png
 *   icons/src/template/wmark-inactive.svg → icons/template/icon-{16,32}-inactive.png
 *     Silhouette (transparent background, single-color W mark). Used by
 *     Safari, which template-renders extension toolbar icons — i.e.
 *     ignores the icon's own colors and paints the alpha shape with the
 *     system tint. A silhouette is what Safari's tinting expects; the
 *     full-color version gets flattened to a single tint and loses the
 *     state distinction.
 *
 * Run with: node scripts/render-icons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.resolve(__dirname, '..');

const jobs = [
	{ svg: 'wmark.svg',          sizes: [16, 32, 48, 128], suffix: '' },
	{ svg: 'wmark-active.svg',   sizes: [16, 32],          suffix: '-active' },
	{ svg: 'wmark-inactive.svg', sizes: [16, 32],          suffix: '-inactive' },
];

async function renderSet({ srcDir, outDir, label }) {
	fs.mkdirSync(outDir, { recursive: true });
	for (const { svg, sizes, suffix } of jobs) {
		const buf = fs.readFileSync(path.join(srcDir, svg));
		for (const size of sizes) {
			const out = path.join(outDir, `icon-${size}${suffix}.png`);
			await sharp(buf, { density: 384 })
				.resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
				.png({ compressionLevel: 9 })
				.toFile(out);
			console.log(`  ${label} →`, path.relative(ROOT, out));
		}
	}
}

(async () => {
	await renderSet({
		srcDir: path.join(ROOT, 'icons', 'src'),
		outDir: path.join(ROOT, 'icons'),
		label: 'color   ',
	});
	await renderSet({
		srcDir: path.join(ROOT, 'icons', 'src', 'template'),
		outDir: path.join(ROOT, 'icons', 'template'),
		label: 'template',
	});
})();
