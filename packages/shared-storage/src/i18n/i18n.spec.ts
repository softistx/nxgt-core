import { describe, expect, test } from 'bun:test';
import { translate } from './i18n';

// Every message key the services throw, read from their source, so a key
// added there without a translation fails here.
const SERVICES = ['storage.service.ts', 'gridfs.service.ts'];
const keys = new Set<string>();
for (const file of SERVICES) {
	const source = await Bun.file(
		new URL(`../services/${file}`, import.meta.url),
	).text();
	for (const match of source.matchAll(
		/'((?:storage|files)?\.?errors\.[a-z-]+)'/g,
	)) {
		if (match[1]) keys.add(match[1]);
	}
}

describe('translations of the thrown keys', () => {
	test('the services throw keys at all', () => {
		expect(keys.size).toBeGreaterThan(10);
	});

	for (const language of ['en', 'fr'] as const) {
		test.each([...keys])(`%s has a ${language} sentence`, (key) => {
			const text = translate(key as never, { key: 'a.txt' }, language);
			expect(text).not.toBe(key);
		});
	}

	test.each([...keys])(
		'%s is translated into French, not left in English',
		(key) => {
			const en = translate(key as never, { key: 'a.txt' }, 'en');
			const fr = translate(key as never, { key: 'a.txt' }, 'fr');
			expect(fr).not.toBe(en);
		},
	);
});
