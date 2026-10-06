import { describe, expect, test } from 'bun:test';
import type { Principal } from '@nxgt/shared/models';
import { Hono } from 'hono';
import { createErrorHandler } from './error-handler';
import { secured } from './secured';

/** What the logger `secured()` reads from the context was asked to print. */
type Logged = { level: 'info' | 'error'; message: string }[];

/**
 * A route behind `secured(authorities)`, its caller set on the context the
 * way `currentUser()` would, without going through the gateway headers:
 * those have their own spec, and this one is about the decision. The
 * context carries a recording logger unless `logged` is `null`.
 */
function app(
	principal: Principal | null | undefined,
	authorities?: string[][],
	logged: Logged | null = [],
) {
	const hono = new Hono();
	hono.onError(createErrorHandler((key) => key, { logToConsole: false }));
	hono.use('*', async (ctx, next) => {
		if (principal !== undefined) ctx.set('principal', principal);
		if (logged) {
			ctx.set('logger', {
				info: (message: string) => logged.push({ level: 'info', message }),
				error: (message: string) => logged.push({ level: 'error', message }),
			} as never);
		}
		return next();
	});
	hono.get(
		'/x',
		authorities === undefined ? secured() : secured(authorities),
		(ctx) => ctx.text('granted'),
	);
	return hono;
}

async function call(
	principal: Principal | null | undefined,
	authorities?: string[][],
) {
	const res = await app(principal, authorities).request('/x');
	const body = res.status === 200 ? await res.text() : await res.json();
	return { status: res.status, body };
}

const user = (values: Partial<Principal> = {}): Principal => ({
	id: 'u1',
	username: 'ada',
	name: 'Ada',
	...values,
});

/** A confidential client: a `clientId` and no `username`. */
const client = (values: Partial<Principal> = {}): Principal => ({
	clientId: 'backoffice',
	...values,
});

describe('secured() — anonymous', () => {
	test.each([
		['no principal on the context', undefined],
		['a null principal', null],
	] as const)('401 for %s, with the unauthenticated body', async (_, who) => {
		const { status, body } = await call(who, [['users:read']]);

		expect(status).toBe(401);
		expect(body).toEqual({
			status: 401,
			message: 'errors.unauthenticated',
			timestamp: expect.any(String),
		});
	});

	test('401 even when no authority is required', async () => {
		expect((await call(undefined)).status).toBe(401);
		expect((await call(undefined, [])).status).toBe(401);
	});
});

describe('secured() — authentication only', () => {
	test('secured() lets any user through', async () => {
		expect(await call(user({ authorities: [] }))).toEqual({
			status: 200,
			body: 'granted',
		});
	});

	test('secured() lets a confidential client through', async () => {
		expect((await call(client())).status).toBe(200);
	});

	test('secured([]) is the same as secured()', async () => {
		expect((await call(user(), [])).status).toBe(200);
		expect((await call(client(), [])).status).toBe(200);
	});

	test('any truthy principal counts as authenticated, even an empty one', async () => {
		// `secured()` checks presence only; deciding what a principal is
		// belongs to whatever set it (`currentUser()`).
		expect((await call({}, [])).status).toBe(200);
	});
});

