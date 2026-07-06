/**
 * WordPress Browser Extension — background service worker
 *
 * Responsibilities:
 *   - Cache per-origin detection results in chrome.storage.local
 *   - Refresh cached entries no more than once per REFRESH_INTERVAL
 *   - Purge origins unvisited for longer than PURGE_AFTER
 *   - Update the toolbar icon to reflect WP detection per tab
 *   - Serve cached detection to the popup
 *   - Maintain the user's "My Sites" list (auto-add on fresh login)
 */

// Pure My Sites store helpers, attached to globalThis.WPMySites — shared with
// the popup, which loads the same file as a classic script.
importScripts('lib/my-sites.js');

// REST helpers (globalThis.WPRest). The edit-this-page keyboard shortcut reuses
// resolveEditUrlSync from here rather than maintaining a second copy of the
// admin-URL priority chain and its same-origin guard.
importScripts('lib/rest.js');

// Detection results are cached one storage key per origin (wp_cache_<origin>)
// rather than a single blob, so a page load reads and writes only its own
// origin's entry instead of the whole browsing history, and concurrent writes
// to different origins can't clobber each other.
const CACHE_PREFIX = 'wp_cache_';
// Pre-0.10.1 single-blob cache; discarded once on upgrade (see wipeLegacyCache).
const LEGACY_CACHE_KEY = 'wp_detection_cache_v1';
const REFRESH_INTERVAL      = 7 * 24 * 60 * 60 * 1000;  // 1 week
const PURGE_AFTER           = 28 * 24 * 60 * 60 * 1000;  // 4 weeks
const HOST_REFRESH_INTERVAL = 90 * 24 * 60 * 60 * 1000;  // 90 days

// --- Cache helpers (one storage key per origin) ---------------------------

// Keep this prefix in sync with lib/early.js, which reads its origin's entry
// directly at document_start.
function cacheKey(origin) {
  return CACHE_PREFIX + origin;
}

async function getEntry(origin) {
  const key = cacheKey(origin);
  const data = await chrome.storage.local.get(key);
  return data[key] || null;
}

async function putEntry(origin, entry) {
  await chrome.storage.local.set({ [cacheKey(origin)]: entry });
}

// Reads every per-origin entry as { origin: entry }. Cold paths only (startup
// repaint, purge) — never per page load.
async function getAllEntries() {
  const all = await chrome.storage.local.get(null);
  const entries = {};
  for (const key of Object.keys(all)) {
    if (key.startsWith(CACHE_PREFIX)) entries[key.slice(CACHE_PREFIX.length)] = all[key];
  }
  return entries;
}

async function purgeStale() {
  const all = await chrome.storage.local.get(null);
  const now = Date.now();
  const stale = [];
  for (const key of Object.keys(all)) {
    if (!key.startsWith(CACHE_PREFIX)) continue;
    const entry = all[key];
    if (!entry || !entry.lastSeen || now - entry.lastSeen > PURGE_AFTER) stale.push(key);
  }
  if (stale.length) await chrome.storage.local.remove(stale);
}

// One-time discard of the pre-0.10.1 single-blob cache. Nothing writes that key
// anymore, so removing it once is permanent. My Sites and preferences live
// under separate keys and are untouched; dropped detection results rebuild as
// the user browses.
async function wipeLegacyCache() {
  await chrome.storage.local.remove(LEGACY_CACHE_KEY);
}

// --- My Sites: persistent list of WP installs the user logs into ----------

// Record a logged-in WordPress site, applying the curation rule in
// lib/my-sites.js. `wasLoggedIn` is the prior cached login state for this
// origin, so a site the user removed isn't silently re-added while they keep
// browsing it logged in — only a fresh logged-out→logged-in transition does.
async function recordLogin(origin, baseUrl, iconUrl, wasLoggedIn) {
  if (!origin) return;
  const data = await chrome.storage.local.get(WPMySites.STORE_KEY);
  const store = data[WPMySites.STORE_KEY] || {};
  const next = WPMySites.upsertOnLogin(store, {
    origin, baseUrl: baseUrl || null, iconUrl: iconUrl || null, wasLoggedIn, now: Date.now(),
  });
  if (next !== store) {
    await chrome.storage.local.set({ [WPMySites.STORE_KEY]: next });
  }
}

