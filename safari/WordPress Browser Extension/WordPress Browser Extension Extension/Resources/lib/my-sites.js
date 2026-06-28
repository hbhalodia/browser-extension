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

  // Sites for display: newest login first. Removed sites are tombstoned
  // (dismissed) rather than deleted, so they're filtered out here.
  function listSites(store) {
    const sites = store && typeof store === 'object' ? store : {};
    return Object.values(sites)
      .filter((s) => s && s.origin && !s.dismissed)
      .sort((a, b) => (b.lastLoggedInAt || 0) - (a.lastLoggedInAt || 0));
  }

  /**
   * Record a logged-in WordPress site. Returns a new store object when it
   * changed, or the same reference when it didn't (so callers can skip the
   * write). Curation rule:
   *   - absent           → add it. Covers first-time visits AND sites the user
   *                        was already logged into (no transition required) —
   *                        "absent" reliably means "never seen" because removal
   *                        tombstones rather than deletes.
   *   - present, active   → bump lastLoggedInAt (refresh baseUrl / iconUrl)
   *   - present, dismissed→ user removed it; only a genuine logged-out→logged-in
   *                        transition (wasLoggedIn === false) un-dismisses it.
   *                        Continued browsing while logged in leaves it removed.
   */
  function upsertOnLogin(store, { origin, baseUrl = null, iconUrl = null, wasLoggedIn = false, now = 0 }) {
    if (!origin) return store;
    const current = store && typeof store === 'object' ? store : {};
    const existing = current[origin];
    if (existing) {
      if (existing.dismissed && wasLoggedIn) return store; // stay removed
      const next = { ...current };
      next[origin] = {
        ...existing,
        lastLoggedInAt: now,
        baseUrl: baseUrl || existing.baseUrl || null,
        iconUrl: iconUrl || existing.iconUrl || null,
      };
      delete next[origin].dismissed; // a fresh login brings a removed site back
      return next;
    }
    const next = { ...current };
    next[origin] = {
      origin,
      baseUrl: baseUrl || null,
      iconUrl: iconUrl || null,
      addedAt: now,
      lastLoggedInAt: now,
    };
    return next;
  }

  // Remove = tombstone (keep the record, hide it) so a still-logged-in site
  // isn't silently re-added on the next page view. listSites filters these out.
  function removeSite(store, origin) {
    if (!store || !store[origin]) return store;
    const next = { ...store };
    next[origin] = { ...next[origin], dismissed: true };
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
