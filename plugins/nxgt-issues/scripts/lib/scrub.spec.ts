import { describe, expect, test } from 'bun:test';
import {
	buildDenyList,
	type DenyList,
	findDenied,
	scrub,
	transform,
} from './scrub';

/** A hand-written list: whole-word matching only. */
const D = (terms: readonly string[]): DenyList => ({ terms, distinctive: [] });

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
		expect(findDenied('The Secret-App crashed', D(['secret-app']))).toEqual([
			'secret-app',
		]);
		expect(findDenied('use secret-application', D(['secret-app']))).toEqual([]);
		expect(findDenied('mysecret-app', D(['secret-app']))).toEqual([]);
		expect(findDenied('a (secret-app) b', D(['secret-app']))).toEqual([
			'secret-app',
		]);
	});

	test('owner/repo and regex characters are literal', () => {
		expect(
			findDenied('in jane/secret-app.git', D(['jane/secret-app'])),
		).toEqual(['jane/secret-app']);
		expect(findDenied('axb', D(['a.b']))).toEqual([]);
		expect(findDenied('a+b', D(['a+b']))).toEqual(['a+b']);
	});

	test('allow takes a term off', () => {
		expect(findDenied('thing', D(['thing']), ['Thing'])).toEqual([]);
	});

	test('blank and duplicate terms are ignored', () => {
		expect(findDenied('x', D(['', '  ', 'y']))).toEqual([]);
		expect(findDenied('y', D(['y', 'y']))).toEqual(['y']);
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
		expect(new Set(list.terms).size).toBe(list.terms.length);
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
			expect(list.terms).toContain(term);
		}
	});

	test('empty inputs give an empty list', () => {
		expect(buildDenyList({}).terms).toEqual([]);
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
		expect(result.denied).toEqual(
			expect.arrayContaining(['secret-app', 'hidden-two']),
		);
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
		expect(findDenied(text, D(deny))).toEqual(deny);
	});

	test('the underscore is a separator, not a letter', () => {
		expect(findDenied('secret-app_v2', D(deny))).toEqual(deny);
		expect(findDenied('SCHOOLZ_API_URL', D(['schoolz-api']))).toEqual([
			'schoolz-api',
		]);
		expect(findDenied('x_secret-app', D(deny))).toEqual(deny);
	});

	test('a longer word that merely contains the term is not a hit', () => {
		expect(findDenied('mysecret-app', D(deny))).toEqual([]);
		expect(findDenied('mysecretapp and secretapplication', D(deny))).toEqual(
			[],
		);
		expect(findDenied('secret-application', D(deny))).toEqual([]);
		expect(findDenied('the secret of this app', D(deny))).toEqual([]);
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
		expect(
			findDenied('a deer, a b test, a-bc, the wide one', D(short)),
		).toEqual([]);
		expect(findDenied('webcam, deer, cobweb, fabulous', D(short))).toEqual([]);
		expect(findDenied('the web app', D(short))).toEqual(['web']);
		expect(findDenied('Doe said a-b', D(short))).toEqual(['doe', 'a-b']);
		expect(findDenied('w&#101;b', D(short))).toEqual(['web']);
		expect(findDenied('w e b', D(short))).toEqual([]);
	});

	test('allow still takes a term off in a variant', () => {
		expect(findDenied('Secret App', D(deny), ['secret-app'])).toEqual([]);
	});
});

