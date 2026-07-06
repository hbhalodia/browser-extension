import { useEffect, useRef } from 'react';

/**
 * Safari popup only: when a collapsible panel opens, the popup no longer grows
 * to fit it — it is locked to its baseline height and scrolls internally (see
 * App.js useSafariPopupLock). So a panel opened below the fold reveals its rows
 * off-screen. Scroll the panel's header to the top of the popup so the freshly
 * revealed content is visible without a manual scroll.
 *
 * No-op on Chrome, where the popup grows to fit and no scroll is needed.
 *
 * Usage:
 *   const triggerRef = usePanelReveal(open);
 *   <Collapsible.Trigger ref={triggerRef} ... />
 */
export function usePanelReveal(open) {
	const ref = useRef(null);
	const wasOpen = useRef(open);
	const armed = useRef(false);

	// Arm only after the popup has settled and (on Safari) locked its baseline
	// height. Before that the popup still grows to fit, so an opening panel needs
	// no scroll — and this skips hydration / persisted opens (e.g. Developer
	// Tools restoring its open state from storage) that would otherwise scroll
	// on mount and fight the baseline measurement.
	useEffect(() => {
		const t = setTimeout(() => { armed.current = true; }, 400);
		return () => clearTimeout(t);
	}, []);

	useEffect(() => {
		const justOpened = open && !wasOpen.current;
		wasOpen.current = open;
		if (!justOpened || !armed.current) return;
		// navigator.vendor is 'Apple Computer, Inc.' only on Safari.
		if (navigator.vendor !== 'Apple Computer, Inc.') return;
		const el = ref.current;
		if (!el || typeof el.scrollIntoView !== 'function') return;
		// Defer one frame so the expand has begun laying out before we scroll.
		requestAnimationFrame(() => {
			el.scrollIntoView({ block: 'start', behavior: 'smooth' });
		});
	}, [open]);

	return ref;
}
