/**
 * "My Sites" — a persistent, user-curated list of WordPress sites the user
 * has logged into. Framework-free pure helpers over a plain store object
 * (`{ [origin]: { origin, baseUrl, addedAt, lastLoggedInAt, customName? } }`),
 * attached to globalThis so the background service worker (importScripts) and
 * the popup (classic <script> → window.WPMySites) share one implementation.
 * The chrome.storage.local read/write wrapping lives with each caller.
 */
(function () {
  'use strict';

  const STORE_KEY = 'wp_my_sites_v1';

  // Sites for display: newest login first.
  function listSites(store) {
    const sites = store && typeof store === 'object' ? store : {};
    return Object.values(sites)
      .filter((s) => s && s.origin)
      .sort((a, b) => (b.lastLoggedInAt || 0) - (a.lastLoggedInAt || 0));
  }

  /**
   * Record a logged-in WordPress site. Returns a new store object when it
   * changed, or the same reference when it didn't (so callers can skip the
   * write). Curation rule:
   *   - already listed        → bump lastLoggedInAt (and refresh baseUrl)
   *   - absent, fresh login    → add it
   *   - absent, was already in → user removed it and is still browsing while
   *     logged in; do NOT re-add. A genuine logged-out→logged-in transition
   *     (wasLoggedIn === false) is what re-adds a removed site.
   */
  function upsertOnLogin(store, { origin, baseUrl = null, wasLoggedIn = false, now = 0 }) {
    if (!origin) return store;
    const current = store && typeof store === 'object' ? store : {};
    if (current[origin]) {
      const next = { ...current };
      next[origin] = {
        ...next[origin],
        lastLoggedInAt: now,
        baseUrl: baseUrl || next[origin].baseUrl || null,
      };
      return next;
    }
    if (wasLoggedIn) return store; // removed & still browsing — respect the removal
    const next = { ...current };
    next[origin] = { origin, baseUrl: baseUrl || null, addedAt: now, lastLoggedInAt: now };
    return next;
  }

  function removeSite(store, origin) {
    if (!store || !store[origin]) return store;
    const next = { ...store };
    delete next[origin];
    return next;
  }

  // Set/clear a custom display name. Empty/whitespace clears it.
  function renameSite(store, origin, name) {
    if (!store || !store[origin]) return store;
    const trimmed = (name || '').trim();
    const next = { ...store };
    next[origin] = { ...next[origin] };
    if (trimmed) next[origin].customName = trimmed;
    else delete next[origin].customName;
    return next;
  }

  // Label to show: custom name, else the hostname without scheme / leading www.
  function displayName(site) {
    if (!site) return '';
    if (site.customName) return site.customName;
    try {
      return new URL(site.origin).host.replace(/^www\./, '');
    } catch (_) {
      return site.origin || '';
    }
  }

  globalThis.WPMySites = {
    STORE_KEY,
    listSites,
    upsertOnLogin,
    removeSite,
    renameSite,
    displayName,
  };
})();