// --- Detection handling ---------------------------------------------------

chrome.runtime.onStartup.addListener(onLoad);
chrome.runtime.onInstalled.addListener(onLoad);

async function onLoad() {
  await wipeLegacyCache();
  await purgeStale();
  await repaintAllTabs();
}

// On SW startup (browser launch) and onInstalled (extension install/reload)
// the content scripts in already-open tabs are orphaned and can no longer
// report to us, so their toolbar icons stay at the default until the user
// navigates. Walk the open tabs and re-paint from cache instead.
async function repaintAllTabs() {
  let tabs;
  try { tabs = await chrome.tabs.query({}); } catch (_) { return; }
  const entries = await getAllEntries();
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue;
    try {
      const origin = new URL(tab.url).origin;
      const entry = entries[origin];
      await updateToolbar(
        tab.id,
        entry?.isWordPress || false,
        { isLoggedIn: entry?.isLoggedIn || false },
      );
    } catch (_) { /* invalid URL or tab closed */ }
  }
}

// Origin as attested by the browser rather than taken from the message body:
// sender.origin when present, else the sender tab's URL. Page JS can't forge
// either, so cache and My Sites writes key off this instead of a spoofable
// msg.origin.
function originFromSender(sender) {
  if (sender && sender.origin) return sender.origin;
  try {
    return sender && sender.tab && sender.tab.url ? new URL(sender.tab.url).origin : null;
  } catch (_) {
    return null;
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg) return;

  if (msg.type === 'WP_DETECTION') {
    if (!sender.tab) return; // only accept from content scripts
    handleDetection(msg, sender)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true; // keep channel open for async response
  }

  if (msg.type === 'GET_CACHED_DETECTION') {
    // A content script may read only its OWN origin's entry — otherwise the
    // cache doubles as a cross-origin history oracle (ask about any origin,
    // learn whether the user has visited or is logged into it). The popup has
    // no sender.tab and legitimately asks about the active tab's origin.
    if (sender.tab && msg.origin !== originFromSender(sender)) {
      sendResponse(null);
      return true;
    }
    getEntry(msg.origin).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }

  // Popup pushes back its final detection (which may include the cookie-API
  // login override) so the toolbar icon and cache reflect it without waiting
  // for a navigation. Popup-only: a content-script context must not be able to
  // forge a resolution for an arbitrary origin/tab (it carries a sender.tab).
  if (msg.type === 'POPUP_DETECTION_RESOLVED') {
    if (sender.tab) return;
    handlePopupResolution(msg)
      .then(() => sendResponse({ ok: true }))
      .catch(() => sendResponse({ ok: false }));
    return true;
  }

  // Safari opens a new window at the parent window's size when the parent is
  // maximized or fullscreen, ignoring windows.create's width/height. Re-assert
  // the requested size once the window exists — from here so it survives the
  // popup closing (see issue #13).
  if (msg.type === 'ENFORCE_PREVIEW_SIZE') {
    enforcePreviewSize(msg.winId, msg.width, msg.height);
    return;
  }
});

// Polls until the window accepts the requested size or closes. Safari ignores
// the size on create and takes a beat before it honors an update, so we
// re-assert on a short interval and stop as soon as it sticks.
async function enforcePreviewSize(winId, width, height) {
  if (winId == null) return;
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    let win;
    try {
      win = await chrome.windows.get(winId);
    } catch (_) {
      return; // window closed
    }
    if (win.state === 'normal' && Math.abs((win.width || 0) - width) <= 40) return; // sized + un-maximized
    try {
      // state:'normal' clears the maximized/zoomed state the window inherited
      // from its parent, so dragging it doesn't snap back to the parent's width.
      await chrome.windows.update(winId, { state: 'normal', width, height });
    } catch (_) {
      return;
    }
  }
}

