import { SUPPORTED_LANGUAGES } from './consts';
import type { Language } from './types';

/**
 * Where a language may come from: a server's request context, a framework's
 * state. It answers the request's language, or nothing — `undefined`, `null`,
 * a language no catalogue has — and the next source is asked.
 */
export type LanguageSource = () => string | null | undefined;

/**
 * One registry for the process, on `globalThis`: an app can hold two copies
 * of this package — one a dependency of `@nxgt/shared-hono`, one its own —
 * and a source registered through either must answer both.
 */
const REGISTRY = Symbol.for('@nxgt/i18n/language-sources');

function registry(): LanguageSource[] {
	const global = globalThis as { [REGISTRY]?: LanguageSource[] };
	global[REGISTRY] ??= [];
	return global[REGISTRY];
}

/**
 * Adds a source `getLanguage()` asks, after those registered before it.
 * Registering one twice keeps one. Answers the function that removes it.
 *
 * This package knows no server: `@nxgt/shared-hono` registers the Hono
 * request context's `language`, `@alxia/i18n` the alxia request's.
 */
export function registerLanguageSource(source: LanguageSource): () => void {
	const sources = registry();
	if (!sources.includes(source)) sources.push(source);
	return () => {
		const index = sources.indexOf(source);
		if (index !== -1) sources.splice(index, 1);
	};
}

/**
 * The first supported language a registered source answers. A source that
 * throws is skipped: a language is never worth a failed request.
 */
export function languageFromSources(): Language | undefined {
	for (const source of registry()) {
		let answer: string | null | undefined;
		try {
			answer = source();
		} catch {
			continue;
		}
		if (SUPPORTED_LANGUAGES.includes(answer as Language)) {
			return answer as Language;
		}
	}
	return undefined;
}
