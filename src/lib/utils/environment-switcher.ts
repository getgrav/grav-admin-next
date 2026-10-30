/**
 * Whether the top bar shows the environment switcher. On a site with no
 * environments it can only say "Default", so it shows only to users who could
 * create one. It always shows while an environment is selected, so it stays
 * clear where saves go.
 */
export function environmentSwitcherVisible(opts: {
	/** The selected environment; '' = Default (base user/config). */
	target: string;
	/** The site's environments, as GET /system/environments lists them ('' = Default). */
	environments: { name: string }[];
	/** Whether this user can write config, and so create an environment. */
	canManage: boolean;
}): boolean {
	if (opts.target !== '') return true;
	if (opts.environments.some((e) => e.name !== '')) return true;
	return opts.canManage;
}
