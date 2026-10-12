import { type CatalogueSource, checkCatalogueSource } from '../node/load';

/** The module's options, under `nxgtI18n` in `nuxt.config.ts`. */
export interface ModuleOptions extends CatalogueSource {
	/** The cookie that stores a chosen locale. Default `'language'`, as `@nxgt/i18n`'s `LANGUAGE_KEY`. */
	readonly cookie?: string;
	/**
	 * `true` loads every locale but the fallback one on demand: each is a
	 * chunk of its own, and the plugin runs `setupLazyNuxtI18n`. Default
	 * `false`: the plugin holds every catalogue.
	 */
	readonly lazy?: boolean;
}

const COOKIE = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

/** Refuses options that cannot be right, with a `TypeError` starting `nxgtI18n:`. */
export function checkModuleOptions(
	options: unknown,
): asserts options is ModuleOptions {
	checkCatalogueSource('nxgtI18n', options);
	const { cookie, lazy } = options as ModuleOptions;
	if (
		cookie !== undefined &&
		(typeof cookie !== 'string' || !COOKIE.test(cookie))
	) {
		throw new TypeError(
			"nxgtI18n: cookie must be a cookie name, as 'language'",
		);
	}
	if (lazy !== undefined && typeof lazy !== 'boolean') {
		throw new TypeError(
			"nxgtI18n: lazy must be true or false, as { locales: ['en', 'fr'], lazy: true }",
		);
	}
}