describe('secured() — authorities for a user', () => {
	test('one group is OR: any one authority in it is enough', async () => {
		const guard = [['ADMIN', 'users:read']];

		expect(
			(await call(user({ authorities: ['users:read'] }), guard)).status,
		).toBe(200);
		expect((await call(user({ authorities: ['ADMIN'] }), guard)).status).toBe(
			200,
		);
	});

	test('several groups are AND: every group must match', async () => {
		const guard = [['ADMIN'], ['users:read']];

		expect(
			(await call(user({ authorities: ['ADMIN', 'users:read'] }), guard))
				.status,
		).toBe(200);
		expect(
			(await call(user({ authorities: ['users:read'] }), guard)).status,
		).toBe(403);
	});

	test('403 with the forbidden body when no authority matches', async () => {
		const { status, body } = await call(
			user({ authorities: ['users:write'] }),
			[['users:read']],
		);

		expect(status).toBe(403);
		expect(body).toEqual({
			status: 403,
			message: 'errors.forbidden',
			timestamp: expect.any(String),
		});
	});

	test('403 for a user with no authorities at all (missing or null)', async () => {
		expect((await call(user(), [['users:read']])).status).toBe(403);
		expect(
			(await call(user({ authorities: null }), [['users:read']])).status,
		).toBe(403);
	});

	test('an empty group is satisfied by anyone', async () => {
		expect((await call(user(), [[]])).status).toBe(200);
		expect(
			(await call(user({ authorities: ['users:read'] }), [['users:read'], []]))
				.status,
		).toBe(200);
		expect((await call(user(), [['users:read'], []])).status).toBe(403);
	});

	test('matching is exact: no case folding, no prefix match', async () => {
		expect(
			(await call(user({ authorities: ['USERS:READ'] }), [['users:read']]))
				.status,
		).toBe(403);
		expect(
			(await call(user({ authorities: ['users'] }), [['users:read']])).status,
		).toBe(403);
	});

	test('a user is matched on SCOPE_* authorities too', async () => {
		expect(
			(
				await call(user({ authorities: ['SCOPE_users:read'] }), [
					['SCOPE_users:read'],
				])
			).status,
		).toBe(200);
	});

	test('only `authorities` is read: `scopes` grants nothing', async () => {
		const scoped = user({ authorities: [], scopes: ['SCOPE_users:read'] });

		expect((await call(scoped, [['SCOPE_users:read']])).status).toBe(403);
	});
});

describe('secured() — roles', () => {
	test("roles: ['ADMIN'] passes every guard, with no authority at all", async () => {
		const admin = user({ roles: ['ADMIN'], authorities: [] });

		expect((await call(admin, [['users:read']])).status).toBe(200);
		expect((await call(admin, [['users:read'], ['SCOPE_x']])).status).toBe(200);
	});

	test('the bypass reads `roles`, not `authorities`', async () => {
		// An ADMIN authority without the ADMIN role is matched like any other
		// authority: it satisfies a group naming ADMIN, and nothing else.
		const admin = user({ authorities: ['ADMIN'] });

		expect((await call(admin, [['ADMIN']])).status).toBe(200);
		expect((await call(admin, [['users:read']])).status).toBe(403);
	});

	test('only ADMIN bypasses: another role is not an authority', async () => {
		const editor = user({ roles: ['EDITOR'], authorities: [] });

		expect((await call(editor, [['EDITOR']])).status).toBe(403);
	});

	test('the role is matched exactly', async () => {
		expect(
			(
				await call(user({ roles: ['admin'], authorities: [] }), [
					['users:read'],
				])
			).status,
		).toBe(403);
	});
});

