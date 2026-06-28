#!/usr/bin/env node
/**
 * Package integrity check. Given an extension directory (the staged Chrome
 * package, or the repo root), confirm that every runtime file referenced by
 * the manifest, the popup/options HTML, and the background service worker
 * actually exists there.
 *
 * Catches the class of bug where a new runtime file (e.g. `_locales/`, a new
 * `lib/*.js`) is added to the source tree but the packaging file list isn't
 * updated — which builds a zip that installs/runs broken even though the local
 * source works.
 *
 * Usage:   node scripts/verify-package.js <dir>
 * Exits non-zero and lists the missing files if anything is absent.
 * Also exported (collectReferenced / verify) for the test suite.
 */
const fs = require('fs');
const path = require('path');

function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// A reference points at a packaged file (not an absolute URL, scheme, or
// in-page anchor) and has a file extension.
function isLocalRef(ref) {
  return (
    typeof ref === 'string' &&
    ref.length > 0 &&
    !/^(https?:|data:|blob:|chrome:|moz-extension:|mailto:|tel:|javascript:|#)/i.test(ref) &&
    !!path.extname(ref)
  );
}

const norm = (ref) => ref.replace(/^\.?\//, '');

// Files named directly in the manifest.
function fromManifest(manifest) {
  const refs = new Set();
  const add = (r) => {
    if (isLocalRef(r)) refs.add(norm(r));
  };
  if (manifest.background?.service_worker) add(manifest.background.service_worker);
  for (const cs of manifest.content_scripts || []) {
    (cs.js || []).forEach(add);
    (cs.css || []).forEach(add);
  }
  if (manifest.action?.default_icon && typeof manifest.action.default_icon === 'object') {
    Object.values(manifest.action.default_icon).forEach(add);
  }
  if (manifest.action?.default_popup) add(manifest.action.default_popup);
  if (manifest.icons) Object.values(manifest.icons).forEach(add);
  const optionsPage = manifest.options_ui?.page || manifest.options_page;
  if (optionsPage) add(optionsPage);
  // default_locale requires the matching catalog to exist or Safari/Chrome
  // can't resolve the manifest's __MSG_*__ fields.
  if (manifest.default_locale) add(`_locales/${manifest.default_locale}/messages.json`);
  return refs;
}

// importScripts('a', 'b') in a (service-worker) file → referenced files.
function fromImportScripts(dir, file) {
  const refs = new Set();
  const full = path.join(dir, file);
  if (!fs.existsSync(full)) return refs;
  const src = fs.readFileSync(full, 'utf8');
  for (const call of src.match(/importScripts\(([^)]*)\)/g) || []) {
    for (const lit of call.match(/['"]([^'"]+)['"]/g) || []) {
      const ref = lit.slice(1, -1);
      if (isLocalRef(ref)) refs.add(norm(ref));
    }
  }
  return refs;
}

// <script src> / <link href> in an HTML file, resolved relative to the HTML's
// own directory and made root-relative.
function fromHtml(dir, htmlRel) {
  const refs = new Set();
  const full = path.join(dir, htmlRel);
  if (!fs.existsSync(full)) return refs;
  const html = fs.readFileSync(full, 'utf8');
  const htmlDir = path.dirname(htmlRel);
  for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    const ref = m[1];
    if (!isLocalRef(ref)) continue;
    refs.add(path.normalize(path.join(htmlDir, ref)));
  }
  return refs;
}

// The full set of runtime files an installed extension at `dir` depends on.
function collectReferenced(dir) {
  const manifest = readJSON(path.join(dir, 'manifest.json'));
  const refs = new Set(['manifest.json']);
  for (const r of fromManifest(manifest)) refs.add(r);
  if (manifest.background?.service_worker) {
    for (const r of fromImportScripts(dir, manifest.background.service_worker)) refs.add(r);
  }
  for (const page of [manifest.action?.default_popup, manifest.options_ui?.page || manifest.options_page]) {
    if (page) for (const r of fromHtml(dir, page)) refs.add(r);
  }
  return [...refs].sort();
}

// Referenced files that are missing from `dir`.
function verify(dir) {
  return collectReferenced(dir).filter((r) => !fs.existsSync(path.join(dir, r)));
}

if (require.main === module) {
  const dir = process.argv[2] || '.';
  const refs = collectReferenced(dir);
  const missing = verify(dir);
  if (missing.length) {
    console.error(`✗ package integrity: ${missing.length} referenced file(s) missing in ${dir}:`);
    missing.forEach((m) => console.error(`    ${m}`));
    process.exit(1);
  }
  console.log(`✓ package integrity: all ${refs.length} referenced runtime files present in ${dir}`);
}

module.exports = { collectReferenced, verify };
