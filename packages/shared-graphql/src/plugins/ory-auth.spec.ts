import { describe, expect, test } from 'bun:test';
import type { Ory, OryPrincipal } from 'stx-sdk/ory';
import { OryUnavailable } from 'stx-sdk/ory';
import { resolveOryPrincipal } from './ory-auth';

const expiry = new Date('2026-09-07T12:00:00.000Z');

const principal: OryPrincipal = {
	subject: 'idn-1',
	kind: 'session',
	identity: {
		email: 'ada@example.test',
		name: { first: 'Ada', last: 'L' },
		verified: true,
	},
	aal: 'aal2',
	scopes: [],
	expiresAt: expiry,
};

/** Only `resolve` is reached here; the rest of `Ory` is not this test's business. */
function stubOry(resolve: Ory['resolve']): Ory {
	return { resolve } as unknown as Ory;
}

describe('resolveOryPrincipal', () => {
	test('puts rules-shaped claims on the context, not the principal', async () => {
		const context = await resolveOryPrincipal(
			stubOry(async () => principal),
			new Headers({ cookie: 'ory_kratos_session=abc' }),
		);

		// The whole point: `claims.aal` and `claims.email_verified` have
		// nowhere to live in a `TokenPrincipal`, so a rule reading `user` as
		// claims could never see them — and a rule that names them guarded a
		// REST route while guarding nothing here.
		expect(context.claims).toEqual({
			sub: 'idn-1',
			kind: 'session',
			email: 'ada@example.test',
			email_verified: true,
			aal: 'aal2',
			exp: Math.floor(expiry.getTime() / 1000),
		});

		// `user` is unchanged — services read it, and it is not claims.
		expect(context.user).toMatchObject({
			sub: 'idn-1',
			uid: 'idn-1',
			authorities: [],
			roles: [],
		});
		expect(context.ory).toBe(principal);
	});

	test('an anonymous caller has no claims at all, not empty ones', async () => {
		const context = await resolveOryPrincipal(
			stubOry(async () => null),
			new Headers(),
		);

		// `{ sub: '' }` would read as a caller to `isAuthenticated`; absent is
		// the honest shape, and `applyGraphqlPolicy` supplies its own default.
		expect(context.claims).toBeUndefined();
		expect(context.user).toBeUndefined();
		expect(context.ory).toBeNull();
	});

	test('an Ory outage is a 503, never an anonymous caller', async () => {
		const failing = stubOry(async () => {
			throw new OryUnavailable('kratos', 0, {});
		});

		await expect(
			resolveOryPrincipal(failing, new Headers()),
		).rejects.toMatchObject({
			extensions: { code: 'SERVICE_UNAVAILABLE', http: { status: 503 } },
		});
	});
});
