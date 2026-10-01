import { describe, expect, it } from 'bun:test';
import { getLanguage, translate } from '@nxgt/i18n';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { languageDetector } from 'hono/language';
import { honoLanguageSource } from './language';

/**
 * What `@nxgt/i18n` did by itself until 2.0, done here: importing this
 * package registers the Hono request's language with `getLanguage()`.
 */
describe('the Hono language source', () => {
	const app = new Hono()
		.use(contextStorage())
		.use(
			languageDetector({
				order: ['header'],
				supportedLanguages: ['en', 'fr'],
				fallbackLanguage: 'en',
				caches: false,
			}),
		)
		.get('/', async (c) => {
			await Bun.sleep(1);
			return c.json({
				language: getLanguage(),
				message: translate('errors.not-found'),
			});
		});

	it("gives getLanguage() the request's language, through every await", async () => {
		const fr = await (
			await app.request('/', { headers: { 'accept-language': 'fr' } })
		).json();
		const en = await (
			await app.request('/', { headers: { 'accept-language': 'en' } })
		).json();
		expect(fr.language).toBe('fr');
		expect(en.language).toBe('en');
		expect(fr.message).not.toBe(en.message);
	});

	it('answers nothing outside a request', () => {
		expect(honoLanguageSource()).toBeUndefined();
		expect(getLanguage()).toBe('en');
	});
});
