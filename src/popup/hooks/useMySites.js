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

	// Curation edits update local state optimistically, but the storage write
	// happens in the background worker, which serializes mutations of the
	// shared store — a login recorded while the popup edits would otherwise
	// race this write and one of the two would be lost. The onChanged
	// listener above reconciles state with whatever the background persists.
	const sendMutation = (payload) => {
		try {
			const p = chrome.runtime?.sendMessage?.({ type: 'MUTATE_MY_SITES', ...payload });
			if (p && typeof p.catch === 'function') p.catch(() => {});
		} catch (_) {
			/* background unreachable (dev preview) — optimistic state stands */
		}
	};

	const remove = useCallback((origin) => {
		const lib = wpMySites();
		setStore((cur) => (lib && cur ? lib.removeSite(cur, origin) : cur));
		sendMutation({ op: 'remove', origin });
	}, []);

	const rename = useCallback((origin, name) => {
		const lib = wpMySites();
		setStore((cur) => (lib && cur ? lib.renameSite(cur, origin, name) : cur));
		sendMutation({ op: 'rename', origin, name });
	}, []);

	const lib = wpMySites();
	const sites = lib && store ? lib.listSites(store) : [];

	return { sites, remove, rename, ready: store !== null, displayName: lib?.displayName };
}
