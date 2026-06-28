import { useCallback, useEffect, useState } from 'react';

// lib/my-sites.js is loaded as a classic script (window.WPMySites), shared with
// the background. Returns null when unavailable (e.g. the dev preview without
// the shim) so callers can no-op.
function wpMySites() {
	return typeof window !== 'undefined' ? window.WPMySites : null;
}

const STORE_KEY = 'wp_my_sites_v1';

/**
 * Reads the persistent "My Sites" store and exposes curation actions. Stays in
 * sync if the background adds a site (or another popup edits the list) via
 * chrome.storage.onChanged. `ready` is false until the first read resolves so
 * the section can stay hidden rather than flash empty.
 */
export function useMySites() {
	const [store, setStore] = useState(null);

	useEffect(() => {
		let cancelled = false;
		chrome.storage?.local?.get(STORE_KEY).then((data) => {
			if (!cancelled) setStore(data?.[STORE_KEY] || {});
		});
		const onChanged = (changes, area) => {
			if (area === 'local' && changes[STORE_KEY]) {
				setStore(changes[STORE_KEY].newValue || {});
			}
		};
		chrome.storage?.onChanged?.addListener(onChanged);
		return () => {
			cancelled = true;
			chrome.storage?.onChanged?.removeListener(onChanged);
		};
	}, []);

	const remove = useCallback((origin) => {
		const lib = wpMySites();
		setStore((cur) => {
			if (!lib || !cur) return cur;
			const next = lib.removeSite(cur, origin);
			chrome.storage?.local?.set({ [STORE_KEY]: next });
			return next;
		});
	}, []);

	const rename = useCallback((origin, name) => {
		const lib = wpMySites();
		setStore((cur) => {
			if (!lib || !cur) return cur;
			const next = lib.renameSite(cur, origin, name);
			chrome.storage?.local?.set({ [STORE_KEY]: next });
			return next;
		});
	}, []);

	const lib = wpMySites();
	const sites = lib && store ? lib.listSites(store) : [];

	return { sites, remove, rename, ready: store !== null, displayName: lib?.displayName };
}
