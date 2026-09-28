/** One request header — a fetch `Headers`, or Apollo Server's `HeaderMap`. */
export type HeaderReader = {
	get(name: string): string | null | undefined;
};

/**
 * Whether a request came from the gateway allowed to name the caller in data
 * the client could otherwise write — a GraphQL request's `extensions`, or the
 * `X-User-*` headers.
 *
 * That data names the caller only when this answers `true` — for a request
 * carrying proof the client cannot forge. `gatewaySecret()` is the usual
 * proof; a function of your own (an mTLS header set by your proxy, say) works
 * as well.
 */
export type GatewayTrust = (
	headers: HeaderReader,
) => boolean | Promise<boolean>;

/** What a middleware or plugin that reads a gateway's caller takes. */
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
 * The secret, or a `TypeError` when it is missing or shorter than 16
 * characters: an unset environment variable must stop the server, not trust
 * (or send) an empty header.
 */
export function assertGatewaySecret(secret: unknown, caller: string): string {
	if (typeof secret !== 'string' || secret.length < MIN_SECRET_LENGTH) {
		throw new TypeError(
			`${caller}: \`secret\` must be a string of at least ${MIN_SECRET_LENGTH} characters — is its environment variable set?`,
		);
	}
	return secret;
}

/**
 * A `GatewayTrust` that holds for a request whose `header` carries `secret`,
 * compared in constant time. The gateway adds the header to every request it
 * forwards; a client reaching the service directly does not know it.
 */
export function gatewaySecret({
	secret,
	header = GATEWAY_SECRET_HEADER,
}: GatewaySecretOptions): GatewayTrust {
	const expected = new TextEncoder().encode(
		assertGatewaySecret(secret, 'gatewaySecret()'),
	);
	return (headers) => {
		const sent = headers.get(header);
		if (typeof sent !== 'string') return false;
		return constantTimeEqual(new TextEncoder().encode(sent), expected);
	};
}

/** How `requireGatewayTrust` words its refusal for one caller. */
export type GatewayTrustSite = {
	/** The function that needs the option, as written: `useAuth()`. */
	caller: string;
	/** What the client writes: `the request's extensions`. Plural. */
	reads: string;
	/** What an API that resolves its own callers uses instead. */
	alternative: string;
	/** The call to write, when it is not `caller({ trustedGateway })`. */
	call?: string;
};

/**
 * The `trustedGateway` a caller was given, or a `TypeError` naming the caller:
 * without one there is no caller it could read, and one that silently reads
 * none is a server whose every caller is anonymous.
 */
export function requireGatewayTrust(
	options: Partial<GatewayTrustOptions> | undefined,
	{ caller, reads, alternative, call }: GatewayTrustSite,
): GatewayTrust {
	const trust = options?.trustedGateway;
	if (typeof trust !== 'function') {
		const source = reads.charAt(0).toUpperCase() + reads.slice(1);
		const fix =
			call ??
			`${caller.replace('()', '')}({ trustedGateway: gatewaySecret({ secret }) })`;
		throw new TypeError(
			`${caller}: name the gateway allowed to set the caller — ${fix}. ${source} are written by the client; an API that resolves its own callers uses ${alternative}`,
		);
	}
	return trust;
}

/** Every byte of `expected` is read whatever `sent` holds. */
function constantTimeEqual(sent: Uint8Array, expected: Uint8Array): boolean {
	let difference = sent.length ^ expected.length;
	for (let index = 0; index < expected.length; index++) {
		difference |= (sent[index] ?? 0) ^ (expected[index] ?? 0);
	}
	return difference === 0;
}
