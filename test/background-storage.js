/**
 * Storage-write serialization tests for background.js.
 *
 * Loads the real background service worker under a stubbed chrome whose
 * storage.local yields to the event loop between get and set — the same
 * window in which a concurrent writer clobbers a read-modify-write pair.
 * Every mutation of the shared My Sites / preferences objects must funnel
 * through the background's serialized write queue and survive races.
 *
 *   cd test && npm install && npm test
 */
const fs = require('fs');
const path = require('path');

const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
const mySitesSrc = read('lib', 'my-sites.js');
const restSrc = read('lib', 'rest.js');
const backgroundSrc = read('background.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) { failures++; console.error('  FAIL:', msg); }
  else       {             console.log ('  ok  :', msg); }
}

const EXT_URL = 'chrome-extension://test-extension-id/';
const POPUP_SENDER = { url: `${EXT_URL}dist/popup.html` };
const OPTIONS_SENDER = {
  url: `${EXT_URL}options/options.html`,
  tab: { id: 12, url: `${EXT_URL}options/options.html` }, // options opens in a real tab
};
const CONTENT_SENDER = { url: 'https://evil.example/page', tab: { id: 3, url: 'https://evil.example/page' } };

const MY_SITES_KEY = 'wp_my_sites_v1';
const PREFS_KEY = 'wp_preferences_v1';

/** chrome.storage stub (local + session): async, deep-copying, with an
 * event-loop yield inside get and set so unserialized read-modify-write pairs
 * interleave. session mirrors local so the Mobile Preview window map — which
 * lives in storage.session — runs against its real code path. */
function makeStorage(initial = {}) {
  const tick = () => new Promise((r) => setImmediate(r));
  const areaFor = (store) => ({
    get: async (key) => {
      await tick();
      if (key === null || key === undefined) return structuredClone(store.data);
      const keys = Array.isArray(key) ? key : [key];
      const out = {};
      for (const k of keys) if (k in store.data) out[k] = structuredClone(store.data[k]);
      return out;
    },
    set: async (obj) => {
      await tick();
      for (const [k, v] of Object.entries(obj)) store.data[k] = structuredClone(v);
    },
    remove: async (keys) => {
      await tick();
      for (const k of Array.isArray(keys) ? keys : [keys]) delete store.data[k];
    },
  });
  const local = { data: structuredClone(initial) };
  const session = { data: {} };
  return {
    local: areaFor(local),
    session: areaFor(session),
    read: (k) => structuredClone(local.data[k]),
  };
}

/** Loads background.js with stubs; returns the captured onMessage listener
 * plus the storage handle. */
function loadBackground(storage) {
  // The lib IIFEs attach to the passed globalThis object.
  const libCtx = {};
  new Function('globalThis', mySitesSrc)(libCtx);
  new Function('globalThis', 'document', 'window', restSrc)(libCtx, undefined, undefined);

  const listeners = { message: [] };
  const iconCalls = [];
  const noopEvent = { addListener: () => {} };

  // Stateful windows stub: models open/closed windows so the Mobile Preview
  // reuse path (create once, focus on repeat, reopen after close) can be
  // observed. get() throws for a window the test has closed, exactly like the
  // real API when openOrFocusPreview probes a stale id.
  const winState = { nextId: 1000, open: new Set(), created: [], focused: [] };
  const chromeStub = {
    runtime: {
      getURL: (p) => EXT_URL + p,
      onMessage: { addListener: (fn) => listeners.message.push(fn) },
      onStartup: noopEvent,
      onInstalled: noopEvent,
      lastError: undefined,
    },
    storage,
    tabs: {
      onUpdated: noopEvent,
      query: async () => [],
      sendMessage: async () => ({}),
      update: async () => {},
    },
    action: {
      setIcon: (opts, cb) => { iconCalls.push(opts); cb && cb(); },
      setTitle: (_o, cb) => cb && cb(),
    },
    i18n: { getMessage: (key) => `[i18n:${key}]` },
    commands: { onCommand: noopEvent },
    windows: {
      create: async ({ url }) => {
        const id = winState.nextId++;
        winState.open.add(id);
        winState.created.push({ id, url });
        return { id };
      },
      get: async (id) => {
        if (!winState.open.has(id)) throw new Error('no such window');
        return { id, state: 'normal', width: 393 };
      },
      update: async (id, opts) => {
        if (opts && opts.focused) winState.focused.push(id);
        return { id };
      },
    },
  };

  new Function('globalThis', 'chrome', 'importScripts', 'WPMySites', 'WPRest', backgroundSrc)(
    {}, chromeStub, () => {}, libCtx.WPMySites, libCtx.WPRest,
  );

  assert(listeners.message.length === 1, 'background registered one onMessage listener');
  const listener = listeners.message[0];

  // Drives the listener the way the browser does: resolves with whatever
  // sendResponse gets, or undefined when the message was ignored.
  const send = (msg, sender) =>
    new Promise((resolve) => {
      const keptOpen = listener(msg, sender, resolve);
      if (keptOpen !== true) resolve(undefined);
    });

  // Simulates the user closing a window: drops it from the open set so a later
  // windows.get(id) throws, the way the real API does for a gone window.
  const closeWindow = (id) => winState.open.delete(id);

  return { send, WPMySites: libCtx.WPMySites, iconCalls, winState, closeWindow };
}

