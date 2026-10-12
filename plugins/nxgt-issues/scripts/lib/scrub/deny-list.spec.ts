import { describe, expect, test } from 'bun:test';
import { buildDenyList, type DenyList, findDenied, scrub } from './scrub';

/** A hand-written list: whole-word matching only. */
const D = (terms: readonly string[]): DenyList => ({ terms, distinctive: [] });

const cwd = '/Users/jane/work/secret-app';

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
		expect(findDenied('VEXORA_API_URL', D(['vexora-api']))).toEqual([
			'vexora-api',
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
		).toEqual(['billing-core']);
		expect(
			scrub('uses @jane/other-pkg', { cwd, denyList: list }).denied,
		).toEqual(['@jane', 'jane']);
	});
});

describe('findDenied: camelCase and digits', () => {
	const deny = [
		'vexora-api',
		'quillon-federation',
		'zorblax-monorepo',
		'secret-app',
	];

	test.each([
		['VexoraApiService.handle', 'vexora-api'],
		['useVexoraApi()', 'vexora-api'],
		['vexoraApiClient', 'vexora-api'],
		['class QuillonFederationGateway', 'quillon-federation'],
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
		expect(findDenied('mysecretapp, secretary, Vexoraapiary', D(deny))).toEqual(
			[],
		);
	});

	test('short terms do not use the camelCase pass', () => {
		expect(findDenied('WebServer, jsonDoeX', D(['web', 'doe']))).toEqual([]);
	});

	test('slash and percent-encoding', () => {
		expect(findDenied('vexora/api', D(['vexora-api']))).toEqual(['vexora-api']);
		expect(findDenied('vexora%2Dapi', D(['vexora-api']))).toEqual([
			'vexora-api',
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
		const list = buildDenyList({ appDomains: ['api.vexora.io'] });
		expect(list.terms).toEqual(['api.vexora.io', 'vexora.io', 'vexora']);
		expect(findDenied('call api.vexora.io now', list)).toEqual([...list.terms]);
		expect(findDenied('call api-vexora-io now', list)).toEqual([...list.terms]);
	});
});

describe('buildDenyList: product stem and sibling domains', () => {
	const list = buildDenyList({
		appRepo: 'softistx/vexora-api',
		appPackages: ['@vexora/web', 'vexora-admin-ui', '@jane/billing-core'],
		privateRepos: ['softistx/hidden-service', 'quiet-worker'],
		appDomains: ['api.vexora.io', 'www.example.co.uk'],
	});

	test('stems of 4+ characters, without generic or common words', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining(['vexora', 'vexora-admin-ui', 'billing-core']),
		);
		for (const generic of [
			'billing',
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
		expect(list.terms).toContain('@vexora/web');
		expect(list.terms).not.toContain('web');
	});

	test('registrable domains and main labels', () => {
		expect(list.terms).toEqual(
			expect.arrayContaining([
				'api.vexora.io',
				'vexora.io',
				'www.example.co.uk',
				'example.co.uk',
				'example',
			]),
		);
		expect(list.terms).not.toContain('co.uk');
	});

	// Without the scope of `@vexora/web`, which already denies `vexora`.
	const sibling = buildDenyList({
		appRepo: 'softistx/vexora-api',
		appDomains: ['api.vexora.io'],
	});

	test.each([
		'deployed at app.vexora.io and vexora.io',
		'In Vexora we call this on every request',
		'Could not resolve host: git.vexora.io',
		'MongoServerSelectionError: mongo-0.mongo.vexora.svc.cluster.local',
		'connect ECONNREFUSED vexora-redis:6379',
		'contact jane.doe%40vexora.io',
		'https%3A%2F%2Fapp.vexora.io%2Fv1',
	])('refuses %p', (text) => {
		// Refused, or rewritten so that nothing of the name is left.
		const result = scrub(text, { denyList: sibling });
		expect(result.refused || !/vexora/i.test(result.text)).toBe(true);
	});

	test('allowing a package allows its name, not a stem the deny-list holds', () => {
		const allow = ['hidden-service'];
		expect(
			scrub('uses hidden-service', { denyList: list, allow }).refused,
		).toBe(false);
		// `hidden` is a private stem: allowing the package does not let it through (round 6 of #246).
		expect(scrub('the hidden thing', { denyList: list, allow }).refused).toBe(
			true,
		);
	});

	test('a short name half is not denied, the scope is', () => {
		const scoped = buildDenyList({ appPackages: ['@vexora/web'] });
		expect(scoped.terms).toEqual(['@vexora/web', '@vexora', 'vexora']);
	});
});

describe('findDenied: the application stem glued to a suffix', () => {
	const list = buildDenyList({
		appRepo: 'softistx/vexora-api',
		appPackages: ['@alxia/web'],
		privateRepos: ['jane/hidden-service'],
		appDomains: ['api.vexora.io'],
	});

	test.each([
		'E11000 duplicate key error collection: vexoradb.users index: email_1',
		'database vexoraprod',
		'bucket vexorauploads',
		'queue vexorajobs',
		'vexoratest',
		'myvexora',
		'ns: alxiadb.users',
		'VexoraDB, VEXORAPROD',
	])('refuses %p', (text) => {
		expect(scrub(text, { denyList: list }).refused).toBe(true);
	});

	test('the single-label host rule sees it too', () => {
		const result = scrub('connect vexoradb:5432 now', { denyList: list });
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
			expect(findDenied('vexoradb', copy)).not.toEqual([]);
			expect(scrub('database vexoraprod', { denyList: copy }).refused).toBe(
				true,
			);
		}
	});

	test('a hand-written list is whole-word only', () => {
		expect(findDenied('vexoradb', D(['vexora']))).toEqual([]);
	});
});