describe('buildDenyList: scoped packages', () => {
	const list = buildDenyList({
		appPackages: ['@jane/billing-core', 'plain-pkg'],
		cwd,
	});

	test('the scope and the bare name are denied too', () => {
		expect(list.terms).toEqual(
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
		).toEqual(['billing-core', 'billing']);
		expect(
			scrub('uses @jane/other-pkg', { cwd, denyList: list }).denied,
		).toEqual(['@jane', 'jane']);
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
		['api_key=abc', 'api-key'],
		['apiKey: abc', 'api-key'],
		['x-api-key: abc', 'api-key'],
		['token: abc', 'token'],
		['Authorization: Bearer abcd1234.ef', 'authorization'],
	])('%p', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toMatch(/hunter2|abc/);
	});

	test('ordinary prose and placeholders pass', () => {
		for (const text of [
			'the passwords table has a token count',
			'tokens: 3',
			'maxToken: 5',
			'tokenTtl: 3600',
			'passwordMinLength: 8',
			'sessionTimeout: 30m',
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
		'db.corp:5432 10.0.0.1 ENOTFOUND x.lan /Users/Jane Doe/p/a.ts \\\\srv\\sh\\f',
		'git@gitlab.corp:t/r.git /api/v1/users/:id password: hunter2',
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

describe('findDenied: camelCase and digits', () => {
	const deny = [
		'schoolz-api',
		'nxgt-federation',
		'zorblax-monorepo',
		'secret-app',
	];

	test.each([
		['SchoolzApiService.handle', 'schoolz-api'],
		['useSchoolzApi()', 'schoolz-api'],
		['schoolzApiClient', 'schoolz-api'],
		['class NxgtFederationGateway', 'nxgt-federation'],
		['zorblaxMonorepoRoot', 'zorblax-monorepo'],
		['MySecretApp', 'secret-app'],
		['secret-app2', 'secret-app'],
		['v2SecretApp', 'secret-app'],
		['SECRETApp', 'secret-app'],
	])('refuses %p', (text, term) => {
		expect(findDenied(text, D(deny))).toEqual([term]);
	});

	test('upper-to-upper+lower seam: APIClient reads as API Client', () => {
		expect(findDenied('APIClient', D(['api-client']))).toEqual(['api-client']);
	});

	test('words that merely contain the term stay clean', () => {
		expect(
			findDenied('mysecretapp, secretary, Schoolzapiary', D(deny)),
		).toEqual([]);
	});

	test('short terms do not use the camelCase pass', () => {
		expect(findDenied('WebServer, jsonDoeX', D(['web', 'doe']))).toEqual([]);
	});

	test('slash and percent-encoding', () => {
		expect(findDenied('schoolz/api', D(['schoolz-api']))).toEqual([
			'schoolz-api',
		]);
		expect(findDenied('schoolz%2Dapi', D(['schoolz-api']))).toEqual([
			'schoolz-api',
		]);
	});
});

describe('buildDenyList: scope, hostname, domains', () => {
	test('the scope without @, when 4+ characters', () => {
		const list = buildDenyList({ appPackages: ['@alxia/web', '@me/x'] });
		expect(list.terms).toContain('alxia');
		expect(list.terms).toContain('@alxia');
		expect(list.terms).not.toContain('me');
	});

	test('the first label of the hostname, when 4+ characters', () => {
		const list = buildDenyList({ hostname: 'steves-mbp.local' });
		expect(list.terms).toEqual(['steves-mbp.local', 'steves-mbp']);
		expect(findDenied('on steves mbp', list)).toEqual(['steves-mbp']);
		expect(buildDenyList({ hostname: 'mac.lan' }).terms).toEqual(['mac.lan']);
	});

	test('appDomains, as-is and folded', () => {
		const list = buildDenyList({ appDomains: ['api.schoolz.io'] });
		expect(list.terms).toEqual(['api.schoolz.io', 'schoolz.io', 'schoolz']);
		expect(findDenied('call api.schoolz.io now', list)).toEqual([
			...list.terms,
		]);
		expect(findDenied('call api-schoolz-io now', list)).toEqual([
			...list.terms,
		]);
	});
});

describe('transform: hosts', () => {
	test.each([
		['db.prod.internal.corp:5432', '<host>'],
		['connecting to 10.12.0.4:27017', 'connecting to <host>'],
		['mongo1.internal:27017', '<host>'],
		['ENOTFOUND mongo1.prod.billing.lan', 'ENOTFOUND <host>'],
		[
			'getaddrinfo ENOTFOUND mongo1.prod.billing.lan.',
			'getaddrinfo ENOTFOUND <host>.',
		],
		['getaddrinfo EAI_AGAIN db.corp', 'getaddrinfo EAI_AGAIN <host>'],
		['getaddrinfo db.corp', 'getaddrinfo <host>'],
		['peer 192.168.1.20 down', 'peer <host> down'],
		[
			'peer fe80::1 and ::1 and 2001:db8:0:0:0:0:0:1',
			'peer <host> and <host> and <host>',
		],
		['[::1]:8080', '<host>'],
	])('%p', (text, expected) => {
		expect(transform(text, cwd).text).toBe(expected);
	});

	test('code, versions, times and traces are not hosts', () => {
		for (const text of [
			'process.env and Promise.all',
			'at a.ts:12:5 and index.js:2000',
			'v1.2.3 and 1.2.3.999 at 12:30:45',
			'localhost:3000 and std::vector',
			'https://github.com/o/r and https://registry.npmjs.org/p',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
	});

	test('idempotent', () => {
		const once = transform('db.corp:5432 10.0.0.1 ENOTFOUND x.lan', cwd).text;
		expect(transform(once, cwd).text).toBe(once);
	});
});

describe('scrub: credentials, wider', () => {
	test.each([
		['DB_PASS=hunter2', 'pass'],
		['secret_key: abc', 'secret'],
		['DB_CREDENTIALS=abc', 'credentials'],
		['private_key = abc', 'private-key'],
		['privateKey: abc', 'private-key'],
		['auth: abc123', 'auth'],
		['Authorization: Basic dXNlcjpwdw==', 'authorization'],
		['Authorization: token ghx12345', 'authorization'],
		['curl -H "Authorization: Bearer abcd1234efgh"', 'authorization'],
		['uses Bearer abcd1234efgh', 'bearer'],
		['-----BEGIN RSA PRIVATE KEY-----', 'private-key-block'],
		['-----BEGIN PRIVATE KEY-----', 'private-key-block'],
		['password: <hunter2>x', 'password'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
	});

	test.each([
		'The bearer token is read from the header',
		'Bearer tokens expire',
		'Bearer authentication',
		'password: string;',
		'interface Opts { token: string; secret?: string }',
		'pass the token = undefined',
		'set apiKey: process.env.KEY',
		'Error: password: required',
		'token: <redacted>',
		'password: ****',
		'secret: string[]',
		'const author: Person; bypass: true; compass: the one',
		'Authorization: Bearer token',
		'token: import.meta.env.TOKEN',
	])('%p passes', (text) => {
		const result = scrub(text, {});
		expect(result.secrets).toEqual([]);
		expect(result.refused).toBe(false);
	});
});

describe('transform: urls and routes', () => {
	test('a kept URL survives the entropy rule intact', () => {
		for (const url of [
			'https://github.com/softistx/nxgt-core/issues/123',
			'https://github.com/softistx/nxgt-core/pull/123/files',
			'https://www.npmjs.com/package/@nxgt/shared-hono-something/v/1.2.3',
		]) {
			expect(transform(`see ${url} now`, cwd).text).toBe(`see ${url} now`);
		}
	});

	test('a random run in a kept URL query is still a token', () => {
		const out = transform(
			'https://github.com/o/r?x=aB3dE6gH9jK2mN5pQ8sT1vW4yZ7bC0dF3gH6',
			cwd,
		).text;
		expect(out).toBe('https://github.com/o/r?<token>');
	});

	test('routes survive; paths with a root, ~ or an extension do not', () => {
		for (const text of [
			'/api/v1/users/:id',
			'route /users/me/settings',
			'GET /api/v1/users/42 failed',
			'and/or /usr/local/bin/node',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
		expect(transform('see /api/v1/openapi.json', cwd).text).toBe('see <app>/…');
		expect(transform('see ~/notes/todo', cwd).text).toBe('see <app>/…');
		expect(transform(`${cwd}/src/dir`, cwd).text).toBe('<app>/src/dir');
		expect(transform('see /home/jane/x/y', cwd).text).toBe('see <app>/…');
	});
});

describe('transform: more paths and remotes', () => {
	test('a POSIX home folder with a space', () => {
		const out = transform('at /Users/Jane Doe/proj/x.ts:3', cwd).text;
		expect(out).toBe('at <app>/…:3');
		expect(transform('/home/Jane Q Public/a', cwd).text).not.toMatch(
			/Jane|Public/,
		);
	});

	test('a UNC path', () => {
		expect(
			transform('open \\\\fileserver\\share\\team\\x.txt now', cwd).text,
		).toBe('open <app>/… now');
		expect(transform('a\\\\b\\c', cwd).text).toBe('a\\\\b\\c');
	});

	test('the scp form of a remote', () => {
		expect(
			transform('clone git@gitlab.internal.corp:team/billing-app.git', cwd)
				.text,
		).toBe('clone <url>');
		expect(transform('git@github.com:softistx/nxgt-core.git', cwd).text).toBe(
			'git@github.com:softistx/nxgt-core.git',
		);
		expect(transform('mail jane@example.com: hi', cwd).text).toBe(
			'mail <email>: hi',
		);
	});
});

describe('buildDenyList: product stem and sibling domains', () => {
	const list = buildDenyList({
		appRepo: 'softistx/schoolz-api',
		appPackages: ['@schoolz/web', 'schoolz-admin-ui', '@jane/billing-core'],
		privateRepos: ['softistx/hidden-service', 'quiet-worker'],
		appDomains: ['api.schoolz.io', 'www.example.co.uk'],
	});

	test('stems of 4+ characters, without generic words', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining(['schoolz', 'schoolz-admin-ui', 'billing']),
		);
		for (const generic of [
			'api',
			'web',
			'core',
			'ui',
			'service',
			'worker',
			'admin',
		]) {
			expect(list.terms).not.toContain(generic);
		}
		expect(list.terms).toContain('@schoolz/web');
		expect(list.terms).not.toContain('web');
	});

	test('registrable domains and main labels', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining([
				'api.schoolz.io',
				'schoolz.io',
				'www.example.co.uk',
				'example.co.uk',
				'example',
			]),
		);
		expect(list.terms).not.toContain('co.uk');
	});

	// Without the scope of `@schoolz/web`, which already denies `schoolz`.
	const sibling = buildDenyList({
		appRepo: 'softistx/schoolz-api',
		appDomains: ['api.schoolz.io'],
	});

	test.each([
		'deployed at app.schoolz.io and schoolz.io',
		'In Schoolz we call this on every request',
		'Could not resolve host: git.schoolz.io',
		'MongoServerSelectionError: mongo-0.mongo.schoolz.svc.cluster.local',
		'connect ECONNREFUSED schoolz-redis:6379',
		'contact jane.doe%40schoolz.io',
		'https%3A%2F%2Fapp.schoolz.io%2Fv1',
	])('refuses %p', (text) => {
		// Refused, or rewritten so that nothing of the name is left.
		const result = scrub(text, { denyList: sibling });
		expect(result.refused || !/schoolz/i.test(result.text)).toBe(true);
	});

	test('allowing a package allows its stems', () => {
		const result = scrub('the hidden thing', {
			denyList: list,
			allow: ['hidden-service'],
		});
		expect(result.refused).toBe(false);
	});

	test('a short name half is not denied, the scope is', () => {
		const scoped = buildDenyList({ appPackages: ['@schoolz/web'] });
		expect(scoped.terms).toEqual(['@schoolz/web', '@schoolz', 'schoolz']);
	});
});

describe('transform: single-label host:port', () => {
	test.each([
		['connect schoolz-redis:6379', 'connect <host>'],
		['mongo1:27017 down', '<host> down'],
		['db-primary:5432', '<host>'],
	])('%p', (text, expected) => {
		expect(transform(text, cwd).text).toBe(expected);
	});

	test('a denied label, however plain', () => {
		expect(
			transform('at schoolz:6379', cwd, (label) => label === 'schoolz').text,
		).toBe('at <host>');
		expect(transform('at schoolz:6379', cwd).text).toBe('at schoolz:6379');
	});

	test('localhost, files, clocks and traces stay', () => {
		for (const text of [
			'localhost:3000',
			'a.ts:12',
			'at 12:30 and UTC-12:30',
			'schema.graphql:12 and x.proto:3 and a.sql:40',
			'err-at foo-bar:12:5',
			'key: 5000',
		]) {
			expect(transform(text, cwd).text).toBe(text);
		}
	});
});

describe('scrub: credentials under unknown names', () => {
	test.each([
		['PGPASSWORD=hunter2 psql', 'password'],
		['REDISPASS=hunter2', 'pass'],
		['dbpassword=hunter2', 'password'],
		['mysql -u root --password hunter2', 'password'],
		['tool --token=abc123', 'token'],
		['tool --api-key abc123', 'api-key'],
		['tool --secret s3cr3t', 'secret'],
		['mysql -u root -phunter2 db', 'password'],
		['Cookie: session=s%3AabcDEF123.sig', 'cookie'],
		['Set-Cookie: sid=abc123def456', 'cookie'],
		['Authorization: AbCdEfGhIjKl12345', 'authorization'],
		['Bearer AbCdEfGhIjKlMnOpQrSt', 'bearer'],
		['{\n  "password":\n    "hunter2"\n}', 'password'],
		['password:\n  hunter2', 'password'],
		['password: a hunter2', 'password'],
		['password: the hunter2 here', 'password'],
		['the secret: it fails2', 'secret'],
		['pwd: the cwd9', 'pwd'],
		['sessionId: abc123', 'session'],
		['sid=abc123def456', 'sid'],
		['oauth_token: abc', 'auth'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toMatch(/hunter2|abc123/);
	});

	test.each([
		// Lower-case prose of two or more words after a label passes (round 3 of #246).
		'the secret: it fails',
		'pwd: the cwd',
		'password: string',
		'Bearer tokens expire',
		'apiKey: process.env.KEY',
		'Error: password: required',
		'inside: 5, bypass: x, compass: north, author: Jane, authority: high',
		'password:\n  type: string',
		'"password": {\n  "x": 1\n}',
		'tokenTtl: 3600 and passwordMinLength: 8 and maxToken: 5',
		'Cookie: <redacted>',
		'mysql -u root -p',
		'ls -pla and tool --token',
		'Bearer authentication',
	])('%p passes', (text) => {
		expect(scrub(text, {}).secrets).toEqual([]);
	});
});

describe('findDenied: the application stem glued to a suffix', () => {
	const list = buildDenyList({
		appRepo: 'softistx/schoolz-api',
		appPackages: ['@alxia/web'],
		privateRepos: ['jane/hidden-service'],
		appDomains: ['api.schoolz.io'],
	});

	test.each([
		'E11000 duplicate key error collection: schoolzdb.users index: email_1',
		'database schoolzprod',
		'bucket schoolzuploads',
		'queue schoolzjobs',
		'schoolztest',
		'myschoolz',
		'ns: alxiadb.users',
		'SchoolzDB, SCHOOLZPROD',
	])('refuses %p', (text) => {
		expect(scrub(text, { denyList: list }).refused).toBe(true);
	});

	test('the single-label host rule sees it too', () => {
		const result = scrub('connect schoolzdb:5432 now', { denyList: list });
		expect(result.text).toBe('connect <host> now');
		expect(result.refused).toBe(false);
	});

	test('private repositories, their stems and short or generic terms stay whole-word', () => {
		for (const text of ['hiddenstuff', 'webapp', 'alxi']) {
			expect(scrub(text, { denyList: list }).refused).toBe(false);
		}
		expect(scrub('hidden-service', { denyList: list }).refused).toBe(true);
	});

	test('the substring matching survives a JSON round-trip and a copy', () => {
		const cached = JSON.parse(JSON.stringify(list)) as DenyList;
		expect(cached.distinctive.length).toBeGreaterThan(0);
		for (const copy of [cached, { ...list }, structuredClone(list)]) {
			expect(findDenied('schoolzdb', copy)).not.toEqual([]);
			expect(scrub('database schoolzprod', { denyList: copy }).refused).toBe(
				true,
			);
		}
	});

	test('a hand-written list is whole-word only', () => {
		expect(findDenied('schoolzdb', D(['schoolz']))).toEqual([]);
	});
});

describe('scrub: ordinary filings with a realistic deny-list', () => {
	const list = buildDenyList({
		appRepo: 'softistx/schoolz-api',
		appPackages: ['@alxia/web'],
		privateRepos: [
			'jane/secret-app',
			'nxgt-federation',
			'quiet-gateway',
			'zorblax-ledger',
		],
	});

	test('private repositories are denied by name and by distinctive stem', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining(['secret-app', 'nxgt-federation', 'zorblax']),
		);
		for (const stem of ['secret', 'nxgt', 'federation', 'quiet', 'gateway']) {
			expect(list.terms).not.toContain(stem);
		}
		expect(list.terms).toEqual(
			expect.arrayContaining(['alxia', '@alxia', 'schoolz']),
		);
	});

	test.each([
		'`gatewaySecret(...)` throws when the secret is shorter than 16 characters',
		'the client secret is rejected by Hydra',
		'`assertGatewaySecret` compares in constant time',
		'JWT secret rotation breaks verify',
		'The federation gateway forwards X-User-Id',
		'const token = await getToken(c)',
		'const session = await ory.toSession()',
		'password: z.string().min(8)',
		'token: ctx.token',
		'secret: config.secret',
		"apiKey: c.req.header('x-api-key')",
		'Cookie: ory_kratos_session=<redacted>',
		'Set-Cookie: a=<redacted>; b=<redacted>',
	])('%p passes', (text) => {
		const result = scrub(text, {
			denyList: list,
			allow: ['@nxgt/shared-hono'],
		});
		expect({ text, denied: result.denied, secrets: result.secrets }).toEqual({
			text,
			denied: [],
			secrets: [],
		});
	});

	test('the app stem and the private names still refuse', () => {
		for (const text of [
			'schoolz crashed',
			'secret-app crashed',
			'NxgtFederation',
		]) {
			expect(scrub(text, { denyList: list }).refused).toBe(true);
		}
	});

	test('real values still refuse', () => {
		for (const text of [
			'token: hunter2',
			'secret: abc.def1',
			'password: z.hunter2',
			'apiKey: sk-abc123',
			'Cookie: ory_kratos_session=abc123',
		]) {
			expect(scrub(text, {}).refused).toBe(true);
		}
	});
});

describe('scrub: quantity exemption is per whole word', () => {
	test.each([
		'ADMIN_PASSWORD=1234',
		'ACCOUNT_PASSWORD=4821',
		'MANAGER_TOKEN=9999',
		'adminToken=5555',
		'ADMIN_PASSWORD=20240101d',
		'tokenTtl: 1234567d',
		'DB_PASSWORD=Xk9$mP(2qL',
		'DB_PASSWORD="aB3$(xyz"',
		'MONGO_PASSWORD=Kq7.Zp2(',
		'REDIS_PASSWORD=abc$def(1',
		'password: (hunter2)',
		'password: getpass(hunter2',
	])('%p refuses', (text) => {
		expect(scrub(text, {}).refused).toBe(true);
	});

	test.each([
		'tokenTtl: 3600',
		'PASSWORD_MIN_LENGTH=8',
		'maxToken: 5',
		'sessionTimeout: 30m',
		'tokens: 3',
	])('%p passes', (text) => {
		expect(scrub(text, {}).refused).toBe(false);
	});
});

describe('scrub: more credential shapes', () => {
	test.each([
		['curl -u admin:hunter2 https://github.com/o/r', 'basic-auth'],
		['curl -s --user admin:hunter2 x', 'basic-auth'],
		['redis-cli -a hunter2', 'password'],
		["'password' => 'hunter2'", 'password'],
		[":password => 'hunter2'", 'password'],
		['passphrase=hunter2', 'passphrase'],
		['DB_PW=hunter2', 'pw'],
		['pw=hunter2', 'pw'],
		['password: wrong hunter2', 'password'],
		['password: missing, real one is hunter2', 'password'],
		['-----BEGIN PGP PRIVATE KEY BLOCK-----', 'private-key-block'],
		['password：hunter2', 'password'],
		['password&#61;hunter2', 'password'],
		['pass%77ord=hunter2', 'password'],
	])('%p refuses', (text, keyword) => {
		const result = scrub(text, {});
		expect(result.refused).toBe(true);
		expect(result.secrets).toContain(keyword);
		expect(JSON.stringify(result.secrets)).not.toContain('hunter2');
	});

	test.each([
		['glpat-' + 'a1B2c3D4e5F6g7H8i9J0'],
		['xoxb-' + '123456789012-abcdefABCDEF'],
		['sk_live_' + 'a1B2c3D4e5F6g7H8'],
		['sk_test_' + 'a1B2c3D4e5F6g7H8'],
		['rk_live_' + 'a1B2c3D4e5F6g7H8'],
		['AIza' + 'SyA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q'],
		['ya29.' + 'a0AfH6SMBx1B2c3D4e5F6g7H8'],
		['SG.' + 'a1B2c3D4e5F6g7H8i9.J0k1L2m3N4o5P6q7R8'],
	])('provider token %p is replaced', (token) => {
		const result = transform(`see ${token} end`, cwd);
		expect(result.text).toBe('see <token> end');
		expect(result.changes).toContain('token');
	});

	test('wrong, required and the like still pass alone', () => {
		for (const text of [
			'password: wrong',
			'password: required;',
			'password: required',
		]) {
			expect(scrub(text, {}).secrets).toEqual([]);
		}
	});
});
