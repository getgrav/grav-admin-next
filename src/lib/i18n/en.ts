/**
 * English UI strings for admin-next.
 *
 * These are local translations for UI elements that only exist in the
 * new admin interface (not in the Grav core or plugin translations).
 *
 * Convention: use ADMIN_NEXT.SECTION.KEY format.
 * Keep keys alphabetically sorted within each section.
 */
const en: Record<string, string> = {
	// -- General --
	'ADMIN_NEXT.ADD_PAGE': 'Add Page',
	'ADMIN_NEXT.CANCEL': 'Cancel',
	'ADMIN_NEXT.CLEAR_SEARCH': 'Clear search',
	'ADMIN_NEXT.CLOSE': 'Close',
	'ADMIN_NEXT.COLLAPSE_SIDEBAR': 'Collapse sidebar',
	'ADMIN_NEXT.CONFIRM_DELETE': 'Delete "{title}" at {route}?',
	'ADMIN_NEXT.DELETE': 'Delete',
	'ADMIN_NEXT.DONE': 'Done',
	'ADMIN_NEXT.LOADING': 'Loading...',
	'ADMIN_NEXT.NO_CHANGES': 'No changes to save',
	'ADMIN_NEXT.SAVE': 'Save',
	'ADMIN_NEXT.SAVING': 'Saving...',
	'ADMIN_NEXT.SEARCH': 'Search',
	'ADMIN_NEXT.SIGN_OUT': 'Sign out',
	'ADMIN_NEXT.TOGGLE_DARK_MODE': 'Toggle dark mode',
	'ADMIN_NEXT.TOGGLE_MENU': 'Toggle menu',
	'ADMIN_NEXT.UNSAVED_CHANGES': 'Unsaved changes',

	// -- Pages --
	'ADMIN_NEXT.PAGES.TITLE': 'Pages',
	'ADMIN_NEXT.PAGES.SEARCH_PLACEHOLDER': 'Search pages...',
	'ADMIN_NEXT.PAGES.NO_PAGES': 'No pages found',
	'ADMIN_NEXT.PAGES.NO_SEARCH_RESULTS': 'No pages match your search',
	'ADMIN_NEXT.PAGES.LOADING': 'Loading pages...',
	'ADMIN_NEXT.PAGES.REORDER_MOVE': 'Reorder / Move',
	'ADMIN_NEXT.PAGES.REORDER_SAME_PARENT': 'Can only reorder pages under the same parent. Use Tree view for cross-parent moves.',
	'ADMIN_NEXT.PAGES.MOVED': 'Moved "{title}"',
	'ADMIN_NEXT.PAGES.REORDERED': 'Reordered "{title}"',
	'ADMIN_NEXT.PAGES.MOVE_FAILED': 'Failed to move page',
	'ADMIN_NEXT.PAGES.REORDER_FAILED': 'Failed to reorder',
	'ADMIN_NEXT.PAGES.DELETED': 'Deleted "{title}"',
	'ADMIN_NEXT.PAGES.DELETE_FAILED': 'Failed to delete page',
	'ADMIN_NEXT.PAGES.SAVED': 'Page saved successfully',
	'ADMIN_NEXT.PAGES.SAVE_FAILED': 'Failed to save page',

	// -- Pages: View modes --
	'ADMIN_NEXT.PAGES.VIEW_TREE': 'Tree',
	'ADMIN_NEXT.PAGES.VIEW_LIST': 'List',
	'ADMIN_NEXT.PAGES.VIEW_COLUMNS': 'Columns',

	// -- Pages: Table headers --
	'ADMIN_NEXT.PAGES.HEADER_TITLE': 'Title',
	'ADMIN_NEXT.PAGES.HEADER_TEMPLATE': 'Template',
	'ADMIN_NEXT.PAGES.HEADER_STATUS': 'Status',
	'ADMIN_NEXT.PAGES.HEADER_MODIFIED': 'Modified',
	'ADMIN_NEXT.PAGES.HEADER_PARENT': 'Parent',

	// -- Pages: Statuses --
	'ADMIN_NEXT.PAGES.PUBLISHED': 'Published',
	'ADMIN_NEXT.PAGES.DRAFT': 'Draft',

	// -- Pages: Sort options (Miller) --
	'ADMIN_NEXT.PAGES.SORT_ORDER': 'Order',
	'ADMIN_NEXT.PAGES.SORT_TITLE_AZ': 'Title A-Z',
	'ADMIN_NEXT.PAGES.SORT_TITLE_ZA': 'Title Z-A',
	'ADMIN_NEXT.PAGES.SORT_NEWEST': 'Newest',
	'ADMIN_NEXT.PAGES.SORT_OLDEST': 'Oldest',
	'ADMIN_NEXT.PAGES.SORT_DATE_NEWEST': 'Date (newest)',

	// -- Pages: Editor --
	'ADMIN_NEXT.PAGES.RAW_HEADER': 'Raw Page Header (JSON)',
	'ADMIN_NEXT.PAGES.PAGE_INFO': 'Page Info',
	'ADMIN_NEXT.PAGES.EDIT_PAGE': 'Edit Page',

	// -- Pages: Sidebar info --
	'ADMIN_NEXT.PAGES.INFO_PUBLISHED': 'Published',
	'ADMIN_NEXT.PAGES.INFO_VISIBLE': 'Visible in nav',
	'ADMIN_NEXT.PAGES.INFO_ROUTABLE': 'Routable',
	'ADMIN_NEXT.PAGES.INFO_ROUTE': 'Route',
	'ADMIN_NEXT.PAGES.INFO_SLUG': 'Slug',
	'ADMIN_NEXT.PAGES.INFO_TEMPLATE': 'Template',
	'ADMIN_NEXT.PAGES.INFO_LANGUAGE': 'Language',
	'ADMIN_NEXT.PAGES.INFO_ORDER': 'Order',
	'ADMIN_NEXT.PAGES.INFO_DATE': 'Date',
	'ADMIN_NEXT.PAGES.INFO_MODIFIED': 'Modified',
	'ADMIN_NEXT.PAGES.INFO_PUBLISH_ON': 'Publish on',
	'ADMIN_NEXT.PAGES.INFO_UNPUBLISH_ON': 'Unpublish on',

	// -- Blueprint fields --
	'ADMIN_NEXT.FIELDS.CLEAR_DATE': 'Clear date',
	'ADMIN_NEXT.FIELDS.REGENERATE_SLUG': 'Auto-regenerate from page title',
	'ADMIN_NEXT.FIELDS.ADD_ENTRY': 'Add entry',
	'ADMIN_NEXT.FIELDS.NO_TAXONOMY_TYPES': 'No taxonomy types configured',
	'ADMIN_NEXT.FIELDS.FILE_PICKER_SOON': 'File picker — coming soon',

	// -- Dashboard --
	'ADMIN_NEXT.DASHBOARD.TITLE': 'Dashboard',

	// -- Navigation --
	'ADMIN_NEXT.NAV.DASHBOARD': 'Dashboard',
	'ADMIN_NEXT.NAV.CONFIGURATION': 'Configuration',
	'ADMIN_NEXT.NAV.PAGES': 'Pages',
	'ADMIN_NEXT.NAV.MEDIA': 'Media',
	'ADMIN_NEXT.NAV.USERS': 'Users',
	'ADMIN_NEXT.NAV.PLUGINS': 'Plugins',
	'ADMIN_NEXT.NAV.THEMES': 'Themes',
	'ADMIN_NEXT.NAV.TOOLS': 'Tools',
	'ADMIN_NEXT.NAV.SYSTEM': 'System',
	'ADMIN_NEXT.NAV.SETTINGS': 'Settings',

	// -- Time --
	'ADMIN_NEXT.TIME.JUST_NOW': 'just now',
	'ADMIN_NEXT.TIME.MINUTES_AGO': '{n}m ago',
	'ADMIN_NEXT.TIME.HOURS_AGO': '{n}h ago',
	'ADMIN_NEXT.TIME.DAYS_AGO': '{n}d ago',
};

export default en;
