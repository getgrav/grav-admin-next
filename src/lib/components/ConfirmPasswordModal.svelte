<script lang="ts">
	/**
	 * A small "Confirm it's you" dialog that asks for the signed-in user's
	 * current password before a sensitive change goes out (today: changing your
	 * own email address on the user page).
	 *
	 * The password lives only in this component's state while the dialog is
	 * open. It is handed to `onconfirm`, which sends the request and answers with
	 * an error to show (the dialog stays open) or null (the caller closes it).
	 * The field is cleared after every try, and again when the dialog closes, so
	 * it never outlives the request.
	 */
	import { i18n } from '$lib/stores/i18n.svelte';
	import PasswordField from '$lib/components/ui/PasswordField.svelte';
	import { Button } from '$lib/components/ui/button';
	import { LockKeyhole, Loader2 } from 'lucide-svelte';
	import { portal } from '$lib/utils/portal';

	interface Props {
		open: boolean;
		/** The account's username, for password managers. */
		username: string;
		title: string;
		message: string;
		confirmLabel?: string;
		/** Sends the request. Answers with an error to show, or null when done. */
		onconfirm: (password: string) => Promise<string | null>;
		oncancel: () => void;
	}

	let {
		open,
		username,
		title,
		message,
		confirmLabel = i18n.t('ADMIN_NEXT.CONFIRM'),
		onconfirm,
		oncancel
	}: Props = $props();

	const INPUT_ID = 'confirm-password-current';

	let password = $state('');
	let error = $state('');
	let busy = $state(false);
	let dialogEl = $state<HTMLDivElement | null>(null);

	function focusInput() {
		queueMicrotask(() => document.getElementById(INPUT_ID)?.focus());
	}

	// Focus goes to the password field when the dialog opens and back to where
	// it was when it closes. Closing also drops whatever was typed.
	$effect(() => {
		if (!open || !dialogEl) return;
		const previous = document.activeElement as HTMLElement | null;
		focusInput();
		return () => {
			password = '';
			error = '';
			if (previous && previous.isConnected) previous.focus();
		};
	});

	async function handleSubmit(e: SubmitEvent) {
		e.preventDefault();
		if (busy || password === '') return;
		busy = true;
		error = '';
		const typed = password;
		password = '';
		try {
			error = (await onconfirm(typed)) ?? '';
		} finally {
			busy = false;
		}
		if (error) focusInput();
	}

	function cancel() {
		if (!busy) oncancel();
	}

	function handleBackdrop(e: MouseEvent) {
		if (e.target === e.currentTarget) cancel();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			e.preventDefault();
			cancel();
			return;
		}
		// Keep Tab inside the dialog rather than wandering off into the page behind it.
		if (e.key === 'Tab' && dialogEl) {
			const items = Array.from(
				dialogEl.querySelectorAll<HTMLElement>(
					'input:not([disabled]):not([hidden]), button:not([disabled]):not([tabindex="-1"])'
				)
			);
			if (items.length === 0) return;
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement as HTMLElement | null;
			if (!active || !dialogEl.contains(active)) {
				e.preventDefault();
				first.focus();
			} else if (e.shiftKey && active === first) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		}
	}
</script>

<svelte:window onkeydown={open ? handleKeydown : undefined} />

{#if open}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div
		use:portal
		class="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/75 p-4 backdrop-blur-sm"
		onclick={handleBackdrop}
	>
		<div
			bind:this={dialogEl}
			role="dialog"
			aria-modal="true"
			aria-labelledby="confirm-password-title"
			aria-describedby="confirm-password-message"
			class="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-2xl"
		>
			<form onsubmit={handleSubmit} novalidate>
				<!-- A username field lets password managers tell which account this is. -->
				<input
					type="text"
					name="username"
					autocomplete="username"
					value={username}
					hidden
					readonly
				/>
				<div class="flex gap-4">
					<div
						class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10"
					>
						<LockKeyhole size={20} class="text-primary" />
					</div>
					<div class="min-w-0 flex-1">
						<h3 id="confirm-password-title" class="text-base font-semibold text-foreground">
							{title}
						</h3>
						<p
							id="confirm-password-message"
							class="mt-1.5 text-sm break-words text-muted-foreground"
						>
							{message}
						</p>
						<div class="mt-4">
							<PasswordField
								id={INPUT_ID}
								name="current-password"
								label={i18n.t('ADMIN_NEXT.USERS.PASSWORD.CURRENT')}
								value={password}
								onchange={(v) => {
									password = v;
									if (error) error = '';
								}}
								policy={null}
								autocomplete="current-password"
								showMeter={false}
								showHint={false}
								invalid={!!error}
								invalidMessage={error}
								disabled={busy}
							/>
						</div>
					</div>
				</div>
				<div class="mt-5 flex justify-end gap-2">
					<Button type="button" variant="outline" size="sm" onclick={cancel} disabled={busy}>
						{i18n.t('ADMIN_NEXT.CANCEL')}
					</Button>
					<Button type="submit" size="sm" disabled={busy || password === ''}>
						{#if busy}
							<Loader2 size={14} class="me-1.5 animate-spin" />
						{/if}
						{confirmLabel}
					</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
