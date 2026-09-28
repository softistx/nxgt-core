import { describe, expect, it } from 'bun:test';
import { OryUnavailable } from '@nxgt/ory-sdk';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { GraphQLError } from 'graphql';
import { createFormatError } from './format-error';
import { createMaskError } from './mask-error';
import { isOryUnavailable } from './ory-unavailable';

const translate = (key: string) => `t(${key})`;
const mask = createMaskError(translate as never);

/** What Yoga hands `maskError`: the resolver's error wrapped in a GraphQLError. */
const wrapped = (original: Error) =>
	new GraphQLError(original.message, {
		originalError: original,
		path: ['note'],
	});

/**
 * An `OryUnavailable` from a second copy of `@nxgt/ory-sdk`: same name, same
 * shape, a different class — what `instanceof` alone would miss.
 */
class ForeignOryUnavailable extends Error {
	readonly service = 'keto';
	constructor() {
		super('keto answered 502');
		this.name = 'OryUnavailable';
	}
}

describe('createMaskError', () => {
	it.each([
		['unauthenticated', ErrorCode.Unauthenticated, 401],
		['forbidden', ErrorCode.Forbidden, 403],
		['notFound', ErrorCode.NotFound, 404],
	] as const)('%s -> %s with http status %d', (factory, code, status) => {
		const exception = CustomException[factory]({ message: 'errors.x' });
		const error = mask(wrapped(exception), 'Unexpected error.', false);

		expect(error).toBeInstanceOf(GraphQLError);
		expect((error as GraphQLError).extensions).toMatchObject({
			code,
			http: { status },
		});
		expect((error as GraphQLError).message).toBe('t(errors.x)');
	});

	it('answers an outage 503 SERVICE_UNAVAILABLE, never a denial', () => {
		const error = mask(
			wrapped(new OryUnavailable('keto', 503, null)),
			'Unexpected error.',
			false,
		) as GraphQLError;

		expect(error.extensions).toMatchObject({
			code: ErrorCode.ServiceUnavailable,
			http: { status: 503 },
		});
	});

	it('recognises an outage from a second copy of @nxgt/ory-sdk', () => {
		const error = mask(
			wrapped(new ForeignOryUnavailable()),
			'Unexpected error.',
			false,
		) as GraphQLError;
		expect(error.extensions.code).toBe(ErrorCode.ServiceUnavailable);
	});

	it('masks a plain Error a resolver threw, keeping its path', () => {
		const error = mask(
			wrapped(new Error('connect ECONNREFUSED 10.0.0.5:27017')),
			'Unexpected error.',
			false,
		) as GraphQLError;
		expect(error.message).toBe('Unexpected error.');
		expect(error.extensions.code).toBe(ErrorCode.InternalServerError);
		expect(error.path).toEqual(['note']);
	});

	it('lets a GraphQLError thrown on purpose through', () => {
		const deliberate = new GraphQLError('Bad cursor', {
			extensions: { code: 'BAD_USER_INPUT' },
		});
		const thrown = wrapped(deliberate);
		expect(mask(thrown, 'Unexpected error.', false)).toBe(thrown);
		expect(mask(deliberate, 'Unexpected error.', false)).toBe(deliberate);
	});
});

describe('createFormatError', () => {
	it('answers an outage SERVICE_UNAVAILABLE under Apollo too', () => {
		const format = createFormatError(translate as never);
		const formatted = format?.(
			{ message: 'keto answered 503', extensions: { code: 'X' } },
			wrapped(new OryUnavailable('keto', 503, null)),
		);
		expect(formatted?.extensions).toMatchObject({
			code: ErrorCode.ServiceUnavailable,
			http: { status: 503 },
		});
	});
});

describe('isOryUnavailable', () => {
	it('takes the class, or the name and shape; nothing else', () => {
		expect(isOryUnavailable(new OryUnavailable('kratos', 0, null))).toBe(true);
		expect(isOryUnavailable(new ForeignOryUnavailable())).toBe(true);
		expect(isOryUnavailable(new Error('OryUnavailable'))).toBe(false);
		expect(isOryUnavailable({ name: 'OryUnavailable', service: 'keto' })).toBe(
			false,
		);
	});
});
