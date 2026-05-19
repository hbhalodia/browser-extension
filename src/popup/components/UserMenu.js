import { useEffect, useRef, useState } from 'react';
import { Icon, Popover, VisuallyHidden } from '@wordpress/ui';
import { people, key, keyboardReturn, login, cog } from '@wordpress/icons';
import { runAction, requestCurrentUser } from '../lib/actions';

/**
 * Circular avatar button in the header's top-right. Opens a small popover
 * with account actions: profile + account settings + log out when signed
 * in, or login shortcuts when signed out.
 *
 * Built on @wordpress/ui's Popover primitives — they own positioning,
 * focus management, click-outside, and Escape handling. Each non-
 * destructive menu item is a Popover.Close so activation auto-dismisses;
 * the destructive logout uses a regular button so its two-click confirm
 * can live inside the open popover.
 */
export function UserMenu({ isLoggedIn, avatarUrl, displayName, origin, url, logoutUrl, editProfileUrl, isSuperAdmin = false }) {
	const [open, setOpen] = useState(false);
	const [confirmingLogout, setConfirmingLogout] = useState(false);
	const [restRole, setRestRole] = useState(null);
	const confirmTimerRef = useRef(null);

	// Pre-fetch the role on mount so the dropdown opens with the label
	// already in place. Skipped for super admins (the DOM-derived "Super
	// Admin" badge takes priority and a per-site role would be misleading)
	// and when logged out.
	useEffect(() => {
		if (!isLoggedIn || isSuperAdmin) return;
		let cancelled = false;
		requestCurrentUser().then((user) => {
			if (cancelled) return;
			const slug = Array.isArray(user?.roles) ? user.roles[0] : null;
			if (slug) setRestRole(formatRoleSlug(slug));
		});
		return () => { cancelled = true; };
	}, [isLoggedIn, isSuperAdmin]);

	useEffect(() => {
		if (!open) {
			setConfirmingLogout(false);
			clearTimeout(confirmTimerRef.current);
		}
	}, [open]);

	useEffect(() => () => clearTimeout(confirmTimerRef.current), []);

	// Super admin wins. On multisite a super admin's per-site role is
	// commonly just 'subscriber', so REST would mislabel them.
	const roleLabel = isSuperAdmin ? 'Super Admin' : restRole;

	const profileUrl = editProfileUrl || `${origin}/wp-admin/profile.php`;
	const buttonLabel = isLoggedIn
		? `Account menu${displayName ? ` for ${displayName}` : ''}`
		: 'Account menu';

	const handleLogoutClick = () => {
		if (!confirmingLogout) {
			setConfirmingLogout(true);
			clearTimeout(confirmTimerRef.current);
			confirmTimerRef.current = setTimeout(() => setConfirmingLogout(false), 4000);
			return;
		}
		clearTimeout(confirmTimerRef.current);
		setOpen(false);
		runAction('signout', { origin, url, logoutUrl });
	};

	return (
		<Popover.Root open={open} onOpenChange={setOpen}>
			<Popover.Trigger
				className="wpd-user-menu__button"
				aria-label={buttonLabel}
				title={displayName || buttonLabel}
			>
				{isLoggedIn && avatarUrl ? (
					<img
						className="wpd-user-menu__avatar"
						src={avatarUrl}
						alt=""
						referrerPolicy="no-referrer"
						onError={(e) => {
							e.currentTarget.style.display = 'none';
						}}
					/>
				) : (
					<span className="wpd-user-menu__avatar wpd-user-menu__avatar--placeholder" aria-hidden="true">
						<Icon icon={people} size={16} />
					</span>
				)}
			</Popover.Trigger>
			<Popover.Popup
				className="wpd-user-menu__positioner"
				variant="unstyled"
				align="end"
				sideOffset={8}
			>
				<VisuallyHidden>
					<Popover.Title>Account menu</Popover.Title>
				</VisuallyHidden>
				<div className="wpd-user-menu__dropdown" role="menu">
				{isLoggedIn && displayName && (
					<div className="wpd-user-menu__header">
						<span className="wpd-user-menu__name" title={displayName}>{displayName}</span>
						{roleLabel && (
							<span className="wpd-user-menu__role" title={roleLabel}>{roleLabel}</span>
						)}
					</div>
				)}
				{isLoggedIn ? (
					<>
						<MenuLink
							icon={people}
							label="Profile"
							onClick={() => {
								chrome.tabs.update({ url: profileUrl });
								window.close();
							}}
						/>
						<MenuLink
							icon={cog}
							label="Account Settings"
							onClick={() => {
								chrome.tabs.update({ url: `${origin}/wp-admin/profile.php` });
								window.close();
							}}
						/>
						<button
							type="button"
							role="menuitem"
							className={`wpd-user-menu__item wpd-user-menu__item--destructive ${confirmingLogout ? 'is-active' : ''}`}
							onClick={handleLogoutClick}
						>
							<span className="wpd-user-menu__item-icon" aria-hidden="true">
								<Icon icon={login} size={16} />
							</span>
							<span className="wpd-user-menu__item-label">
								{confirmingLogout ? 'Click again to confirm' : 'Log Out'}
							</span>
						</button>
					</>
				) : (
					<>
						<MenuLink
							icon={key}
							label="Log In"
							onClick={() => runAction('login', { origin, url })}
						/>
						<MenuLink
							icon={keyboardReturn}
							label="Log In, Return to Page"
							onClick={() => runAction('login-return', { origin, url })}
						/>
					</>
				)}
				</div>
			</Popover.Popup>
		</Popover.Root>
	);
}

/**
 * Menu item that closes the popover on activation. Popover.Close handles the
 * dismissal; the onClick runs after the popover is told to close so the
 * subsequent chrome.tabs / window.close calls don't race the popover's own
 * cleanup.
 */
/**
 * Title-cases a WP role slug for display. WP's own `translate_user_role()`
 * runs slugs through i18n; here we just normalize separators and capitalize.
 * "administrator" → "Administrator", "shop_manager" → "Shop Manager".
 */
function formatRoleSlug(slug) {
	if (typeof slug !== 'string' || !slug) return null;
	return slug
		.split(/[-_]+/)
		.filter(Boolean)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(' ');
}

function MenuLink({ icon, label, onClick }) {
	return (
		<Popover.Close
			role="menuitem"
			className="wpd-user-menu__item"
			onClick={onClick}
		>
			<span className="wpd-user-menu__item-icon" aria-hidden="true">
				<Icon icon={icon} size={16} />
			</span>
			<span className="wpd-user-menu__item-label">{label}</span>
		</Popover.Close>
	);
}
