import { api } from '../client';

export interface TranslationsResponse {
	lang: string;
	count: number;
	checksum: string;
	strings: Record<string, string>;
}

export async function getTranslations(lang: string, prefix?: string): Promise<TranslationsResponse> {
	const params: Record<string, string> = {};
	if (prefix) params.prefix = prefix;
	return api.get<TranslationsResponse>(`/translations/${lang}`, params);
}
