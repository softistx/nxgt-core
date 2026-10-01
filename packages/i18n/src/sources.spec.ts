import { afterEach, describe, expect, it } from 'bun:test';
import { getLanguage, translate } from './i18n';
import { registerLanguageSource } from './sources';

/**
 * Where a server tells `getLanguage()` the request's language, since 2.0:
 * this package reads no framework itself.
 */
const removals: (() => void)[] = [];
const register = (source: () => string | null | undefined) => {
	const remove = registerLanguageSource(source);
	removals.push(remove);
	return remove;
};
afterEach(() => {
	for (const remove of removals.splice(0)) remove();
});

describe('registerLanguageSource', () => {
	it('is asked before localStorage and the fallback', () => {
		register(() => 'fr');
		expect(getLanguage()).toBe('fr');
		expect(translate('errors.not-found')).not.toBe(
			translate('errors.not-found', undefined, 'en'),
		);
	});

	it('asks sources in order, skipping one with no answer, an unsupported one, or a throw', () => {
		register(() => undefined);
		register(() => 'klingon');
		register(() => {
			throw new Error('no context');
		});
		register(() => 'fr');
		expect(getLanguage()).toBe('fr');
	});

	it('removes a source, and keeps one registered twice once', () => {
		const source = () => 'fr';
		const remove = register(source);
		register(source);
		remove();
		expect(getLanguage()).toBe('en');
	});

	it('shares one registry between two copies of the package', async () => {
		const copy = await import(`./sources?copy=${Date.now()}`);
		removals.push(copy.registerLanguageSource(() => 'fr'));
		expect(getLanguage()).toBe('fr');
	});
});
