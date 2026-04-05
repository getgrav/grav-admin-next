import { api } from '../client';
import type { PageDetail } from './pages';

export interface LanguageInfo {
	code: string;
	name: string;
	native_name: string;
	rtl: boolean;
	is_default: boolean;
}

export interface SiteLanguages {
	enabled: boolean;
	languages: LanguageInfo[];
	default: string | null;
	active: string | null;
}

export interface PageTranslationStatus {
	route: string;
	default_language: string | null;
	translated: Record<string, string>;
	untranslated: string[];
}

export interface CompareResult {
	route: string;
	source: {
		lang: string;
		exists: boolean;
		title: string;
		content: string;
		header: Record<string, unknown>;
		modified: string | null;
	} | null;
	target: {
		lang: string;
		exists: boolean;
		title: string;
		content: string;
		header: Record<string, unknown>;
		modified: string | null;
	} | null;
}

export async function getSiteLanguages(): Promise<SiteLanguages> {
	return api.get<SiteLanguages>('/languages');
}

export async function getPageTranslations(route: string): Promise<PageTranslationStatus> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.get<PageTranslationStatus>(`/pages/${cleanRoute}/languages`);
}

export async function createTranslation(
	route: string,
	body: { lang: string; title?: string; content?: string; header?: Record<string, unknown> }
): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/translate`, body);
}

export async function syncTranslation(
	route: string,
	sourceLang: string,
	targetLang: string
): Promise<PageDetail> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.post<PageDetail>(`/pages/${cleanRoute}/sync`, {
		source_lang: sourceLang,
		target_lang: targetLang,
	});
}

export async function compareTranslations(
	route: string,
	source: string,
	target: string
): Promise<CompareResult> {
	const cleanRoute = route.startsWith('/') ? route.slice(1) : route;
	return api.get<CompareResult>(`/pages/${cleanRoute}/compare`, { source, target });
}
