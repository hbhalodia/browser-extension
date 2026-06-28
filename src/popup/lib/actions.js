/**
 * Chrome tab/cookie side effects for the popup action rows. Each action
 * computes a target URL (if any) and either navigates the active tab,
 * opens a new tab, or performs an ambient side effect (clear data,
 * open mobile preview, etc.).
 */

export async function runAction(action, { origin, baseUrl, url, editUrl, viewUrl, logoutUrl, newTab = false }) {
	// Path-aware install base for synthesized links (carries any subdirectory
	// prefix — issue #33). Callers that predate it pass only `origin`; fall
	// back to that for root installs. `origin` is still used below for the
	// same-origin security checks on DOM-sourced hrefs and for cookie scoping.
	const base = baseUrl || origin;
	let target;
	switch (action) {
		case 'edit':
			target = editUrl || null;
			break;
		case 'view-post':
			target = viewUrl || null;
			break;
		case 'visit-site':
			target = `${base}/`;
			break;
		case 'admin':
			target = `${base}/wp-admin/`;
			break;
		case 'profile':
			target = `${base}/wp-admin/profile.php`;
			break;
		case 'login':
			target = `${base}/wp-login.php`;
			break;
		case 'login-return':
			target = `${base}/wp-login.php?redirect_to=${encodeURIComponent(url)}`;
			break;
		// Prefer the admin bar's logout link — it carries the `_wpnonce` that
		// makes WP skip its "are you sure?" confirmation. (We do our own
		// inline confirm, so WP's would be a redundant second click.) Same-
		// origin guard: the href came from page DOM and a malicious page
		// could inject a fake admin bar pointing offsite. Fall back to the
		// bare URL when the captured href isn't trustworthy.
		case 'signout': {
			let safeLogout = null;
			if (logoutUrl) {
				try {
					if (new URL(logoutUrl).origin === origin) safeLogout = logoutUrl;
				} catch (_) { /* malformed URL */ }
			}
			target = safeLogout || `${base}/wp-login.php?action=logout`;
			break;
		}
		case 'cachebust': {
			const bust = Math.random().toString(36).slice(2, 7);
			const u = new URL(url);
			u.searchParams.set('cachebust', bust);
			target = u.toString();
			break;
		}
		case 'mobile-preview':
			// Popup window sized to match an iPhone 16/17 Pro (393 × 852).
			// Chrome's popup type adds ~60px of chrome (title bar + URL bar),
			// so the actual viewport is slightly shorter — close enough for a
			// responsive preview without the window looking oversized.
			await chrome.windows.create({ url, type: 'popup', width: 393, height: 852 });
			window.close();
			return;
		case 'clear-data':
			await clearSiteData(origin);
			return;
	}
	if (!target) return;
	if (newTab) {
		await chrome.tabs.create({ url: target });
	} else {
		await chrome.tabs.update({ url: target });
	}
	window.close();
}

/**
 * True when a click on an action row should open its target in a new tab,
 * mirroring the gesture people already use on the WordPress admin bar (#29):
 * a middle-click, Cmd-click on macOS, or Ctrl-click elsewhere.
 *
 * Platform-aware on purpose: on macOS Ctrl+click is a context-menu gesture,
 * not new-tab, so we only honor the Meta (Cmd) key there. Shift (new window)
 * is intentionally unmapped — the popup only ever opens tabs.
 */
export function isNewTabIntent(event) {
	if (!event) return false;
	if (event.button === 1) return true; // middle-click
	const isMac =
		typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform || '');
	return isMac ? !!event.metaKey : !!event.ctrlKey;
}

export async function copyToClipboard(text) {
	try {
		await navigator.clipboard.writeText(text);
		return true;
	} catch (_) {
		return false;
	}
}

const WP_COOKIE_PATTERNS = [/^wordpress_/, /^wp-settings-/, /^wp_/];
const isWpCookie = (name) => WP_COOKIE_PATTERNS.some((re) => re.test(name));

async function clearSiteData(origin) {
	// 1. Remove cookies scoped to this exact host, except WordPress auth.
	//
	// `chrome.cookies.getAll({ domain })` matches cookies whose effective
	// domain is `domain` OR any parent of it — so on `www.example.com` it
	// would also return cookies set with `Domain=.example.com`. Removing
	// those would silently wipe sibling subdomains (e.g. signing the user
	// out of `mail.example.com`), which is not what "clear data on this
	// site" should do. We filter to host-only cookies whose stored domain
	// matches exactly, leaving parent-domain cookies alone.
	const parsedUrl = new URL(origin);
	const allCookies = await chrome.cookies.getAll({ domain: parsedUrl.hostname });
	const removePromises = allCookies
		.filter((c) => c.hostOnly && c.domain === parsedUrl.hostname && !isWpCookie(c.name))
		.map((c) => {
			const cookieUrl = `${c.secure ? 'https' : 'http'}://${c.domain}${c.path}`;
			return chrome.cookies.remove({ url: cookieUrl, name: c.name });
		});
	await Promise.all(removePromises);

	// 2. Clear localStorage and sessionStorage via the content script.
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	try {
		await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			func: () => {
				try { localStorage.clear(); } catch (_) { /* ignore */ }
				try { sessionStorage.clear(); } catch (_) { /* ignore */ }
			},
		});
	} catch (_) {
		/* content script unreachable */
	}

	// 3. Reload the page so the clean state takes effect.
	await chrome.tabs.reload(tab.id);
	window.close();
}

