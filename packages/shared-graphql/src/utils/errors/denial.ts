import { type LocaleKey, translate } from '@nxgt/i18n';
import { ErrorCode } from '@nxgt/shared-exceptions';
import { GraphQLError } from 'graphql';

/** The refusals a guard answers, each with its HTTP status. */
export type DenialCode =
	| ErrorCode.Unauthenticated
	| ErrorCode.Forbidden
	| ErrorCode.NotFound;

const STATUS: Record<DenialCode, number> = {
	[ErrorCode.Unauthenticated]: 401,
	[ErrorCode.Forbidden]: 403,
	[ErrorCode.NotFound]: 404,
};

/** The shared i18n keys a denial carries when it names none. */
const DEFAULT_MESSAGE: Record<DenialCode, string> = {
	[ErrorCode.Unauthenticated]: 'errors.unauthenticated',
	[ErrorCode.Forbidden]: 'errors.insufficient-permissions',
	[ErrorCode.NotFound]: 'errors.not-found',
};

/**
 * Where a denial keeps its i18n key. A registered symbol, so a denial from a
 * second copy of this package is still recognised, and never serialised: the
 * client reads `message`, not the key.
 */
const MESSAGE_KEY = Symbol.for('@nxgt/shared-graphql/denial-message');

/**
 * A refusal, as the `GraphQLError` a client reads: `extensions.code` and
 * `extensions.http.status` — `UNAUTHENTICATED` 401, `FORBIDDEN` 403,
 * `NOT_FOUND` 404 — so any server answers it with its status, with or without
 * `createMaskError`. What `@permission`, `@authenticated`, `requireUser` and
 * `can` throw.
 *
 * `message` is an i18n key (the shared `errors.*` one by default). It is
 * translated here with `@nxgt/i18n`'s resources, in the request's language
 * when one is known; `createMaskError(translate)` and
 * `createFormatError(translate)` translate it again with yours.
 */
export function denial(code: DenialCode, message?: string): GraphQLError {
	const key = message ?? DEFAULT_MESSAGE[code];
	const error = new GraphQLError(translate(key as LocaleKey), {
		extensions: { code, http: { status: STATUS[code] } },
	});
	Object.defineProperty(error, MESSAGE_KEY, { value: key });
	return error;
}

/** The i18n key of a `denial()`, or `undefined` for any other error. */
export function denialMessageKey(error: unknown): string | undefined {
	if (!error || typeof error !== 'object') return undefined;
	const key = (error as { [MESSAGE_KEY]?: unknown })[MESSAGE_KEY];
	return typeof key === 'string' ? key : undefined;
}