describe('secured() — confidential client', () => {
	test.each([
		['an empty username', ''],
		['a null username', null],
	] as const)(
		'%s with a clientId reads as a client, held to its scopes under ADMIN',
		async (_, username) => {
			const admin = client({
				username: username as never,
				roles: ['ADMIN'],
				authorities: ['users:read'],
			});

			expect((await call(admin, [['users:read']])).status).toBe(403);
			expect((await call(admin, [['ADMIN']])).status).toBe(403);
		},
	);

	test('only SCOPE_* authorities count', async () => {
		const backoffice = client({
			authorities: ['SCOPE_users:read', 'users:read'],
		});

		expect((await call(backoffice, [['SCOPE_users:read']])).status).toBe(200);
		expect((await call(backoffice, [['users:read']])).status).toBe(403);
	});

	test('a permission in the same OR group as a scope it holds still passes', async () => {
		expect(
			(
				await call(client({ authorities: ['SCOPE_users:read'] }), [
					['users:read', 'SCOPE_users:read'],
				])
			).status,
		).toBe(200);
	});

	test('an ADMIN authority on a client is filtered out like any non-scope', async () => {
		expect(
			(await call(client({ authorities: ['ADMIN'] }), [['ADMIN']])).status,
		).toBe(403);
	});

	test('403 for a client with no authorities at all', async () => {
		expect((await call(client(), [['SCOPE_users:read']])).status).toBe(403);
	});

	test('a clientId with a username is a user, not a client', async () => {
		const onBehalf = client({ username: 'ada', authorities: ['users:read'] });

		expect((await call(onBehalf, [['users:read']])).status).toBe(200);
	});

	test('an empty username still reads as a client', async () => {
		expect(
			(
				await call(client({ username: '', authorities: ['users:read'] }), [
					['users:read'],
				])
			).status,
		).toBe(403);
	});

	test("roles: ['ADMIN'] does not let a client past a scope it lacks", async () => {
		// A confidential client is held to its SCOPE_* authorities only, as the
		// JSDoc on `secured()` says: the ADMIN-role bypass is for users.
		const adminClient = client({ roles: ['ADMIN'], authorities: [] });

		const { status, body } = await call(adminClient, [['SCOPE_users:read']]);

		expect(status).toBe(403);
		expect(body).toEqual({
			status: 403,
			message: 'errors.forbidden',
			timestamp: expect.any(String),
		});
		expect((await call(adminClient, [['ADMIN']])).status).toBe(403);
	});

	test("roles: ['ADMIN'] on a client holding the scope passes on the scope", async () => {
		const adminClient = client({
			roles: ['ADMIN'],
			authorities: ['SCOPE_users:read'],
		});

		expect((await call(adminClient, [['SCOPE_users:read']])).status).toBe(200);
	});

	test("roles: ['ADMIN'] on a client still passes a guard naming no authority", async () => {
		const adminClient = client({ roles: ['ADMIN'], authorities: [] });

		expect((await call(adminClient)).status).toBe(200);
		expect((await call(adminClient, [[]])).status).toBe(200);
	});

	test("roles: ['ADMIN'] still bypasses for a user acting through a client", async () => {
		// A clientId with a username is a user: the bypass applies.
		const onBehalf = client({ username: 'ada', roles: ['ADMIN'] });

		expect((await call(onBehalf, [['SCOPE_users:read']])).status).toBe(200);
	});
});

describe('secured() — logging', () => {
	test("uses the context's logger, naming the caller by name first", async () => {
		const logged: Logged = [];
		await app(user(), [], logged).request('/x');

		expect(logged).toEqual([
			{ level: 'info', message: 'Secured middleware: checking authorities' },
			{ level: 'info', message: 'User authenticated: Ada' },
		]);
	});

	test('falls back to the username, then the clientId', async () => {
		const byUsername: Logged = [];
		await app(user({ name: undefined }), [], byUsername).request('/x');
		const byClient: Logged = [];
		await app(client(), [], byClient).request('/x');

		expect(byUsername[1]?.message).toBe('User authenticated: ada');
		expect(byClient[1]?.message).toBe('User authenticated: backoffice');
	});

	test('falls back to the shared logger when the context has none', async () => {
		expect((await app(user(), [], null).request('/x')).status).toBe(200);
	});

	test('logs an error for an anonymous caller', async () => {
		const logged: Logged = [];
		await app(null, [], logged).request('/x');

		expect(logged).toContainEqual({
			level: 'error',
			message: 'Unauthenticated access attempt',
		});
	});

	test('logs no caller line for an ADMIN user, who returns before it', async () => {
		const logged: Logged = [];
		await app(user({ roles: ['ADMIN'] }), [['x']], logged).request('/x');

		expect(logged).toEqual([
			{ level: 'info', message: 'Secured middleware: checking authorities' },
		]);
	});
});

describe('secured() — ADMIN user unchanged', () => {
	test('an ADMIN user still passes a guard it holds no authority for', async () => {
		const admin = user({ roles: ['ADMIN'], authorities: [] });

		expect((await call(admin, [['SCOPE_users:read']])).status).toBe(200);
	});
});
