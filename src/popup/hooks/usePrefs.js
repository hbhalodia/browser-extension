import { useCallback, useEffect, useState } from 'react';

const PREFS_KEY = 'wp_preferences_v1';
const GLOBAL_NS = '_global';
const DEFAULT_PREFS = { adminBarHidden: false, blockInspectorEnabled: false, siteInfoEnabled: false };

// Per-origin pref wins. Falls back to whatever the global namespace sets on
// the options page; falls back to the hard-coded defaults if neither exists.
function mergePrefs(globalPrefs, originPrefs) {
	return { ...DEFAULT_PREFS, ...globalPrefs, ...originPrefs };
}

export function usePrefs(origin) {
	const [prefs, setPrefs] = useState(DEFAULT_PREFS);

	useEffect(() => {
		if (!origin) return;
		(async () => {
			const data = await chrome.storage.local.get(PREFS_KEY);
			const all = data[PREFS_KEY] || {};
			setPrefs(mergePrefs(all[GLOBAL_NS] || {}, all[origin] || {}));
		})();
	}, [origin]);

	const savePref = useCallback(
		async (key, value) => {
			setPrefs((prev) => ({ ...prev, [key]: value }));
			const data = await chrome.storage.local.get(PREFS_KEY);
			const all = data[PREFS_KEY] || {};
			all[origin] = { ...(all[origin] || {}), [key]: value };
			await chrome.storage.local.set({ [PREFS_KEY]: all });
		},
		[origin],
	);

	return [prefs, savePref];
}
