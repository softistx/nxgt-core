import { describe, expect, test } from 'bun:test';
import { route } from './router';
import { RoutesSchema } from './routes.schema';

const routes = RoutesSchema.parse({
	apps: [
		{
			name: 'notes',
			match: { host: 'notes.test', path: '/graphql' },
			upstream: 'http://notes:5400',
		},
		{
			name: 'bookmarks',
			match: { prefix: '/api' },
			upstream: 'http://bookmarks:3008',
		},
	],
});

describe('route', () => {
	test('an exact path matches only itself, and only on its host', () => {
		expect(route(routes, 'notes.test', '/graphql')?.app.name).toBe('notes');
		expect(route(routes, 'notes.test', '/graphql/x')?.app.name).toBeUndefined();
		// Same path, different host: the notes rule does not apply, and the
		// bookmarks prefix does not match either.
		expect(route(routes, 'other.test', '/graphql')).toBeNull();
	});

	test('a prefix matches on segment boundaries, not on characters', () => {
		expect(route(routes, 'any.test', '/api')?.app.name).toBe('bookmarks');
		expect(route(routes, 'any.test', '/api/bookmarks/b1')?.app.name).toBe(
			'bookmarks',
		);
		// A plain `startsWith` would route this to bookmarks — a routing bug
		// that presents as an authorization one, since the request would be
		// checked against a rule written for a different app.
		expect(route(routes, 'any.test', '/apiary')).toBeNull();
	});

	test('a hostless match accepts any host', () => {
		expect(route(routes, 'notes.test', '/api')?.app.name).toBe('bookmarks');
	});

	test('nothing matched is null, not an error — the rules document decides', () => {
		expect(route(routes, 'any.test', '/health')).toBeNull();
	});

	test('the path travels unchanged unless `stripPrefix` says otherwise', () => {
		expect(route(routes, 'any.test', '/api/x')?.upstreamPath).toBe('/api/x');

		const stripping = RoutesSchema.parse({
			apps: [
				{
					name: 'bookmarks',
					match: { prefix: '/api' },
					upstream: 'http://bookmarks:3008',
					stripPrefix: true,
				},
			],
		});
		expect(route(stripping, 'any.test', '/api/x')?.upstreamPath).toBe('/x');
		// Not '' — an empty path is not a path.
		expect(route(stripping, 'any.test', '/api')?.upstreamPath).toBe('/');
	});

	test('document order decides when two apps could both take it', () => {
		const overlapping = RoutesSchema.parse({
			apps: [
				{
					name: 'special',
					match: { path: '/api/health' },
					upstream: 'http://special:1',
				},
				{
					name: 'general',
					match: { prefix: '/api' },
					upstream: 'http://general:2',
				},
			],
		});
		expect(route(overlapping, 'h', '/api/health')?.app.name).toBe('special');
		expect(route(overlapping, 'h', '/api/other')?.app.name).toBe('general');
	});
});

describe('RoutesSchema', () => {
	test('refuses an app that says where it lives twice', () => {
		expect(() =>
			RoutesSchema.parse({
				apps: [
					{
						name: 'both',
						match: { prefix: '/api', path: '/api' },
						upstream: 'http://x:1',
					},
				],
			}),
		).toThrow(/exactly one of/);
	});

	test('refuses an app that does not say where it lives at all', () => {
		expect(() =>
			RoutesSchema.parse({
				apps: [{ name: 'neither', match: {}, upstream: 'http://x:1' }],
			}),
		).toThrow(/exactly one of/);
	});

	test('refuses an app name Keto could not carry as an object id', () => {
		expect(() =>
			RoutesSchema.parse({
				apps: [
					{
						name: 'has spaces',
						match: { prefix: '/a' },
						upstream: 'http://x:1',
					},
				],
			}),
		).toThrow();
	});
});