const settle = () => new Promise((r) => setTimeout(r, 20));

async function main() {
  // --- 34. Concurrent My Sites curation edits both persist ----------------
  {
    console.log('\n[34] concurrent renames of two sites both persist');
    const seedLib = {};
    new Function('globalThis', mySitesSrc)(seedLib);
    let seed = seedLib.WPMySites.upsertOnLogin({}, { origin: 'https://a.example', now: 1000 });
    seed = seedLib.WPMySites.upsertOnLogin(seed, { origin: 'https://b.example', now: 2000 });
    const storage = makeStorage({ [MY_SITES_KEY]: seed });
    const { send } = loadBackground(storage);

    const [resA, resB] = await Promise.all([
      send({ type: 'MUTATE_MY_SITES', op: 'rename', origin: 'https://a.example', name: 'Site A' }, POPUP_SENDER),
      send({ type: 'MUTATE_MY_SITES', op: 'rename', origin: 'https://b.example', name: 'Site B' }, POPUP_SENDER),
    ]);
    await settle();
    const store = storage.read(MY_SITES_KEY);
    assert(resA?.ok === true && resB?.ok === true, 'both mutations acknowledged');
    assert(store['https://a.example']?.customName === 'Site A', 'first rename persisted');
    assert(store['https://b.example']?.customName === 'Site B', 'second rename persisted (not clobbered)');
  }

  // --- 35. Popup pref racing an options-page pref both persist ------------
  {
    console.log('\n[35] concurrent per-origin and _global pref writes both persist');
    const storage = makeStorage({});
    const { send } = loadBackground(storage);

    const [r1, r2] = await Promise.all([
      send({ type: 'MUTATE_PREF', ns: 'https://a.example', key: 'adminBarHidden', value: true }, POPUP_SENDER),
      send({ type: 'MUTATE_PREF', ns: '_global', key: 'siteInfoEnabled', value: true }, OPTIONS_SENDER),
    ]);
    await settle();
    const prefs = storage.read(PREFS_KEY);
    assert(r1?.ok === true && r2?.ok === true, 'both writes acknowledged');
    assert(prefs['https://a.example']?.adminBarHidden === true, 'per-origin pref persisted');
    assert(prefs._global?.siteInfoEnabled === true, 'global default persisted (not clobbered)');
  }

  // --- 36. Login recording racing a curation removal -----------------------
  {
    console.log('\n[36] background login racing a popup removal preserves both');
    const seedLib = {};
    new Function('globalThis', mySitesSrc)(seedLib);
    const seed = seedLib.WPMySites.upsertOnLogin({}, { origin: 'https://old.example', now: 1000 });
    const storage = makeStorage({ [MY_SITES_KEY]: seed });
    const { send } = loadBackground(storage);

    await Promise.all([
      send({
        type: 'POPUP_DETECTION_RESOLVED',
        origin: 'https://new.example',
        isWordPress: true,
        isLoggedIn: true,
        baseUrl: 'https://new.example',
      }, POPUP_SENDER),
      send({ type: 'MUTATE_MY_SITES', op: 'remove', origin: 'https://old.example' }, POPUP_SENDER),
    ]);
    await settle();
    const store = storage.read(MY_SITES_KEY);
    assert(!!store['https://new.example'], 'freshly logged-in site recorded');
    // Removal tombstones (dismissed: true) rather than deleting the record.
    assert(store['https://old.example']?.dismissed === true, 'removed site stays removed');
  }

  // --- 37. Sender and payload validation -----------------------------------
  {
    console.log('\n[37] mutation messages from content scripts are ignored');
    const storage = makeStorage({ [MY_SITES_KEY]: {} });
    const { send } = loadBackground(storage);

    const res = await send(
      { type: 'MUTATE_MY_SITES', op: 'rename', origin: 'https://a.example', name: 'x' },
      CONTENT_SENDER,
    );
    await settle();
    assert(res === undefined, 'content-script sender gets no response');
    assert(Object.keys(storage.read(MY_SITES_KEY)).length === 0, 'store untouched');

    const bad = await send(
      { type: 'MUTATE_PREF', ns: '_global', key: 'adminBarHidden', value: { evil: true } },
      POPUP_SENDER,
    );
    assert(bad?.ok === false, 'non-primitive pref value rejected');
    const opts = await send(
      { type: 'MUTATE_PREF', ns: '_global', key: 'adminBarHidden', value: true },
      OPTIONS_SENDER,
    );
    assert(opts?.ok === true, 'options page (extension page in a real tab) is accepted');
  }

  // --- 39. WP_LOGIN_HINT downgrades the cached login state (#59) ----------
  {
    console.log('\n[39] early login hint downgrades cache and icon, and nothing else');
    const CACHE_KEY = 'wp_cache_https://a.example';
    const storage = makeStorage({
      [CACHE_KEY]: { isWordPress: true, isLoggedIn: true, lastSeen: 123 },
      'wp_cache_https://b.example': { isWordPress: true, isLoggedIn: true, lastSeen: 456 },
    });
    const { send, iconCalls } = loadBackground(storage);
    const contentSender = (host) => ({ url: `https://${host}/page`, tab: { id: 5, url: `https://${host}/page` } });

    await send({ type: 'WP_LOGIN_HINT', loggedIn: false }, contentSender('a.example'));
    await settle();
    assert(storage.read(CACHE_KEY).isLoggedIn === false, 'cached isLoggedIn downgraded');
    assert(iconCalls.length === 1, 'toolbar icon repainted once');
    assert(iconCalls[0]?.path?.[16] === 'icons/icon-16.png', 'icon dropped to the logged-out WP variant');

    // Repeat hint: entry already logged-out, nothing to do.
    await send({ type: 'WP_LOGIN_HINT', loggedIn: false }, contentSender('a.example'));
    await settle();
    assert(iconCalls.length === 1, 'idempotent — no second repaint');

    // Upgrade attempts and non-content senders are powerless.
    await send({ type: 'WP_LOGIN_HINT', loggedIn: true }, contentSender('b.example'));
    await send({ type: 'WP_LOGIN_HINT', loggedIn: false }, POPUP_SENDER);
    await send({ type: 'WP_LOGIN_HINT', loggedIn: false }, contentSender('unknown.example'));
    await settle();
    assert(storage.read('wp_cache_https://b.example').isLoggedIn === true,
      'loggedIn:true hint ignored (downgrade-only)');
    assert(iconCalls.length === 1, 'popup sender and unknown origin ignored');
  }

  // --- 40. Mobile Preview reuses the window already open for the same URL --
  {
    console.log('\n[40] Mobile Preview: same URL focuses the open window instead of duplicating');
    const storage = makeStorage();
    const { send, winState, closeWindow } = loadBackground(storage);
    const url = 'https://make.wordpress.org/core/2026/05/22/post/';

    await send({ type: 'OPEN_MOBILE_PREVIEW', url, enforceSize: false }, POPUP_SENDER);
    assert(winState.created.length === 1, 'first click opens one preview window');

    await send({ type: 'OPEN_MOBILE_PREVIEW', url, enforceSize: false }, POPUP_SENDER);
    assert(winState.created.length === 1, 'second click on the same URL opens no new window');
    assert(winState.focused.length === 1 && winState.focused[0] === winState.created[0].id,
      'second click focuses the window already open');

    // A different URL still gets its own window.
    const other = 'https://make.wordpress.org/core/2026/05/22/other/';
    await send({ type: 'OPEN_MOBILE_PREVIEW', url: other, enforceSize: false }, POPUP_SENDER);
    assert(winState.created.length === 2, 'a different URL opens a separate window');

    // Once the user closes the first preview, its stored id goes stale; the
    // same URL must open a fresh window rather than focus a window that's gone.
    closeWindow(winState.created[0].id);
    await send({ type: 'OPEN_MOBILE_PREVIEW', url, enforceSize: false }, POPUP_SENDER);
    assert(winState.created.length === 3, 'closed preview reopens instead of focusing a gone window');

    // A content-script sender must not be able to pop open windows.
    const before = winState.created.length;
    await send({ type: 'OPEN_MOBILE_PREVIEW', url: 'https://evil.example/x', enforceSize: false }, CONTENT_SENDER);
    assert(winState.created.length === before, 'content-script sender is ignored');
  }

  console.log(`\n${failures === 0 ? 'Background storage tests passed.' : failures + ' failure(s).'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
