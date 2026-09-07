import { describe, expect, test } from 'bun:test';
import { parseRules } from '@nxgt/security/policy';
import { assertEdgePolicy } from './assert-policy';
import { RoutesSchema } from './routes.schema';

const routes = RoutesSchema.parse({
	apps: [
		{ name: 'bookmarks', match: { prefix: '/api' }, upstream: 'http://b:3008' },
	],
});

const use = {
	keto: [
		{
			permissions: [[{ namespace: 'App', permit: 'use', id: 'param.app' }]],
			onDeny: 'FORBIDDEN',
		},
	],
};

function policy(overrides: Record<string, unknown> = {}) {
	return parseRules({
		global: { unmatched: 'deny' },
		rest: {
			'/health': { GET: { public: true } },
			'/api{/*rest}': { GET: use },
		},
		...overrides,
	});
}

describe('assertEdgePolicy', () => {
	test('accepts a document that names its apps and nothing else', () => {
		expect(() => assertEdgePolicy(policy(), routes)).not.toThrow();
	});

	test('requires `global.unmatched: deny`', () => {
		const open = parseRules({
			rest: { '/api{/*rest}': { GET: use } },
		});
		// Inside an app an unnamed path is still met by the authentication
		// floor and by the route itself. At an edge it is a path forwarded
		// with no decision made about it at all.
		expect(() => assertEdgePolicy(open, routes)).toThrow(
			/`global.unmatched` must be `deny`/,
		);
	});

	test('refuses a term that would read the request body', () => {
		const reads = policy({
			rest: {
				'/health': { GET: { public: true } },
				'/api{/*rest}': {
					GET: {
						keto: [
							{
								permissions: [
									[{ namespace: 'App', permit: 'use', id: 'json.app' }],
								],
							},
						],
					},
				},
			},
		});
		expect(() => assertEdgePolicy(reads, routes)).toThrow(/reading `json/);
	});

	test('refuses a term that names anything but the app', () => {
		const object = policy({
			rest: {
				'/health': { GET: { public: true } },
				'/api/bookmarks/:id': {
					GET: {
						keto: [
							{
								permissions: [
									[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }],
								],
							},
						],
					},
				},
			},
		});
		// The boundary, enforced rather than documented: the edge answers
		// "may they reach this app", the API answers "may they see this
		// object" — and only the API can answer 404 where 403 would leak that
		// the object exists.
		expect(() => assertEdgePolicy(object, routes)).toThrow(
			/may only ask about the app/,
		);
	});

	test('refuses a routable app no rule names', () => {
		const twoApps = RoutesSchema.parse({
			apps: [
				...routes.apps,
				{
					name: 'notes',
					match: { path: '/graphql' },
					upstream: 'http://n:5400',
				},
			],
		});
		// Routing and policy are two documents on purpose; under
		// `unmatched: deny` their disagreement is silent and total.
		expect(() => assertEdgePolicy(policy(), twoApps)).toThrow(
			/names the app "notes" at \/graphql, but no rule/,
		);
	});
});
