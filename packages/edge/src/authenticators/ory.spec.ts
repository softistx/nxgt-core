import { describe, expect, test } from 'bun:test';
import { exportJWK, generateKeyPair, type JWK } from 'jose';
import type { Ory, OryPrincipal, Permission, Subject } from 'stx-sdk/ory';
import { createEdgeVerifier, OryUnavailable } from 'stx-sdk/ory';
import { AuthorityUnavailable } from '../types';
import { oryAuthenticator } from './ory';

const ISSUER = 'http://edge:4456/';

/** `expect(x).not.toBeNull()` does not narrow, and `!` is linted out. */
function must<T>(value: T | null | undefined): T {
	if (value == null) throw new Error('expected a value');
	return value;
}

const principal: OryPrincipal = {
	subject: 'idn-7',
	kind: 'session',
	identity: { email: 'ada@example.test', verified: true },
	aal: 'aal2',
	scopes: [],
};

let jwks: { keys: JWK[] };
const keys = async () => {
	if (!jwks) {
		const { privateKey } = await generateKeyPair('RS256', {
			extractable: true,
		});
		jwks = {
			keys: [{ ...(await exportJWK(privateKey)), alg: 'RS256', kid: 'edge' }],
		};
	}
	return jwks;
};

/** Only `resolve` and `isAllowed` are reached; the rest of `Ory` is not this test's business. */
function stubOry(parts: Partial<Pick<Ory, 'resolve' | 'isAllowed'>>): Ory {
	return parts as unknown as Ory;
}

async function authenticator(
	parts: Partial<Pick<Ory, 'resolve' | 'isAllowed'>>,
) {
	return oryAuthenticator({
		ory: stubOry(parts),
		signer: { issuer: ISSUER, jwks: await keys() },
	});
}

describe('oryAuthenticator', () => {
	test('resolves a caller into rules-shaped claims', async () => {
		const auth = await authenticator({ resolve: async () => principal });

		const identity = await auth.resolve(new Request('https://edge.test/api'));

		// `claimsFromOryPrincipal`, the same mapper the APIs use, so a rule
		// reads the same claims at the edge as behind it.
		expect(identity?.claims).toEqual({
			sub: 'idn-7',
			kind: 'session',
			email: 'ada@example.test',
			email_verified: true,
			aal: 'aal2',
		});
	});

	test('mints an assertion a fronted app already knows how to verify', async () => {
		const auth = await authenticator({ resolve: async () => principal });
		const identity = await auth.resolve(new Request('https://edge.test/api'));

		const verifier = createEdgeVerifier({
			issuer: ISSUER,
			jwksUrl: `${ISSUER}.well-known/jwks.json`,
			fetch: (async () =>
				Response.json({
					keys: (await keys()).keys.map(
						({ d, p, q, dp, dq, qi, ...rest }) => rest,
					),
				})) as unknown as typeof globalThis.fetch,
		});

		// The property that makes the switchover a compose change: same
		// issuer, same key set, so bookmarks-api and notes-api accept our
		// tokens with no configuration change at all.
		expect(
			await verifier.principalFromEdgeToken(await must(identity).assert()),
		).toMatchObject({ subject: 'idn-7', kind: 'session', aal: 'aal2' });
	});

	test('an unreachable authority throws, and never reads as anonymous', async () => {
		const auth = await authenticator({
			resolve: async () => {
				throw new OryUnavailable('kratos', 0, {});
			},
		});

		// `null` here would make a Kratos outage look like a caller with no
		// credential, and the request would then be refused as if they had
		// none: an outage answered as a refusal.
		const failure = auth
			.resolve(new Request('https://edge.test/api'))
			.catch((error) => error);
		expect(await failure).toBeInstanceOf(AuthorityUnavailable);
		expect((await failure).authority).toBe('kratos');
	});

	test('no credential is anonymous, which is a legitimate answer', async () => {
		const auth = await authenticator({ resolve: async () => null });

		expect(await auth.resolve(new Request('https://edge.test/api'))).toBeNull();
	});

	test('asks Keto once per distinct question, however many rungs ask it', async () => {
		const asked: string[] = [];
		const auth = await authenticator({
			resolve: async () => principal,
			isAllowed: async (permission: Permission, subject: Subject) => {
				asked.push(
					`${permission.namespace}:${permission.object}#${permission.relation}@${String(subject)}`,
				);
				return true;
			},
		});

		const identity = await auth.resolve(new Request('https://edge.test/api'));
		const requirement = [
			[{ namespace: 'App', permit: 'use', id: 'param.app' }],
		];
		const objectsOf = () => ['bookmarks'];

		await must(must(identity).permissions).evaluatePermissions?.(
			requirement,
			objectsOf,
			'idn-7',
		);
		await must(must(identity).permissions).evaluatePermissions?.(
			requirement,
			objectsOf,
			'idn-7',
		);

		expect(asked).toEqual(['App:bookmarks#use@idn-7']);
	});
});
