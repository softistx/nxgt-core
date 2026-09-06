import type { LocaleKey } from '@nxgt/i18n';
import { ErrorCode } from './error-code';
import type { StatusCode } from './status';

/**
 * The two repositories had forked this class, and everything either of them
 * throws is built on it:
 *
 *   - sellix-monorepo took a positional constructor and a **numeric** `code`,
 *     the HTTP status. `shared-hono`'s error handler does `c.status(err.code)`
 *     straight off it.
 *   - nxgt-federation took an object constructor and a **string** `code`, the
 *     symbolic `ErrorCode`, renamed `unauthorized` to `unauthenticated`, and
 *     added `validationError`.
 *
 * Neither behaviour was covered by a test, so neither was picked over the
 * other. `code` stays numeric — the contract the error handler depends on —
 * and `errorCode` carries the symbolic one alongside it, always in agreement.
 * The constructor accepts both call shapes and every factory from both sides
 * survives, so no call site in either repository changes.
 */

export interface ErrorProps<T extends string = LocaleKey> {
	message?: T | null;
	options?: any;
	debugMessage?: string | null;
}

export interface ICustomExceptionParams<T extends string = LocaleKey>
	extends ErrorProps<T> {
	/** An HTTP status (`404`) or a symbolic code (`ErrorCode.NotFound`). */
	code?: StatusCode | ErrorCode | string;
}

const STATUS_BY_ERROR_CODE: Record<ErrorCode, StatusCode> = {
	[ErrorCode.BadRequest]: 400,
	[ErrorCode.Unauthenticated]: 401,
	[ErrorCode.Forbidden]: 403,
	[ErrorCode.NotFound]: 404,
	[ErrorCode.Conflict]: 409,
	// 400, not 422: this is the status nxgt-federation's GraphQL error layer
	// already answered for a validation failure, and changing it would change
	// what its clients see.
	[ErrorCode.ValidationError]: 400,
	[ErrorCode.InternalServerError]: 500,
	[ErrorCode.ServiceUnavailable]: 503,
};

/**
 * The reverse direction, written out rather than derived: two symbolic codes
 * answer 400, and only `BadRequest` is the right one to infer from it.
 */
const ERROR_CODE_BY_STATUS = new Map<number, ErrorCode>([
	[400, ErrorCode.BadRequest],
	[401, ErrorCode.Unauthenticated],
	[403, ErrorCode.Forbidden],
	[404, ErrorCode.NotFound],
	[409, ErrorCode.Conflict],
	[500, ErrorCode.InternalServerError],
	[503, ErrorCode.ServiceUnavailable],
]);

/** Resolve either form of `code` into the pair the exception carries. */
function resolveCode(code: StatusCode | ErrorCode | string): {
	status: StatusCode;
	errorCode: ErrorCode;
} {
	if (typeof code === 'number') {
		return {
			status: code,
			errorCode:
				ERROR_CODE_BY_STATUS.get(code) ??
				(code >= 500 ? ErrorCode.InternalServerError : ErrorCode.BadRequest),
		};
	}
	const errorCode = code as ErrorCode;
	return {
		status: STATUS_BY_ERROR_CODE[errorCode] ?? 400,
		errorCode:
			errorCode in STATUS_BY_ERROR_CODE ? errorCode : ErrorCode.BadRequest,
	};
}

export class CustomException<T extends string = LocaleKey> extends Error {
	/**
	 * The HTTP status, as a number. `shared-hono`'s error handler passes this
	 * straight to `c.status()`, which rejects anything else.
	 */
	code: StatusCode;
	/** The symbolic code, always consistent with `code`. */
	errorCode: ErrorCode;
	debugMessage?: string | null;
	options?: any;

	constructor(params?: ICustomExceptionParams<T>);
	constructor(
		message?: T | null,
		code?: StatusCode | ErrorCode | string,
		options?: object,
		debugMessage?: string | null,
	);
	constructor(
		messageOrParams?: T | null | ICustomExceptionParams<T>,
		code: StatusCode | ErrorCode | string = 400,
		options?: object,
		debugMessage?: string | null,
	) {
		const params: ICustomExceptionParams<T> =
			typeof messageOrParams === 'object' && messageOrParams !== null
				? messageOrParams
				: { message: messageOrParams, code, options, debugMessage };

		super(params.message ?? undefined);

		const resolved = resolveCode(params.code ?? 400);
		this.code = resolved.status;
		this.errorCode = resolved.errorCode;
		this.debugMessage = params.debugMessage;
		this.options = params.options;
	}

	static from<T extends string = LocaleKey>(
		params: ICustomExceptionParams<T> = {},
	) {
		return new CustomException<T>(params);
	}

	static badRequest<T extends string = LocaleKey>(params: ErrorProps<T> = {}) {
		return CustomException.from<T>({ ...params, code: ErrorCode.BadRequest });
	}

	static validationError<T extends string = LocaleKey>(
		params: ErrorProps<T> = {},
	) {
		return CustomException.from<T>({
			...params,
			code: ErrorCode.ValidationError,
		});
	}

	static unauthenticated<T extends string = LocaleKey>(
		params: ErrorProps<T> = {},
	) {
		return CustomException.from<T>({
			...params,
			code: ErrorCode.Unauthenticated,
		});
	}

	/** sellix-monorepo's name for {@link CustomException.unauthenticated}. */
	static unauthorized<T extends string = LocaleKey>(
		params: ErrorProps<T> = {},
	) {
		return CustomException.unauthenticated<T>(params);
	}

	static forbidden<T extends string = LocaleKey>(params: ErrorProps<T> = {}) {
		return CustomException.from<T>({ ...params, code: ErrorCode.Forbidden });
	}

	static notFound<T extends string = LocaleKey>(params: ErrorProps<T> = {}) {
		return CustomException.from<T>({ ...params, code: ErrorCode.NotFound });
	}

	static conflict<T extends string = LocaleKey>(params: ErrorProps<T> = {}) {
		return CustomException.from<T>({ ...params, code: ErrorCode.Conflict });
	}

	static internal<T extends string = LocaleKey>(params: ErrorProps<T> = {}) {
		return CustomException.from<T>({
			...params,
			code: ErrorCode.InternalServerError,
		});
	}

	/**
	 * A dependency this API cannot answer without is down. Never a denial —
	 * an Ory outage that reads as 403 is the trap the stack's docs call out.
	 */
	static serviceUnavailable<T extends string = LocaleKey>(
		params: ErrorProps<T> = {},
	) {
		return CustomException.from<T>({
			...params,
			code: ErrorCode.ServiceUnavailable,
		});
	}
}
