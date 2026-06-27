import { useEffect, useState } from 'react';
import { requestCurrentUser } from '../lib/actions';

/**
 * Fetches the current user once (`/wp/v2/users/me?context=edit`) and shares
 * the result. Used both for the header's role label and for capability-gating
 * the Edit / WordPress Admin actions, so we fetch in one place and pass the
 * user down rather than letting each consumer request it.
 *
 * Returns `null` until the request resolves (and if it fails). Consumers must
 * treat `null` as "unknown" — never as "no capabilities".
 */
export function useCurrentUser(enabled = true) {
	const [user, setUser] = useState(null);

	useEffect(() => {
		if (!enabled) return undefined;
		let cancelled = false;
		requestCurrentUser().then((u) => {
			if (!cancelled) setUser(u);
		});
		return () => {
			cancelled = true;
		};
	}, [enabled]);

	return user;
}
