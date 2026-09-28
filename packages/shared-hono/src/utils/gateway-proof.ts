import {
	assertGatewaySecret,
	GATEWAY_SECRET_HEADER,
	type GatewaySecretOptions,
} from '@nxgt/security/gateway';

/**
 * The header and secret an outbound request carries to prove it comes from
 * the gateway, or `undefined` when none was asked for. A secret shorter than
 * 16 characters is a `TypeError` naming `caller`, as it is for
 * `gatewaySecret()`: an unset variable must not send an empty proof.
 */
export function gatewayProof(
	options: GatewaySecretOptions | undefined,
	caller: string,
): { header: string; secret: string } | undefined {
	if (!options) return undefined;
	return {
		header: options.header ?? GATEWAY_SECRET_HEADER,
		secret: assertGatewaySecret(options.secret, caller),
	};
}
