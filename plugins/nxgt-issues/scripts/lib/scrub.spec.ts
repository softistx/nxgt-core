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
		expect(result.secrets).toEqual([]);
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
		).toEqual(['Jane Doe', 'Jane', 'Doe', 'janes-mbp']);
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

describe('findDenied: separators and variants', () => {
	const deny = ['secret-app'];

	test.each([
		['secret_app'],
		['SECRET_APP_URL'],
		['secret app'],
		['Secret App'],
		['secretApp'],
		['SecretApp'],
		['secret.app'],
		['secret--app'],
		['\uFF53\uFF45\uFF43\uFF52\uFF45\uFF54-app'],
		['secret\u2010app'],
		['secret\u2011app'],
		['secret\u2212app'],
		['sec\u200Bret-app'],
		['sec\u00ADret-app'],
		['secret\\-app'],
		['secret&#45;app'],
		['secret&#x2d;app'],
		['secret&hyphen;app'],
		['secret-<!-- -->app'],
		['sec<!-- x -->ret-app'],
		['use `secret_app` here'],
	])('refuses %p', (text) => {
		expect(findDenied(text, deny)).toEqual(deny);
	});

	test('the underscore is a separator, not a letter', () => {
		expect(findDenied('secret-app_v2', deny)).toEqual(deny);
		expect(findDenied('SCHOOLZ_API_URL', ['schoolz-api'])).toEqual([
			'schoolz-api',
		]);
		expect(findDenied('x_secret-app', deny)).toEqual(deny);
	});

	test('a longer word that merely contains the term is not a hit', () => {
		expect(findDenied('mysecret-app', deny)).toEqual([]);
		expect(findDenied('mysecretapp and secretapplication', deny)).toEqual([]);
		expect(findDenied('secret-application', deny)).toEqual([]);
		expect(findDenied('the secret of this app', deny)).toEqual([]);
	});

	test('a git name is caught by part, order, spacing and line breaks', () => {
		const list = buildDenyList({ gitName: 'Jane Doe' });
		for (const text of [
			'Jane  Doe',
			'Jane\nDoe',
			'Doe, Jane',
			'doe,jane',
			'JaneDoe',
			'by Jane',
		]) {
			expect(findDenied(text, list).length).toBeGreaterThan(0);
		}
		expect(findDenied('by Jane on Monday', list)).toEqual(['Jane']);
		expect(findDenied('Doe', list)).toEqual(['Doe']);
	});

	test('terms under 4 characters folded stay on the whole-word pass', () => {
		const short = ['web', 'doe', 'a-b'];
		expect(findDenied('a deer, a b test, a-bc, the wide one', short)).toEqual(
			[],
		);
		expect(findDenied('webcam, deer, cobweb, fabulous', short)).toEqual([]);
		expect(findDenied('the web app', short)).toEqual(['web']);
		expect(findDenied('Doe said a-b', short)).toEqual(['doe', 'a-b']);
		expect(findDenied('w&#101;b', short)).toEqual(['web']);
		expect(findDenied('w e b', short)).toEqual([]);
	});

	test('allow still takes a term off in a variant', () => {
		expect(findDenied('Secret App', deny, ['secret-app'])).toEqual([]);
	});
});

describe('buildDenyList: scoped packages', () => {
	const list = buildDenyList({
		appPackages: ['@jane/billing-core', 'plain-pkg'],
		cwd,
	});

	test('the scope and the bare name are denied too', () => {
		expect(list).toEqual(
			expect.arrayContaining([
				'@jane/billing-core',
				'billing-core',
				'@jane',
				'plain-pkg',
			]),
		);
	});

	test('a path through the package, or another package of the scope, refuses', () => {
		expect(
			scrub(`${cwd}/packages/billing-core/src/x.ts failed`, {
				cwd,
				denyList: list,
			}).denied,
		).toEqual(['billing-core']);
		expect(
			scrub('uses @jane/other-pkg', { cwd, denyList: list }).denied,
		).toEqual(['@jane']);
	});
});

