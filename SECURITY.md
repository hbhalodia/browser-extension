# Security policy

Browser extensions sit in a sensitive position — they run with broad host permissions across every site you visit and have access to cookies on those sites. Vulnerabilities here matter, and we take them seriously.

## Reporting a vulnerability

If you believe you've found a security issue in this extension:

- **Do not open a public GitHub Issue or Discussion.**
- Use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repo. This creates an advisory only visible to maintainers.
- If GitHub's private reporting is unavailable for any reason, contact a maintainer directly via the email on their GitHub profile.

Please include:

- A description of the issue and its impact (e.g. "feature X exfiltrates Y to Z")
- Reproduction steps or a minimal proof-of-concept
- Browser, operating system, and extension version
- Whether you've shared the report with anyone else

### Response

We aim to acknowledge reports within five business days. After triage we coordinate with the reporter on a disclosure timeline. The default is: fix in private → release patch and store update → publish advisory and credit the reporter (unless they prefer to remain anonymous).

## Scope

**In scope:**

- The shipping extension runtime: `background.js`, `content.js`, `lib/*`, `popup/*`
- The Safari companion app under `safari/`
- Build scripts that produce the distributed bundles: `scripts/*`, build configuration

**Out of scope:**

- Vulnerabilities in third-party WordPress sites the extension interacts with — report those to the site operator
- Issues only reproducible on heavily modified or unmaintained browser builds
- Self-XSS or social-engineering attacks that require the user to paste content into devtools
- Findings against unreleased branches or PR builds (please test against a tagged release)

## Permissions rationale

The extension requests four API permissions plus broad host permissions. Each entry below documents what the permission powers, what it deliberately does not do, and the least-privilege analysis behind keeping it. New permission requests are discussed publicly in an Issue before being added, and the v1.0 milestone freezes this surface.

### `storage`

Persists user preferences (admin bar visibility, feature toggles), a per-site detection cache, and the user-curated My Sites list, all in `chrome.storage.local`. Cache entries are pruned automatically after four weeks without a visit. Nothing is synced (`storage.sync` is unused) and nothing leaves the device. The options page offers a full clear.

### `scripting`

Powers two user-gesture flows, both scoped to the active tab: the popup's one-shot page probe (admin bar links, sign-in indicators, site icon) when it opens, and the "clear site data" developer action. Injected functions are declared inline in the extension source; no remote code exists anywhere in the extension. The clear-data injection re-verifies the page's origin inside the target document before touching storage.

### `cookies`

Two uses. Sign-in detection: WordPress marks a logged-in session with an HttpOnly cookie that page scripts cannot see, so the extension checks for the presence of a `wordpress_logged_in_*` cookie via the cookies API. Only the name is matched; cookie values are never parsed, stored, or transmitted. Clear site data: the tool removes the current site's host-only cookies while deliberately sparing WordPress auth cookies and parent-domain cookies (which could sign the user out of sibling subdomains).

### `activeTab`

Redundant next to the broad host permissions (Chrome's restricted "on click" site-access mode re-grants host permissions itself and does not depend on `activeTab`), so the packaged Chrome build strips it at packaging time and ships without it as of 0.11.0 ([#61](https://github.com/WordPress/browser-extension/issues/61)). The repository manifest keeps the entry because the Safari build mirrors it and Safari's permission model has a history of surprising behavior under permission narrowing; removing it there is deferred to, and gated on, the Safari store-readiness verification pass. This is the single divergence between the shipped Chrome manifest and the repository manifest.

### Host permissions: `http://*/*`, `https://*/*`

The heart of the permission surface, and the entry that deserves the most scrutiny. The extension's core function is ambient detection: the toolbar icon reflects whether the current site runs WordPress, and whether the user is signed in, for every page as the user browses, with no gesture required. That requires content scripts on all http(s) pages. The pre-paint admin bar hide (a `document_start` script that prevents a flash of admin bar on sites where the user chose to hide it) has the same requirement.

A gesture-scoped alternative (`activeTab` only, no host permissions) was built and evaluated. It removes ambient detection outright: the icon cannot show WordPress state until the user clicks the extension on every page, which inverts the product (the icon exists so users do not have to click), and it broke detection in the Safari companion entirely. Broad host access is the minimum permission that supports the shipped behavior.

What the content scripts do with that access is deliberately narrow: read-only DOM inspection for WordPress signals, all evaluated locally. Same-origin REST requests (Site Information, edit-URL resolution) go only to the site being viewed and only in response to user-facing features. No page content, browsing history, or detection result is transmitted off the device; the extension has no servers and no analytics. Hardening on top of this access includes same-origin and path validation for all DOM-sourced navigation targets, origin re-checks inside injected functions, browser-attested sender origins for cache writes, and a cross-origin history oracle guard on the detection cache (a content script can read only its own origin's entry).
