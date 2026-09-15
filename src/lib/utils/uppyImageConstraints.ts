/**
 * Applies the site's media upload constraints to an Uppy instance.
 *
 * Registered as a pre-processor so it runs after a file is selected and before
 * XHRUpload sends it: an oversized image is swapped for a resized copy in
 * place, and one that breaks a min/max resolution rule is dropped with a toast.
 *
 * This is the admin-next counterpart of the Dropzone resize classic admin has
 * always done, reading the same `pagemedia` config. See `imageResize.ts`.
 */

import type { Uppy } from '@uppy/core';
import { toast } from 'svelte-sonner';
import { prefs } from '$lib/stores/preferences.svelte';
import { applyUploadConstraints, hasResizeConstraints } from './imageResize';

export function useUploadConstraints(uppy: Uppy): void {
	uppy.addPreProcessor(async (fileIDs: string[]) => {
		const settings = prefs.mediaUpload;
		if (!hasResizeConstraints(settings)) return;

		for (const id of fileIDs) {
			const file = uppy.getFile(id);
			const data = file?.data;
			if (!data || !(data instanceof Blob)) continue;

			const source =
				data instanceof File
					? data
					: new File([data], file.name ?? 'upload', { type: file.type });

			const outcome = await applyUploadConstraints(source, settings);

			if (outcome.error) {
				uppy.removeFile(id);
				toast.error(`${file.name}: ${outcome.error}`);
				continue;
			}
			if (outcome.resized) {
				uppy.setFileState(id, { data: outcome.file, size: outcome.file.size });
			}
		}
	});
}
