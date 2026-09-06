import type { Principal } from '@nxgt/shared';
import type { Context } from 'graphql-ws';
import type { createAuthClient } from 'stx-sdk/auth';

type AuthClient = ReturnType<typeof createAuthClient>;

export interface ResolvedWsUser {
	user: Principal | undefined;
	token: string | undefined;
}

/**
 * Resolves the authenticated Principal for a `graphql-ws` connection - the
 * WS-transport equivalent of the HTTP-path `useAuth()`/`useGenericAuth()`
 * plugins. There is no gateway hop for WS connections, so each app performs
 * the OAuth introspection call itself using its own `auth` client.
 *
 * Reads the bearer token off `connectionParams.authorization` /
 * `connectionParams.Authorization` (both casings are used by existing
 * clients), strips the `Bearer ` prefix, and introspects it. Returns
 * `user: undefined` for a missing, invalid, or inactive token - callers
 * pass `user ?? null` into their own `services()` factory, exactly as the
 * HTTP-path plugins already do.
 */
export async function resolveWsUser(
	connectionParams: Context['connectionParams'],
	authClient: AuthClient,
): Promise<ResolvedWsUser> {
	const rawToken =
		(connectionParams?.authorization as string | undefined) ??
		(connectionParams?.Authorization as string | undefined);
	const token = rawToken?.replace('Bearer ', '');

	const { data } = token
		? await authClient.POST('/oauth/introspect', { body: { token } })
		: { data: null };

	const user = data?.active
		? ({ ...(data as any), name: (data as any).sub } as Principal)
		: undefined;

	return { user, token };
}
