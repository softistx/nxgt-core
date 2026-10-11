import { describe, expect, test } from 'bun:test';
import { buildDenyList, findDenied } from './deny';

describe('allowed terms win over a folded private full name', () => {
	const list = buildDenyList({ privateRepos: ['acme/zorb-sdk'] });
	const allow = ['@acme/zorb-sdk'];

	test.each([
		'Versions: @acme/zorb-sdk 0.3.1',
		'at toSession (node_modules/@acme/zorb-sdk/dist/index.js:12:3)',
	])('%p passes', (text) => {
		expect(findDenied(text, list, allow)).toEqual([]);
	});

	test('bare prose naming the private repository still refuses', () => {
		expect(findDenied('the zorb sdk repo', list, allow)).not.toEqual([]);
	});
});

describe("the app's own common-word stems", () => {
	const list = buildDenyList({
		appRepo: 'acme/zorblax-ui',
		appPackages: ['zorblax-ui', 'react-router-shell'],
	});

	test.each([
		'at match (node_modules/hono/dist/router/reg-exp-router/router.js:120:5)',
		'React Router 7 BFF',
	])('%p passes', (text) => {
		expect(findDenied(text, list)).toEqual([]);
	});

	test.each(['the zorblax app', 'react-router-shell', 'zorblax-ui'])(
		'%p still refuses',
		(text) => {
			expect(findDenied(text, list)).not.toEqual([]);
		},
	);
});

describe('an allowed term never hides a private name built from it', () => {
	const list = buildDenyList({
		privateRepos: ['acme/vexora-hono', 'acme/zorb-sdk'],
	});
	const allow = ['@nxgt/shared-hono', 'hono', '@acme/zorb-sdk'];

	test.each([
		'acme/vexora-hono',
		'vexora-hono',
		'VEXORA-HONO',
		"import x from 'vexora-hono'",
		'the vexora hono app',
	])('%p refuses', (text) => {
		expect(findDenied(text, list, allow)).not.toEqual([]);
	});

	test.each([
		'@nxgt/shared-hono',
		'node_modules/hono/dist/router.js',
		'hono 4.6',
		'Versions: @acme/zorb-sdk 0.3.1',
	])('%p passes', (text) => {
		expect(findDenied(text, list, allow)).toEqual([]);
	});

	test("an allowed package's stem that is a private stem stays denied", () => {
		const own = buildDenyList({ privateRepos: ['acme/zorblax-core'] });
		expect(findDenied('the zorblax build', own, ['@acme/zorblax-ui'])).toEqual([
			'zorblax',
		]);
	});
});
