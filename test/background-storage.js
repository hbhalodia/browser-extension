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

/** chrome.storage.local stub: async, deep-copying, with an event-loop yield
 * inside get and set so unserialized read-modify-write pairs interleave. */
function makeStorage(initial = {}) {
  let data = structuredClone(initial);
  const tick = () => new Promise((r) => setImmediate(r));
  return {
    local: {
      get: async (key) => {
        await tick();
        if (key === null) return structuredClone(data);
        const keys = Array.isArray(key) ? key : [key];
        const out = {};
        for (const k of keys) if (k in data) out[k] = structuredClone(data[k]);
        return out;
      },
      set: async (obj) => {
        await tick();
        for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v);
      },
      remove: async (keys) => {
        await tick();
        for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
      },
    },
    read: (k) => structuredClone(data[k]),
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
  const noopEvent = { addListener: () => {} };
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
      setIcon: (_o, cb) => cb && cb(),
      setTitle: (_o, cb) => cb && cb(),
    },
    commands: { onCommand: noopEvent },
    windows: { get: async () => ({}), update: async () => {} },
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

  return { send, WPMySites: libCtx.WPMySites };
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

  console.log(`\n${failures === 0 ? 'Background storage tests passed.' : failures + ' failure(s).'}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
