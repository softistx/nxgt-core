import { describe, expect, test } from 'bun:test';
import { buildDenyList, findDenied, scrub, transform } from './scrub';

const cwd = '/Users/jane/work/secret-app';

describe('transform: paths', () => {
	test('a path under the cwd becomes <app>/…', () => {
		expect(transform(`at ${cwd}/src/a.ts:12:5`, cwd).text).toBe(
			'at <app>/src/a.ts:12:5',
		);
	});

	test('node_modules is kept from the last node_modules', () => {
		expect(
			transform(
				'at /Users/jane/work/secret-app/node_modules/@nxgt/x/dist/a.js',
				cwd,
			).text,
		).toBe('at node_modules/@nxgt/x/dist/a.js');
		expect(
			transform('/a/node_modules/b/node_modules/c/index.js', cwd).text,
		).toBe('node_modules/c/index.js');
	});

	test('any other absolute path is generic', () => {
		expect(transform('see /Users/jane/other/thing.ts for it', cwd).text).toBe(
			'see <app>/… for it',
		);
		expect(transform('(/home/jane/x/y)', undefined).text).toBe('(<app>/…)');
	});

	test('a Windows path', () => {
		expect(transform('at C:\\Users\\jane\\app\\a.ts', undefined).text).toBe(
			'at <app>/…',
		);
		expect(transform('C:\\app\\node_modules\\p\\i.js', undefined).text).toBe(
			'node_modules/p/i.js',
		);
	});

	test('relative paths, prose slashes and URLs are left to their own rules', () => {
		expect(transform('use src/a.ts and/or b', cwd).text).toBe(
			'use src/a.ts and/or b',
		);
		expect(
			transform('see https://github.com/softistx/nxgt-core/issues/1', cwd).text,
		).toBe('see https://github.com/softistx/nxgt-core/issues/1');
	});

	test('trailing punctuation stays outside the path', () => {
		expect(transform(`failed in ${cwd}/a.ts.`, cwd).text).toBe(
			'failed in <app>/a.ts.',
		);
	});
});