async function handlePopupResolution(msg) {
  const { origin, tabId, isLoggedIn, isWordPress, baseUrl, siteIconUrl } = msg;
  if (!origin) return;
  const existing = await getEntry(origin);
  const wasLoggedIn = existing?.isLoggedIn === true; // capture before mutating
  if (existing) {
    existing.isLoggedIn = !!isLoggedIn;
    existing.lastSeen = Date.now();
    await putEntry(origin, existing);
  }
  if (tabId) await updateToolbar(tabId, !!isWordPress, { isLoggedIn });

  // Catches cookie-API logins the page DOM missed (logged-out HTML).
  if (isWordPress && isLoggedIn) {
    await recordLogin(origin, baseUrl, siteIconUrl, wasLoggedIn);
  }
}

async function handleDetection(msg, sender) {
  const { detection, hostFromDOM } = msg;
  // Key off the browser-attested origin, not msg.origin: a compromised renderer
  // could otherwise write or overwrite another origin's cache / My Sites entry.
  const origin = originFromSender(sender);
  if (!origin) return;
  const now = Date.now();
  const existing = await getEntry(origin);

  // Decide whether to trust this detection or the cache.
  // - If the current page strongly suggests WP, use it.
  // - If not, keep the cached answer (the home page may have different
  //   signals than a deep page; headless WP setups especially).
  const freshlyDetected = detection.isWordPress;
  const cacheIsFresh = existing &&
                       existing.isWordPress &&
                       (now - existing.checkedAt) < REFRESH_INTERVAL;

  // Host: prefer a fresh DOM signal, fall back to cached value.
  const host = hostFromDOM || existing?.host || null;
  const hostCheckedAt = hostFromDOM ? now : (existing?.hostCheckedAt || null);

  const entry = {
    origin,
    isWordPress: freshlyDetected || cacheIsFresh || false,
    confidence: Math.max(
      detection.confidence,
      existing ? existing.confidence : 0,
    ),
    signals: detection.signals,
    // Cached so the toolbar repaint after SW startup/install can show the
    // active variant without waiting for fresh detection. May be stale if
    // the user logs out elsewhere; corrected on next page load and by the
    // popup pushing its cookie-API result via POPUP_DETECTION_RESOLVED.
    isLoggedIn: !!detection.context?.isLoggedIn,
    // Only advance checkedAt when we have a confident positive detection,
    // so a single ambiguous page view doesn't reset the clock.
    checkedAt: freshlyDetected
      ? now
      : (existing?.checkedAt || now),
    lastSeen: now,
    host,
    hostCheckedAt,
  };

  // If WordPress but host is still unknown and we haven't checked
  // recently, ask the content script to inspect response headers.
  // Resolve before the first write so we don't write twice.
  const needsHostCheck = entry.isWordPress && !entry.host &&
    (!entry.hostCheckedAt || (now - entry.hostCheckedAt) > HOST_REFRESH_INTERVAL);

  if (needsHostCheck) {
    try {
      const res = await chrome.tabs.sendMessage(
        sender.tab.id, { type: 'RESOLVE_HOST_HEADERS' },
      );
      entry.host = res?.host || null;
      entry.hostCheckedAt = now;
    } catch (_) { /* content script gone */ }
  }

  await putEntry(origin, entry);
  await updateToolbar(sender.tab.id, entry.isWordPress, detection.context);

  // Add to "My Sites" on a logged-in WordPress install. `existing?.isLoggedIn`
  // is the prior state, so a removed site isn't re-added while still browsing.
  if (entry.isWordPress && entry.isLoggedIn) {
    await recordLogin(
      origin,
      detection.context?.baseUrl,
      detection.context?.siteIconUrl,
      existing?.isLoggedIn === true,
    );
  }
}