describe('transform: other schemes and credentials', () => {
	test.each([
		['redis://cache.internal:6379/0'],
		['mongodb+srv://u:p@cluster0.corp.net/db?x=1'],
		['ws://10.0.0.5:8080/socket'],
		['postgres://admin:pw@db.corp/app'],
		['ssh://git@git.corp/x.git'],
	])('%s becomes <url>', (url) => {
		expect(transform(`connect ${url} now`, cwd).text).toBe('connect <url> now');
	});

	test('userinfo is stripped from a kept host', () => {
		const out = transform('clone https://jane:hunter2@github.com/o/r.', cwd);
		expect(out.text).toBe('clone https://github.com/o/r.');
		expect(out.text).not.toMatch(/jane|hunter2/);
		expect(transform('https://tok@registry.npmjs.org/p', cwd).text).toBe(
			'https://registry.npmjs.org/p',
		);
		expect(transform('https://jane:p@ss@github.com/o/r', cwd).text).toBe(
			'https://github.com/o/r',
		);
	});

	test('file:// urls are paths', () => {
		expect(
			transform(`at file://${cwd}/src/a.ts and file:///Users/jane/x/y.ts`, cwd)
				.text,
		).toBe('at <app>/src/a.ts and <app>/…');
		expect(transform('file:///C:/Users/jane/app/a.ts', cwd).text).toBe(
			'<app>/…',
		);
	});

	test('a path after : or = starting at a known root, and ~/', () => {
		expect(transform('PATH=/opt/tools/bin:/home/jane/bin/x', cwd).text).toBe(
			'PATH=<app>/…:<app>/…',
		);
		expect(transform('cwd=/Users/jane/work/x', cwd).text).toBe('cwd=<app>/…');
		expect(transform('see ~/work/secret/x.ts', cwd).text).toBe('see <app>/…');
		expect(transform('a:/notaroot/x/y', cwd).text).toBe('a:/notaroot/x/y');
	});

	test('unicode path segments', () => {
		const out = transform('at /Users/jöhn/ünï/a.ts:3', cwd).text;
		expect(out).toBe('at <app>/…:3');
		expect(out).not.toContain('jöhn');
	});

	test('Windows paths with spaces lose the user directory', () => {
		for (const text of [
			'C:\\Users\\Jane Doe\\app\\a.ts',
			'at C:\\Users\\Jane Doe',
			'C:\\Users\\jane\\My Projects\\app\\a.ts failed',
		]) {
			const out = transform(text, undefined).text;
			expect(out).not.toMatch(/Jane|Doe|jane/);
			expect(out).toContain('<app>/…');
		}
		expect(
			transform('C:\\Users\\jane\\My Projects\\app\\a.ts failed', undefined)
				.text,
		).toBe('<app>/… failed');
	});
});

describe('scrub: credentials refuse instead of being stripped', () => {
	test.each([
		['password: hunter2', 'password'],
		['PASSWORD=hunter2', 'password'],
		['{"password": "hunter2"}', 'password'],
		['db_pwd = x', 'pwd'],
		['client_secret: abc', 'secret'],
		['api_key=abc', 'api_key'],
		['apiKey: abc', 'apikey'],
		['x-api-key: abc', 'api-key'],
		['token: abc', 'token'],
		['Authorization: Bearer abc.def', 'bearer'],
	])('%p', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toMatch(/hunter2|abc/);
	});

	test('ordinary prose and placeholders pass', () => {
		for (const text of [
			'the passwords table has a token count',
			'maxToken: 5 and tokens: 3',
			'token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2',
			'secrets are stored elsewhere',
		]) {
			expect(scrub(text, {}).secrets).toEqual([]);
		}
		expect(scrub('token=ghp_a1B2c3D4e5F6g7H8i9J0k1L2', {}).refused).toBe(false);
	});
});

describe('transform: idempotence', () => {
	const corpus = [
		`at ${cwd}/src/a.ts:12:5`,
		'see /Users/jane/other/thing.ts for it',
		'C:\\Users\\Jane Doe\\app\\a.ts failed',
		'/a/node_modules/b/node_modules/c/index.js',
		'mail jane@example.com via https://internal.corp/x and https://github.com/o/r',
		'redis://h:6379 file:///Users/jane/x.ts ~/x/y PATH=/opt/a/b',
		'key=ghp_a1B2c3D4e5F6g7H8i9J0k1L2 aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6',
		'https://jane:hunter2@github.com/o/r and plain text, v1.2.3',
		`(${cwd}/a.ts), "${cwd}/b/c.ts".`,
	];

	test.each(corpus)('%p', (text) => {
		const once = transform(text, cwd).text;
		expect(transform(once, cwd).text).toBe(once);
	});
});

describe('transform: git SHAs are kept', () => {
	const sha = '0123456789abcdef0123456789abcdef01234567';

	test('a 40-hex SHA and short SHAs survive', () => {
		expect(transform(`broken since ${sha}.`, cwd).text).toBe(
			`broken since ${sha}.`,
		);
		expect(transform(`fix-${sha} and ${sha}-x`, cwd).changes).toEqual([]);
		expect(transform('at d8dd6fd, 15c1c42ab3 and 0123456789ab', cwd).text).toBe(
			'at d8dd6fd, 15c1c42ab3 and 0123456789ab',
		);
	});

	test('a longer hex run, or a SHA glued to a secret, is still a token', () => {
		expect(transform(`${sha}${sha}`, cwd).text).toBe('<token>');
		expect(
			transform(`${sha}aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6`, cwd).text,
		).toBe('<token>');
	});
});
