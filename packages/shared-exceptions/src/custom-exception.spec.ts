import { describe, expect, it } from 'bun:test';
import { CustomException } from './custom-exception';
import { ErrorCode } from './error-code';
import type { StatusCode } from './status';

/**
 * Neither repository had a test for this class, and the two had forked its
 * constructor, its `code` type and one factory's name. These lock down the
 * superset: both call shapes work, `code` stays numeric, and the symbolic code
 * never disagrees with it.
 */
describe('CustomException', () => {
	describe('sellix-monorepo call shape (positional)', () => {
		it('keeps code numeric, which c.status() requires', () => {
			const err = new CustomException('errors.not-found', 404);
			expect(err.code).toBe(404);
			expect(typeof err.code).toBe('number');
		});

		it('defaults to 400 and carries message, options and debugMessage', () => {
			const err = new CustomException(
				'errors.bad-request',
				undefined,
				{ field: 'email' },
				'raw parser output',
			);
			expect(err.code).toBe(400);
			expect(err.message).toBe('errors.bad-request');
			expect(err.options).toEqual({ field: 'email' });
			expect(err.debugMessage).toBe('raw parser output');
		});
	});

	describe('nxgt-federation call shape (object)', () => {
		it('accepts a symbolic code and resolves the status from it', () => {
			const err = new CustomException({
				message: 'errors.not-found',
				code: ErrorCode.NotFound,
			});
			expect(err.code).toBe(404);
			expect(err.errorCode).toBe(ErrorCode.NotFound);
		});

		it('reads debugMessage from the top level, not from options', () => {
			const err = new CustomException({
				message: 'errors.validation-failed',
				debugMessage: 'zod said no',
			});
			expect(err.debugMessage).toBe('zod said no');
		});

		it('defaults an empty construction to BadRequest / 400', () => {
			const err = new CustomException({});
			expect(err.code).toBe(400);
			expect(err.errorCode).toBe(ErrorCode.BadRequest);
		});
	});

	describe('the two codes never disagree', () => {
		it('maps ValidationError to 400, the status federation already answered', () => {
			expect(
				new CustomException({ code: ErrorCode.ValidationError }).code,
			).toBe(400);
		});

		it.each<[StatusCode, ErrorCode]>([
			[400, ErrorCode.BadRequest],
			[401, ErrorCode.Unauthenticated],
			[403, ErrorCode.Forbidden],
			[404, ErrorCode.NotFound],
			[409, ErrorCode.Conflict],
			[500, ErrorCode.InternalServerError],
			[503, ErrorCode.ServiceUnavailable],
		])('maps %i both ways', (status, errorCode) => {
			expect(new CustomException(null, status).errorCode).toBe(errorCode);
			expect(new CustomException({ code: errorCode }).code).toBe(status);
		});

		it('falls back sanely for a status with no symbolic code', () => {
			expect(new CustomException(null, 418).code).toBe(418);
			expect(new CustomException(null, 418).errorCode).toBe(
				ErrorCode.BadRequest,
			);
			expect(new CustomException(null, 502).errorCode).toBe(
				ErrorCode.InternalServerError,
			);
		});
	});

	describe('factories from both sides survive', () => {
		it.each([
			['badRequest', 400],
			['validationError', 400],
			['unauthenticated', 401],
			['unauthorized', 401],
			['forbidden', 403],
			['notFound', 404],
			['conflict', 409],
			['internal', 500],
			['serviceUnavailable', 503],
		])('%s answers %i', (factory, status) => {
			const err = (CustomException as any)[factory]({ message: 'errors.x' });
			expect(err.code).toBe(status);
			expect(err).toBeInstanceOf(CustomException);
		});

		it('unauthorized is exactly unauthenticated, under sellix’s name', () => {
			expect(CustomException.unauthorized({}).errorCode).toBe(
				CustomException.unauthenticated({}).errorCode,
			);
		});

		it('from() honours an explicit code, and defaults without one', () => {
			expect(
				CustomException.from({ message: 'errors.x', code: 409 }).code,
			).toBe(409);
			expect(CustomException.from({ message: 'errors.x' }).code).toBe(400);
		});
	});
});