// --- Toolbar icon + title -------------------------------------------------

// chrome.action.setIcon resolves its promise even when the target tab has
// closed or navigated away — it reports the failure as an unchecked
// chrome.runtime.lastError instead, so an awaited try/catch never catches it
// and it surfaces a red "Errors" badge on the extension card. (setTitle does
// reject and could be awaited, but both use the callback form so each consumes
// its own lastError.) updateToolbar runs on every tabs.onUpdated tick, exactly
// when a tab can vanish mid-navigation; a missing tab here is expected.
const ignoreLastError = () => void chrome.runtime.lastError;

async function updateToolbar(tabId, isWordPress, context) {
  // Three states: not WP (gray + slash), WP but not logged in (gray),
  // WP + logged in (blue). The cache doesn't carry isLoggedIn so on a
  // tab-URL-change icon refresh we'll briefly show the gray "WP" variant
  // until the content script reports back with auth context.
  const variant = !isWordPress ? '-inactive'
    : context?.isLoggedIn ? '-active'
    : '';
  chrome.action.setIcon({
    tabId,
    path: {
      16: `icons/icon-16${variant}.png`,
      32: `icons/icon-32${variant}.png`,
    },
  }, ignoreLastError);

  const title = isWordPress
    ? chrome.i18n.getMessage(context?.isLoggedIn ? 'toolbar_title_detected_logged_in' : 'toolbar_title_detected') // "WordPress detected — logged in" / "WordPress detected"
    : chrome.i18n.getMessage('toolbar_title_default'); // "WordPress Browser Extension"
  chrome.action.setTitle({ tabId, title }, ignoreLastError);
}

// --- Keyboard shortcut: edit this page ------------------------------------

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== 'edit-this-page') return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !/^https?:/.test(tab.url)) return;

  // Ask the content script for live detection — it has the freshest context.
  let result;
  try {
    result = await chrome.tabs.sendMessage(tab.id, { type: 'GET_LIVE_DETECTION' });
  } catch (_) { return; /* content script unreachable */ }

  if (!result?.detection?.isWordPress) return;
  const ctx = result.detection.context || {};
  if (!ctx.isLoggedIn) return;

  const origin = result.origin;

  // Sync resolution via the shared resolver: same-origin/wp-admin guard on the
  // admin-bar href, then post.php / term.php / user-edit.php by page type, all
  // path-aware for subdirectory installs (#33). Kept identical to the popup's
  // Edit action by reusing lib/rest.js rather than a hand-copied chain.
  let editUrl = WPRest.resolveEditUrlSync(ctx, origin);

  // If sync didn't resolve, try the REST fallback via content script.
  if (!editUrl) {
    try {
      const res = await chrome.tabs.sendMessage(tab.id, { type: 'RESOLVE_EDIT_URL_REST' });
      editUrl = res?.url || null;
    } catch (_) { /* content script gone */ }
  }

  if (editUrl) {
    // Await + guard: the active tab can close or navigate between resolving
    // the edit URL (which may involve an async REST round-trip above) and this
    // navigation. A fire-and-forget update against a gone tab surfaces an
    // "Unchecked runtime.lastError: No tab with id" in the service worker.
    try {
      await chrome.tabs.update(tab.id, { url: editUrl });
    } catch (_) { /* tab closed before we could navigate it */ }
  }
});

// Re-check cache when a tab changes URL, so the icon reflects cached state
// even before the content script reports in.
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!changeInfo.url && changeInfo.status !== 'loading') return;
  if (!tab.url || !/^https?:/.test(tab.url)) return;

  try {
    const origin = new URL(tab.url).origin;
    const entry = await getEntry(origin);
    if (entry) await updateToolbar(tabId, entry.isWordPress, {
      isLoggedIn: entry.isLoggedIn || false,
    });
  } catch (_) { /* invalid URL */ }
});
