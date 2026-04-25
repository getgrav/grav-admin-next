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

	// -- Dashboard --
	'ADMIN_NEXT.DASHBOARD.CUSTOMIZE': 'Customize',
	'ADMIN_NEXT.DASHBOARD.CUSTOMIZE_TITLE': 'Customize dashboard',
	'ADMIN_NEXT.DASHBOARD.EDIT_HINT': 'Customize mode — drag, resize, hide widgets, then save.',
	'ADMIN_NEXT.DASHBOARD.PRESETS': 'Presets',
	'ADMIN_NEXT.DASHBOARD.SAVE_SITE_DEFAULT': 'Save as site default',
	'ADMIN_NEXT.DASHBOARD.RESET_LAYOUT': 'Reset my layout',
	'ADMIN_NEXT.DASHBOARD.ADD_WIDGET': 'Add a widget',
	'ADMIN_NEXT.DASHBOARD.HIDE_WIDGET': 'Hide widget',
	'ADMIN_NEXT.DASHBOARD.PICKER_TITLE': 'Add a widget',
	'ADMIN_NEXT.DASHBOARD.PICKER_SUBTITLE': 'Pick a widget to add back to your dashboard.',
	'ADMIN_NEXT.DASHBOARD.PICKER_EMPTY': 'All available widgets are already on your dashboard.',
	'ADMIN_NEXT.DASHBOARD.EMPTY': 'Your dashboard is empty',
	'ADMIN_NEXT.DASHBOARD.EMPTY_HINT': 'Click the pencil icon above to add widgets',
	'ADMIN_NEXT.DASHBOARD.LAYOUT_SAVED': 'Dashboard layout saved',
	'ADMIN_NEXT.DASHBOARD.SITE_LAYOUT_SAVED': 'Site default saved',
	'ADMIN_NEXT.DASHBOARD.LAYOUT_RESET': 'Layout reset to default',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.STATS': 'Site Stats',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.POPULARITY': 'Page Views',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.SYSTEM_HEALTH': 'System Health',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.RECENT_PAGES': 'Recent Pages',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.TOP_PAGES': 'Top Pages',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.BACKUPS': 'Backups',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.NOTIFICATIONS': 'Notifications',
	'ADMIN_NEXT.DASHBOARD.WIDGETS.NEWS_FEED': 'News Feed',
	'ADMIN_NEXT.DASHBOARD.PRESET_DEFAULT': 'Default',
	'ADMIN_NEXT.DASHBOARD.PRESET_DEFAULT_DESC': 'Server-recommended layout — clears your customizations.',
	'ADMIN_NEXT.DASHBOARD.PRESET_MINIMAL': 'Minimal',
	'ADMIN_NEXT.DASHBOARD.PRESET_MINIMAL_DESC': 'Stats and recent pages only.',
	'ADMIN_NEXT.DASHBOARD.PRESET_COMPACT': 'Compact',
	'ADMIN_NEXT.DASHBOARD.PRESET_COMPACT_DESC': 'All widgets at the smallest size each supports.',

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
	'ADMIN_NEXT.PAGES.MODE_NORMAL': 'Normal',
	'ADMIN_NEXT.PAGES.MODE_EXPERT': 'Expert',
	'ADMIN_NEXT.PAGES.FRONTMATTER': 'Frontmatter',

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

	// -- Languages / Multilang --
	'ADMIN_NEXT.LANG.SWITCH_LANGUAGE': 'Switch content language',
	'ADMIN_NEXT.LANG.TRANSLATIONS': 'Translations',
	'ADMIN_NEXT.LANG.TRANSLATED': 'Translated',
	'ADMIN_NEXT.LANG.NOT_TRANSLATED': 'Not translated',
	'ADMIN_NEXT.LANG.SAVE_AS': 'Save as {language}',
	'ADMIN_NEXT.LANG.CREATE_TRANSLATION': 'Create {language} translation',
	'ADMIN_NEXT.LANG.FALLBACK_NOTICE': 'No {language} translation. Showing default content.',
	'ADMIN_NEXT.LANG.SYNC_FROM': 'Reset from {language}',
	'ADMIN_NEXT.LANG.TRANSLATION_CREATED': '{language} translation created',
	'ADMIN_NEXT.LANG.DELETE_TRANSLATION': 'Delete {language} translation',
	'ADMIN_NEXT.LANG.CURRENT': 'current',
	'ADMIN_NEXT.LANG.DEFAULT': 'default',

	// -- Time --
	'ADMIN_NEXT.TIME.JUST_NOW': 'just now',
	'ADMIN_NEXT.TIME.MINUTES_AGO': '{n}m ago',
	'ADMIN_NEXT.TIME.HOURS_AGO': '{n}h ago',
	'ADMIN_NEXT.TIME.DAYS_AGO': '{n}d ago',
};

export default en;
