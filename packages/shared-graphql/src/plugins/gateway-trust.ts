import type { TokenPrincipal } from '@nxgt/shared';

/** One request header — a fetch `Headers`, or Apollo Server's `HeaderMap`. */
export type HeaderReader = {
	get(name: string): string | null | undefined;
};

/**
 * Whether a request came from the gateway allowed to name the caller in the
 * GraphQL request's `extensions`.
 *
 * `extensions` is part of the request body, which any client writes. It names
 * the caller only when this answers `true` — for a request carrying proof the
 * client cannot forge. `gatewaySecret()` is the usual proof; a function of
 * your own (an mTLS header set by your proxy, say) works as well.
 */
export type GatewayTrust = (
	headers: HeaderReader,
) => boolean | Promise<boolean>;

/** What `useAuth()` and `extractJwtPlugin()` take: who may set the caller. */
export type GatewayTrustOptions = {
	trustedGateway: GatewayTrust;
};

export type GatewaySecretOptions = {
	/** Shared with the gateway only. At least 16 characters. */
	secret: string;
	/** The header the gateway sends it in. `x-gateway-secret` by default. */
	header?: string;
};

export const GATEWAY_SECRET_HEADER = 'x-gateway-secret';

/** Shorter than this, a secret is a mistake — most often an unset variable. */
const MIN_SECRET_LENGTH = 16;

/**
 * A `GatewayTrust` that holds for a request whose `header` carries `secret`,
 * compared in constant time. The gateway adds the header to every subgraph
 * request; a client reaching the service directly does not know it.
 *
 * Refuses, when it is built, a secret shorter than 16 characters: an unset
 * environment variable must stop the server, not trust an empty header.
 */
export function gatewaySecret({
	secret,
	header = GATEWAY_SECRET_HEADER,
}: GatewaySecretOptions): GatewayTrust {
	if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
		throw new TypeError(
			`gatewaySecret(): \`secret\` must be a string of at least ${MIN_SECRET_LENGTH} characters — is its environment variable set?`,
		);
	}
	const expected = new TextEncoder().encode(secret);
	return (headers) => {
		const sent = headers.get(header);
		if (typeof sent !== 'string') return false;
		return constantTimeEqual(new TextEncoder().encode(sent), expected);
	};
}

/**
 * The `trustedGateway` a plugin was given, or a `TypeError` naming the plugin:
 * without one there is no caller it could read, and a plugin that silently
 * reads none is a server whose every caller is anonymous.
 */
export function requireGatewayTrust(
	options: Partial<GatewayTrustOptions> | undefined,
	plugin: string,
): GatewayTrust {
	const trust = options?.trustedGateway;
	if (typeof trust !== 'function') {
		throw new TypeError(
			`${plugin}: name the gateway allowed to set the caller — ${plugin.replace('()', '')}({ trustedGateway: gatewaySecret({ secret }) }). The request's extensions are written by the client; an API that resolves its own callers uses useOryAuth(ory)`,
		);
	}
	return trust;
}

/**
 * The caller a trusted gateway put in `extensions`, when it is shaped like
 * one: an object with a non-empty string `sub`. Anything else names nobody.
 */
export function principalOf(value: unknown): TokenPrincipal | undefined {
	if (!value || typeof value !== 'object') return undefined;
	const sub = (value as { sub?: unknown }).sub;
	return typeof sub === 'string' && sub.length > 0
		? (value as TokenPrincipal)
		: undefined;
}

/** Every byte of `expected` is read whatever `sent` holds. */
function constantTimeEqual(sent: Uint8Array, expected: Uint8Array): boolean {
	let difference = sent.length ^ expected.length;
	for (let index = 0; index < expected.length; index++) {
		difference |= (sent[index] ?? 0) ^ (expected[index] ?? 0);
	}
	return difference === 0;
}
