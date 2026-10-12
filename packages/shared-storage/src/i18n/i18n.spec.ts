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
	for (const match of source.matchAll(/'((?:[a-z]+\.)?errors\.[a-z0-9-]+)'/g)) {
		if (match[1]) keys.add(match[1]);
	}
}

describe('translations of the thrown keys', () => {
	// The exact set: a key the regex stops seeing fails here, not silently.
	test('the services throw exactly these keys', () => {
		expect([...keys].sort()).toEqual([
			'errors.could-not-use-first-and-last-together',
			'files.errors.file-not-found',
			'files.errors.file-not-found-after-rename',
			'storage.errors.delete-failed',
			'storage.errors.exists-failed',
			'storage.errors.fetch-failed',
			'storage.errors.file-failed',
			'storage.errors.file-not-found',
			'storage.errors.list-failed',
			'storage.errors.presign-failed',
			'storage.errors.size-failed',
			'storage.errors.stat-failed',
			'storage.errors.unlink-failed',
			'storage.errors.write-failed',
		]);
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
