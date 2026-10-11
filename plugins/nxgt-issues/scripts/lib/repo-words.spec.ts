import { afterAll, describe, expect, test } from 'bun:test';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { buildDenyList, findDenied } from './deny';
import { filingDenyList } from './deny-sources';

afterAll(removeTempDirs);

/** Invented private repositories shaped like real ones: single words, plurals, versions. */
const list = buildDenyList({
	privateRepos: [
		'acme/plugins',
		'acme/geo-locations',
		'acme/zorp-workspace',
		'acme/oauth2-bridge',
		'acme/acme-apis',
		'acme/elysia-starter',
		'acme/zorblax',
	],
});

describe('bare and plural private repository names that are common words', () => {
	test.each([
		'at useAuth (node_modules/@nxgt/shared-graphql/dist/plugins/auth.js:77:5)',
		'{"errors":[{"message":"Unauthenticated","locations":[{"line":2,"column":3}]}]}',
		'Run it in the bun workspace root.',
		'The OAuth2 flow fails.',
		'Other APIs are fine.',
		'Works with Elysia too.',
		'the plugins run in order',
	])('%p passes', (text) => {
		expect(findDenied(text, list)).toEqual([]);
	});

	test.each([
		['acme/plugins is private', 'acme/plugins'],
		['see geo-locations', 'geo-locations'],
		['the zorblax service', 'zorblax'],
	])('%p still refuses', (text, term) => {
		expect(findDenied(text, list)).toContain(term);
	});
});

describe('filingDenyList carries the private stems', () => {
	test('the node_modules exemption reaches a real filing', async () => {
		const h = harness({
			cwd: makeApp(),
			run: [
				{
					argv: ['gh', 'repo', 'list', 'softistx'],
					result: {
						stdout: JSON.stringify([
							{ nameWithOwner: 'softistx/zorblax-tools' },
						]),
					},
				},
			],
		});
		const filing = await filingDenyList(h.ctx);
		expect(filing.stems).toContain('zorblax');
		expect(
			findDenied('at x (node_modules/zorblax/dist/a.js:1:1)', filing),
		).toEqual([]);
		expect(findDenied('the zorblax build', filing)).toEqual(['zorblax']);
	});
});
