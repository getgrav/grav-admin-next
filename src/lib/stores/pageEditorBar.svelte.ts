/**
 * Topbar slot store for the page editor.
 *
 * The page edit route (src/routes/pages/edit/[...route]/+page.svelte) writes
 * its presence + mode-toggle handles here so AppShell can render them in the
 * top header. This avoids cramming everything into the page's local toolbar.
 *
 * Both slots clear on route teardown so the topbar reverts on every other
 * page in the app.
 */

import type { Peer, SyncStatus } from '$lib/sync/SyncProvider';

export interface PresenceState {
	peers: Peer[];
	clientId: string;
	status: SyncStatus;
	detail: string | undefined;
}

export interface ModeToggle {
	onNormal: () => void;
	onExpert: () => void;
}

let presence = $state<PresenceState | null>(null);
let modeToggle = $state<ModeToggle | null>(null);

export const pageEditorBar = {
	get presence() { return presence; },
	get modeToggle() { return modeToggle; },
	setPresence(v: PresenceState | null) { presence = v; },
	setModeToggle(v: ModeToggle | null) { modeToggle = v; },
};
