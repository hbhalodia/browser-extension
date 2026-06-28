import { useState } from 'react';
import { Collapsible, Icon } from '@wordpress/ui';
import { chevronDown, globe, dashboard, close } from '@wordpress/icons';
import { useMySites } from '../hooks/useMySites';
import { runAction, isNewTabIntent } from '../lib/actions';

/**
 * Global launcher for WordPress sites the user has logged into — a persistent,
 * curated list backed by wp_my_sites_v1 (see lib/my-sites.js). Rendered at the
 * popup root so it's available in every state, including on non-WordPress and
 * internal pages. Hidden entirely until there's at least one site.
 *
 * Row click → front-end; the dashboard button → wp-admin; Cmd/Ctrl/middle-click
 * either → new tab (#29). An Edit toggle reveals per-row rename + remove.
 */
export function MySites() {
	const { sites, remove, rename, ready, displayName } = useMySites();
	const [open, setOpen] = useState(false);
	const [editing, setEditing] = useState(false);

	// Hidden until the store has resolved and holds at least one site.
	if (!ready || sites.length === 0) return null;

	return (
		<Collapsible.Root open={open} onOpenChange={setOpen} className="wpd-siteinfo wpd-mysites">
			<Collapsible.Trigger className="wpd-siteinfo__trigger">
				<span className="wpd-siteinfo__label-group">
					<Icon icon={globe} size={16} />
					<span className="wpd-siteinfo__label">
						{chrome.i18n.getMessage('my_sites_label') /* "My Sites" */}
					</span>
				</span>
				<span className={`wpd-siteinfo__chevron ${open ? 'is-open' : ''}`} aria-hidden="true">
					<Icon icon={chevronDown} size={14} />
				</span>
			</Collapsible.Trigger>
			<Collapsible.Panel className="wpd-siteinfo__panel">
				<div className="wpd-siteinfo__body wpd-mysites__body">
					{sites.map((site) => (
						<MySiteRow
							key={site.origin}
							site={site}
							label={displayName ? displayName(site) : site.origin}
							editing={editing}
							onRemove={remove}
							onRename={rename}
						/>
					))}
					<div className="wpd-mysites__footer">
						<button
							type="button"
							className="wpd-mysites__edit-toggle"
							onClick={() => setEditing((v) => !v)}
						>
							{editing
								? chrome.i18n.getMessage('my_sites_done') /* "Done" */
								: chrome.i18n.getMessage('my_sites_edit') /* "Edit" */}
						</button>
					</div>
				</div>
			</Collapsible.Panel>
		</Collapsible.Root>
	);
}

function MySiteRow({ site, label, editing, onRemove, onRename }) {
	const { origin } = site;
	const baseUrl = site.baseUrl || origin;
	let host = origin;
	try {
		host = new URL(origin).host;
	} catch (_) {
		/* keep origin */
	}

	const visit = (event) =>
		runAction('visit-site', { origin, baseUrl, url: '', newTab: isNewTabIntent(event) });
	const admin = (event) =>
		runAction('admin', { origin, baseUrl, url: '', newTab: isNewTabIntent(event) });

	if (editing) {
		return (
			<div className="wpd-card-row wpd-mysites__row--edit">
				<input
					className="wpd-mysites__rename"
					type="text"
					defaultValue={site.customName || ''}
					placeholder={host}
					aria-label={chrome.i18n.getMessage('my_sites_rename_placeholder') /* "Custom name" */}
					onBlur={(e) => onRename(origin, e.target.value)}
					onKeyDown={(e) => {
						if (e.key === 'Enter') e.target.blur();
					}}
				/>
				<button
					type="button"
					className="wpd-card__aux-btn wpd-mysites__remove"
					onClick={() => onRemove(origin)}
					aria-label={chrome.i18n.getMessage('my_sites_remove') /* "Remove site" */}
					title={chrome.i18n.getMessage('my_sites_remove') /* "Remove site" */}
				>
					<Icon icon={close} size={16} />
				</button>
			</div>
		);
	}

	return (
		<div className="wpd-card-row">
			<button
				type="button"
				className="wpd-card__main"
				onClick={visit}
				onAuxClick={visit}
				title={host}
			>
				<span className="wpd-card__icon" aria-hidden="true">
					<Icon icon={globe} size={20} />
				</span>
				<span className="wpd-card__label">{label}</span>
			</button>
			<div className="wpd-card__aux">
				<button
					type="button"
					className="wpd-card__aux-btn"
					onClick={admin}
					onAuxClick={admin}
					aria-label={chrome.i18n.getMessage('wordpress_admin') /* "WordPress Admin" */}
					title={chrome.i18n.getMessage('wordpress_admin') /* "WordPress Admin" */}
				>
					<Icon icon={dashboard} size={16} />
				</button>
			</div>
		</div>
	);
}
