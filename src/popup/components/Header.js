import { Badge } from '@wordpress/ui';
import { update, postComments } from '@wordpress/icons';
import { HostBadge } from './HostBadge';
import { StatusBadge } from './StatusBadge';
import { UserMenu } from './UserMenu';

export function Header({
	hostname,
	host = null,
	wpVersion = null,
	loggedIn = false,
	origin = null,
	baseUrl = null,
	url = null,
	updateCount = null,
	commentCount = null,
	siteIconUrl = null,
	userAvatarUrl = null,
	userDisplayName = null,
	userEditProfileHref = null,
	isSuperAdmin = false,
	logoutUrl = null,
	user = null,
	onOpen,
}) {
	const hasStatus = (updateCount && updateCount > 0) || (commentCount && commentCount > 0);
	const showMeta = host || wpVersion;
	// Carries any subdirectory prefix for synthesized admin links (#33).
	const base = baseUrl || origin;
	return (
		<header className="wpd-header">
			<div className="wpd-header__top">
				<h1 className="wpd-header__title" title={hostname}>
					{siteIconUrl && (
						<img
							className="wpd-header__site-icon"
							src={siteIconUrl}
							alt=""
							loading="lazy"
							referrerPolicy="no-referrer"
							onError={(e) => { e.currentTarget.style.display = 'none'; }}
						/>
					)}
					<span className="wpd-header__hostname">{hostname}</span>
				</h1>
				{loggedIn && (
					<UserMenu
						avatarUrl={userAvatarUrl}
						displayName={userDisplayName}
						origin={origin}
						baseUrl={base}
						url={url}
						logoutUrl={logoutUrl}
						editProfileUrl={userEditProfileHref}
						isSuperAdmin={isSuperAdmin}
						user={user}
					/>
				)}
			</div>
			{showMeta && (
				<div className="wpd-header__meta">
					{host && <HostBadge host={host} />}
					{wpVersion && <Badge intent="none">WordPress {wpVersion}</Badge>}
				</div>
			)}
			{hasStatus && origin && (
				<div className="wpd-header__status">
					{updateCount > 0 && (
						<StatusBadge
							icon={update}
							label={chrome.i18n.getMessage(updateCount === 1 ? 'update_singular' : 'update_plural', [String(updateCount)]) /* "1 update" / "N updates" */}
							intent="medium"
							onClick={() => onOpen?.(`${base}/wp-admin/update-core.php`)}
						/>
					)}
					{commentCount > 0 && (
						<StatusBadge
							icon={postComments}
							label={chrome.i18n.getMessage(commentCount === 1 ? 'pending_comment_singular' : 'pending_comment_plural', [String(commentCount)]) /* "1 pending comment" / "N pending comments" */}
							intent="informational"
							onClick={() =>
								onOpen?.(`${base}/wp-admin/edit-comments.php?comment_status=moderated`)
							}
						/>
					)}
				</div>
			)}
		</header>
	);
}