describe('transform: emails, urls, tokens', () => {
	test('emails', () => {
		const result = transform('mail jane.doe+x@example.co.uk now', cwd);
		expect(result.text).toBe('mail <email> now');
		expect(result.changes).toContain('email');
	});

	test('foreign urls go, github and npm stay', () => {
		expect(
			transform(
				'a https://internal.corp/x?y=1, b https://github.com/o/r c https://www.npmjs.com/package/p d https://registry.npmjs.org/p e http://localhost:3000/x',
				cwd,
			).text,
		).toBe(
			'a <url>, b https://github.com/o/r c https://www.npmjs.com/package/p d https://registry.npmjs.org/p e <url>',
		);
	});

	test('a lookalike host is foreign', () => {
		expect(transform('https://github.com.evil.io/x', cwd).text).toBe('<url>');
	});

	test.each([
		['ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['gho_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['github_pat_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['npm_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
		['AKIA' + 'ABCDEFGHIJKLMNOP'],
		['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0In0.SflKxwRJSMeKKF2QT4fw'],
	])('token %p', (token) => {
		const result = transform(`key=${token} end`, cwd);
		expect(result.text).toBe('key=<token> end');
		expect(result.changes).toContain('token');
	});

	test('a long random-looking run is a token; ordinary long words are not', () => {
		expect(
			transform('x aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6 y', cwd).text,
		).toBe('x <token> y');
		expect(
			transform('supercalifragilisticexpialidocioushypothetically', cwd).text,
		).toBe('supercalifragilisticexpialidocioushypothetically');
		expect(transform('a'.repeat(40), cwd).text).toBe('a'.repeat(40));
	});

	test('a token inside a url is removed before the url is judged', () => {
		const result = transform(
			'https://github.com/o/r?token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2',
			cwd,
		);
		expect(result.text).not.toContain('ghp_');
	});

	test('clean text is untouched and reports no change', () => {
		const result = transform('createThing([]) throws TypeError in v1.2.3', cwd);
		expect(result.text).toBe('createThing([]) throws TypeError in v1.2.3');
		expect(result.changes).toEqual([]);
	});
});

describe('findDenied', () => {
	test('whole words, case-insensitive', () => {
		expect(findDenied('The Secret-App crashed', ['secret-app'])).toEqual([
			'secret-app',
		]);
		expect(findDenied('use secret-application', ['secret-app'])).toEqual([]);
		expect(findDenied('mysecret-app', ['secret-app'])).toEqual([]);
		expect(findDenied('a (secret-app) b', ['secret-app'])).toEqual([
			'secret-app',
		]);
	});

	test('owner/repo and regex characters are literal', () => {
		expect(findDenied('in jane/secret-app.git', ['jane/secret-app'])).toEqual([
			'jane/secret-app',
		]);
		expect(findDenied('axb', ['a.b'])).toEqual([]);
		expect(findDenied('a+b', ['a+b'])).toEqual(['a+b']);
	});

	test('allow takes a term off', () => {
		expect(findDenied('thing', ['thing'], ['Thing'])).toEqual([]);
	});

	test('blank and duplicate terms are ignored', () => {
		expect(findDenied('x', ['', '  ', 'y'])).toEqual([]);
		expect(findDenied('y', ['y', 'y'])).toEqual(['y']);
	});
});

describe('buildDenyList', () => {
	test('collects every source, deduplicated', () => {
		const list = buildDenyList({
			appRepo: 'jane/secret-app',
			appPackages: ['@jane/web', 'secret-app'],
			cwd: '/Users/jane/work/secret-app/',
			privateRepos: ['jane/private-one', 'hidden-two'],
			gitName: 'Jane Doe',
			gitEmail: 'jane@example.com',
			hostname: 'janes-mbp',
			home: '/Users/jane',
		});
		expect(list).toEqual(
			[
				'jane/secret-app',
				'secret-app',
				'@jane/web',
				'private-one',
				'jane/private-one',
				'hidden-two',
				'Jane Doe',
				'jane@example.com',
				'janes-mbp',
				'/Users/jane',
			].sort((a, b) => list.indexOf(a) - list.indexOf(b)),
		);
		expect(new Set(list).size).toBe(list.length);
		for (const term of [
			'jane/secret-app',
			'secret-app',
			'@jane/web',
			'private-one',
			'hidden-two',
			'Jane Doe',
			'jane@example.com',
			'janes-mbp',
			'/Users/jane',
		]) {
			expect(list).toContain(term);
		}
	});

	test('empty inputs give an empty list', () => {
		expect(buildDenyList({})).toEqual([]);
	});
});

describe('scrub', () => {
	const denyList = buildDenyList({
		appRepo: 'jane/secret-app',
		cwd,
		gitName: 'Jane Doe',
		hostname: 'janes-mbp',
		privateRepos: ['jane/hidden-two'],
	});

	test('a clean report passes, transformed', () => {
		const result = scrub(`Fails at ${cwd}/src/a.ts:3 for jane@example.com`, {
			cwd,
			denyList,
		});
		expect(result.text).toBe('Fails at <app>/src/a.ts:3 for <email>');
		expect(result.changes).toEqual(['email', 'path']);
		expect(result.refused).toBe(false);
		expect(result.denied).toEqual([]);
	});

	test('a deny-list hit after the transforms refuses the filing', () => {
		const result = scrub('Our secret-app uses it with hidden-two', {
			cwd,
			denyList,
		});
		expect(result.refused).toBe(true);
		expect(result.denied).toEqual(['secret-app', 'hidden-two']);
	});

	test('a name that only appeared inside a path is gone by verification', () => {
		const result = scrub(`${cwd}/src/a.ts`, { cwd, denyList });
		expect(result.refused).toBe(false);
	});

	test('a name outside the cwd path is caught', () => {
		const result = scrub('error in /srv/other/secret-app/x.ts', {
			cwd,
			denyList,
		});
		expect(result.text).toBe('error in <app>/…');
		expect(result.refused).toBe(false);
		expect(
			scrub('Jane Doe reported on janes-mbp', { cwd, denyList }).denied,
		).toEqual(['Jane Doe', 'janes-mbp']);
	});

	test('allow lets the reported package through', () => {
		const result = scrub('secret-app is the package', {
			denyList,
			allow: ['secret-app'],
		});
		expect(result.refused).toBe(false);
	});

	test('no deny-list means no refusal', () => {
		expect(scrub('anything', {}).refused).toBe(false);
	});
});
