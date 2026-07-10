---
title: Privacy Policy
permalink: /privacy-policy/
---

# Privacy Policy — WordPress Browser Extension

**Effective date:** July 9, 2026

## Summary

The WordPress Browser Extension detects WordPress sites as you browse and provides shortcuts for signed-in users. Everything it learns stays in your browser. The extension has no servers, collects no analytics, and transmits no data to the extension's developers or to any third party.

## What the extension reads

- **Page content, locally.** To detect whether a site runs WordPress, the extension examines the pages you visit inside your browser (markup signals such as generator tags, body classes, and REST API links). This analysis happens entirely on your device.
- **Sign-in state.** To show the right actions, the extension checks whether a WordPress login cookie is present for the site you are viewing. It reads the presence of the cookie, on your device, to infer signed-in state. Cookie contents are never transmitted anywhere by the extension.
- **Site information you request.** Features such as the Site Information panel request details (active theme, plugins, current user) from the WordPress site you are viewing, using that site's own REST API. These requests go directly from your browser to that site, exactly as if you browsed to it, and the responses are shown to you and discarded or cached locally.

## What the extension stores

Stored in your browser's local extension storage, on your device only:

- Your preferences (for example, admin bar visibility choices and feature toggles)
- A per-site detection cache (whether a site was detected as WordPress, and when), pruned automatically after several weeks of not visiting
- Your "My Sites" list: sites where the extension observed you signed in to WordPress, with optional names you assign

None of this leaves your device. The extension's "Clear all extension data" control on its options page deletes all of it, and uninstalling the extension removes it entirely.

## What the extension transmits

Nothing, to us or to anyone. The extension contains no analytics, telemetry, error reporting, or tracking of any kind. The only network requests it makes are to the WordPress site you are currently viewing (same-origin requests such as the site's REST API), on your behalf, to power the features you invoke.

## What the extension does not do

- No data is sold, shared, or transferred to any party
- No browsing history is collected or transmitted
- No user accounts exist; the extension has no back end
- No remote code is loaded; all code ships in the extension package

## Permissions, in plain terms

The extension asks for access to the sites you visit so it can detect WordPress and offer shortcuts without you clicking anything first; storage to keep your preferences on your device; cookie access to check sign-in state and to power the optional "clear site data" developer tool; and scripting to read the current page's details when you open the popup. A more technical rationale for each permission is documented in the project repository's [SECURITY.md](https://github.com/WordPress/browser-extension/blob/main/SECURITY.md).

## Changes

Changes to this policy will be published at this URL with an updated effective date, and noted in the extension's release notes.

## Contact

The extension is developed in the open at [github.com/WordPress/browser-extension](https://github.com/WordPress/browser-extension). Questions can be raised via GitHub Issues; security concerns follow the process in [SECURITY.md](https://github.com/WordPress/browser-extension/blob/main/SECURITY.md) (private vulnerability reporting).
