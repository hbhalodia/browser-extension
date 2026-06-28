/**
 * Context-aware label for the edit row. `editable` controls whether we use
 * the live verb (resolving or resolved) or the disabled fallback.
 */
export function editLabel(ctx, editable) {
	if (!editable) return editDisabledLabel(ctx);
	if (ctx.pageType === 'term') {
		if (ctx.taxonomy === 'category') return chrome.i18n.getMessage('edit_category'); // "Edit Category"
		if (ctx.taxonomy === 'post_tag') return chrome.i18n.getMessage('edit_tag'); // "Edit Tag"
		return chrome.i18n.getMessage('edit_term'); // "Edit Term"
	}
	if (ctx.pageType === 'author') return chrome.i18n.getMessage('edit_author'); // "Edit Author"
	// Template-backed views (block themes) edit a site-editor template, not a
	// post. Checked before `ctx.postType` so a post-type archive reads as a
	// template edit rather than "Edit Book".
	if (ctx.pageType === 'home') return chrome.i18n.getMessage('edit_blog_template'); // "Edit Blog Template"
	if (ctx.pageType === 'archive') return chrome.i18n.getMessage('edit_archive_template'); // "Edit Archive Template"
	if (ctx.postType) return chrome.i18n.getMessage('edit_post_type', [postTypeLabel(ctx.postType)]); // "Edit {Post|Page|…}"
	return chrome.i18n.getMessage('edit_page_fallback'); // "Edit Page"
}

/**
 * Label for the disabled edit row. `info.isBlockTheme` (when known) lets the
 * template-backed cases be honest about *why* editing is unavailable rather
 * than dangling a "Coming Soon" promise:
 *   - false → classic theme; its templates are PHP, not site-editor content.
 *   - true  → block theme, but no matching template was found.
 *   - null  → couldn't determine (not an admin, REST disabled).
 */
export function editDisabledLabel(ctx, info = {}) {
	if (ctx.pageType === 'archive' || ctx.pageType === 'home') {
		if (info.isBlockTheme === false) return chrome.i18n.getMessage('edit_unavailable_classic'); // "Editing Not Available (Classic Theme)"
		if (info.isBlockTheme === true) return chrome.i18n.getMessage('edit_template_not_found'); // "Template Not Found"
		return chrome.i18n.getMessage('edit_unavailable'); // "Editing Not Available"
	}
	if (ctx.pageType === 'term') return chrome.i18n.getMessage('edit_term_not_resolvable'); // "Edit Term (Not Resolvable)"
	if (ctx.pageType === 'author') return chrome.i18n.getMessage('edit_author_not_resolvable'); // "Edit Author (Not Resolvable)"
	if (ctx.pageType === 'search' || ctx.pageType === '404') return chrome.i18n.getMessage('nothing_to_edit'); // "Nothing to Edit"
	// Single object the user can't edit (capability-gated) — keep the real
	// type so the greyed-out row still reads "Edit Post" / "Edit Product".
	if (ctx.postType) return chrome.i18n.getMessage('edit_post_type', [postTypeLabel(ctx.postType)]); // "Edit {Post|Page|…}"
	return chrome.i18n.getMessage('edit_page_fallback'); // "Edit Page"
}

/**
 * Turns a WP post type slug into a human-readable label. Built-in types get
 * friendly names; custom post type slugs are title-cased. For CPTs whose
 * registered label differs significantly from their slug (e.g. "kb_article"
 * → "Knowledge Base Article"), this won't be perfect — a REST lookup to
 * /wp/v2/types could resolve that in the future.
 */
export function postTypeLabel(postType) {
	switch (postType) {
		case 'post':
			return chrome.i18n.getMessage('post_type_post'); // "Post"
		case 'page':
			return chrome.i18n.getMessage('post_type_page'); // "Page"
		case 'attachment':
			return chrome.i18n.getMessage('post_type_media'); // "Media"
		case 'wp_block':
			return chrome.i18n.getMessage('post_type_block_pattern'); // "Block Pattern"
		case 'wp_template':
			return chrome.i18n.getMessage('post_type_template'); // "Template"
		case 'wp_template_part':
			return chrome.i18n.getMessage('post_type_template_part'); // "Template Part"
		case 'wp_navigation':
			return chrome.i18n.getMessage('post_type_navigation_menu'); // "Navigation Menu"
		default:
			return postType.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
	}
}
