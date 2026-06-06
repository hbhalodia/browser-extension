# Roadmap

> ⚠️ **Working draft — not a commitment.** This document reflects current maintainer thinking on direction and priorities. Phases, features, v1.0 gates, and even the store list will evolve as community input lands, browser-store realities surface, and WordPress Foundation alignment progresses. Everything below is open to be challenged — propose changes in [Discussions](https://github.com/WordPress/browser-extension/discussions) or via Issues.

A milestone-level view of where this project is heading. Day-to-day work is tracked in [Issues](https://github.com/WordPress/browser-extension/issues) and proposals in [Discussions](https://github.com/WordPress/browser-extension/discussions).

| Phase | What | Status |
|---|---|---|
| **v0.8.x** | Public scaffold under the WordPress org. React popup architecture, Site Information panel, Block Inspector, host detection, developer tools. | shipped |
| **v0.9.x** | **Features:** account menu in the popup header (display name, role, profile / Gravatar); extension options page with browser-wide preferences (admin bar default, Site Information opt-in, clear-data); toolbar icon redesigned for contrast on any browser chrome; admin bar attribution comment when the extension is hiding it. **Build:** popup bundle migrated from `10up-toolkit` to `@wordpress/scripts`. **Security:** REST root and profile URL validated against same-origin so a hostile page can't redirect the extension's authenticated calls. **Store-prep pending:** Xcode bundle identifier change from `com.fabiankaegy.wp-detective` to a WordPress-namespaced ID — coordinated with the Apple Developer account holder. Final permissions and API-surface review. (The Xcode project / display-name rename to "WordPress Browser Extension" shipped in v0.8.3.) | active (now) |
| **v1.0** | Initial official directory releases under the WordPress publisher account: **Chrome Web Store** and **Safari / Mac App Store** (the two surfaces this codebase already ships). API and permissions surface frozen; deprecation policy locked. | gated by store-listing prep + WordPress Foundation alignment on publisher account |
| **post-1.0** | Expansion to additional browser directories — **Firefox Add-ons (AMO)** (requires a manifest v2/v3 compatibility audit; Firefox's WebExtension surface diverges from Chromium in a few places) and **Edge Add-ons** (typically rides the Chrome Web Store submission, but the WordPress publisher-account question may differ). Ongoing host-detection additions as managed-WordPress platforms ship new signatures. | gated by 1.0 launch signal |

## Pre-1.0 gates

A working list of items the maintainers think need to land before the v1.0 store push — subject to refinement as the work surfaces real dependencies:

- [ ] Audit `manifest.json` `permissions` and `host_permissions` for least-privilege. Document the rationale for each surviving entry in `SECURITY.md`.
- [ ] Xcode project rename: project paths, scheme name, bundle identifier prefix. Tracked in [`SAFARI.md`](SAFARI.md). Requires the Apple Developer account holder's coordination.
- [ ] WordPress publisher account decisions for the v1.0 stores (Chrome Web Store + Apple App Store Connect). Requires WordPress Foundation alignment — see [`MAINTAINERS.md`](MAINTAINERS.md#project-governance-for-non-maintainer-decisions). Firefox / Edge publisher questions can be deferred to post-1.0.
- [ ] Privacy policy URL — both Chrome Web Store and Apple require one even when the extension stores nothing remotely.
- [ ] Store listing copy, promotional images, and per-store icon variants (Chrome + Apple at v1.0; AMO / Edge assets later).

## Intentionally out of scope (for now)

- **A per-site settings page.** Today's model is browser-wide defaults on the extension options page plus per-feature toggles in the popup. A dedicated per-site settings page is a possible v2 feature gated by demonstrated demand.
- **Bundled analytics or telemetry.** The extension is a developer/maintainer tool, not a tracking surface. No remote analytics are shipped.
- **Mobile browsers** (Chrome Android, Safari iOS). Mobile WebExtension support is patchy and the use cases are weaker. Possible post-1.0.
- **Multi-account / profile switching.** Out of scope at v1.0; the extension uses whatever WordPress login the current browser session has.

## Stretch / discussion-stage

Ideas that have surfaced but don't yet have an acceptance criterion live in [Discussions](https://github.com/WordPress/browser-extension/discussions). Promotion to this roadmap follows a maintainer call after discussion stabilizes.