export async function applyAdminBarPref(hidden) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	try {
		await chrome.tabs.sendMessage(tab.id, {
			type: 'APPLY_ADMIN_BAR_PREF',
			hidden,
		});
	} catch (_) {
		/* content script gone — next load will pick it up */
	}
}

export async function applyBlockInspectorPref(enabled) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	try {
		await chrome.tabs.sendMessage(tab.id, {
			type: 'APPLY_BLOCK_INSPECTOR',
			enabled,
		});
	} catch (_) {
		/* content script gone — next load will pick it up */
	}
}

export async function requestRestEditUrl() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		const res = await chrome.tabs.sendMessage(tab.id, { type: 'RESOLVE_EDIT_URL_REST' });
		return res && res.url ? res.url : null;
	} catch (_) {
		return null;
	}
}

/**
 * Resolves a usable WP REST nonce for the active tab. Tries the live page
 * first (MAIN-world script reads `wpApiSettings` / `_wpApiSettings` / inline
 * config / data-* attributes), then falls back to fetching `wp-admin/profile.php`
 * — admin pages reliably enqueue `wp-api` so the inline config object with
 * the nonce is in the response. Returns the nonce string or null.
 *
 * Returns { nonce, tab } so callers can reuse the tab handle without
 * re-querying.
 */
async function resolveRestNonce(baseUrl = null) {
	const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
	let nonce = null;
	try {
		const [out] = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func: () => {
				if (window.wpApiSettings?.nonce) return window.wpApiSettings.nonce;
				if (window._wpApiSettings?.nonce) return window._wpApiSettings.nonce;
				if (window.wp?.apiFetch?.nonceMiddleware?.nonce) return window.wp.apiFetch.nonceMiddleware.nonce;
				for (const s of document.querySelectorAll('script:not([src])')) {
					const t = s.textContent || '';
					const m = t.match(/(?:wpApiSettings|_wpApiSettings)\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/)
						|| t.match(/wp\.api\.fetch\.use\(\s*wp\.api\.fetch\.createNonceMiddleware\(\s*"([a-f0-9]+)"/);
					if (m) return m[1];
				}
				const el = document.querySelector('[data-rest-nonce], [data-wp-nonce], [data-nonce]');
				return el?.getAttribute('data-rest-nonce')
					|| el?.getAttribute('data-wp-nonce')
					|| el?.getAttribute('data-nonce')
					|| null;
			},
		});
		nonce = out?.result || null;
	} catch (_) { /* page disallows scripting */ }

	if (!nonce) {
		try {
			// Subdirectory installs serve wp-admin under a prefix (#33), so
			// prefer the path-aware base when the caller supplies it.
			const base = baseUrl || new URL(tab.url).origin;
			const res = await fetch(`${base}/wp-admin/profile.php`, {
				credentials: 'include',
				redirect: 'follow',
			});
			if (res.ok) {
				const html = await res.text();
				const m = html.match(/(?:wpApiSettings|_wpApiSettings)\s*=\s*\{[^}]*"nonce"\s*:\s*"([a-f0-9]+)"/);
				if (m) nonce = m[1];
			}
		} catch (_) { /* admin fetch failed — give up, will pass null */ }
	}

	return { tab, nonce };
}

/**
 * Resolves a template-backed view (blog index, archive) to a block-theme
 * site-editor edit URL. Returns { url, isBlockTheme } — the nonce is needed
 * because /wp/v2/themes and /wp/v2/templates are private endpoints. Falls
 * back to a null result the popup treats as "not resolvable."
 */
export async function requestTemplateEditUrl(baseUrl = null) {
	try {
		const { tab, nonce } = await resolveRestNonce(baseUrl);
		const res = await chrome.tabs.sendMessage(tab.id, { type: 'RESOLVE_TEMPLATE_EDIT_URL', nonce });
		return res || { url: null, isBlockTheme: null };
	} catch (_) {
		return { url: null, isBlockTheme: null };
	}
}

export async function requestSiteInfo(baseUrl = null) {
	try {
		const { tab, nonce } = await resolveRestNonce(baseUrl);
		const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_SITE_INFO', nonce });
		return res || null;
	} catch (_) {
		return null;
	}
}

export async function requestCurrentUser(baseUrl = null) {
	try {
		const { tab, nonce } = await resolveRestNonce(baseUrl);
		// users/me?context=edit needs a valid REST nonce — cookie auth without
		// one is always rejected with a 401. Skip the doomed request when no
		// nonce could be resolved (common on logged-in frontends that don't
		// enqueue wp-api-fetch, e.g. wordpress.org). The popup's capability
		// gates are DOM-first and don't depend on this; the fetch only enriches
		// the role label / caps when a nonce is actually available.
		if (!nonce) return null;
		const res = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CURRENT_USER', nonce });
		return res?.user || null;
	} catch (_) {
		return null;
	}
}

export async function toggleQueryMonitor() {
	try {
		const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
		await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_QUERY_MONITOR' });
	} catch (_) {
		/* content script unreachable — nothing to toggle */
	}
}
