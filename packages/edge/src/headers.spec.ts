import { describe, expect, test } from 'bun:test';
import { USER_HEADERS } from '@nxgt/shared/models';
import {
	forwardHeaders,
	responseHeaders,
	SCRUBBED_REQUEST_HEADERS,
} from './headers';

const base = { host: 'edge.test', proto: 'https' };

describe('forwardHeaders', () => {
	test('erases every identity header a caller could have set', () => {
		const incoming = new Headers({
			[USER_HEADERS.ID]: 'someone-else',
			[USER_HEADERS.AUTHORITIES]: 'ADMIN',
			[USER_HEADERS.ROLES]: 'ADMIN',
			[USER_HEADERS.CLAIMS]: '{"sub":"root"}',
			accept: 'application/json',
		});

		const headers = forwardHeaders(incoming, base);

		// `currentUser()` in sellix's `apps/services/*` builds a principal —
		// id, authorities, roles — out of exactly these, gated by nothing.
		for (const name of Object.values(USER_HEADERS)) {
			expect(headers.get(name)).toBeNull();
		}
		expect(headers.get('accept')).toBe('application/json');
	});

	test('the scrub list is derived from USER_HEADERS, so it cannot fall behind', () => {
		for (const name of Object.values(USER_HEADERS)) {
			expect(SCRUBBED_REQUEST_HEADERS).toContain(name.toLowerCase());
		}
	});

	test('a caller cannot choose their own forwarded address', () => {
		const headers = forwardHeaders(
			new Headers({
				'x-forwarded-for': '10.0.0.1',
				'x-forwarded-proto': 'https',
			}),
			{ ...base, clientAddress: '203.0.113.7', proto: 'http' },
		);

		expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
		expect(headers.get('x-forwarded-proto')).toBe('http');
		expect(headers.get('x-forwarded-host')).toBe('edge.test');
	});

	test('the assertion REPLACES the caller credential, and only when there is one', () => {
		const withToken = forwardHeaders(
			new Headers({
				authorization: 'Bearer theirs',
				cookie: 'ory_kratos_session=x',
			}),
			{ ...base, assertion: 'ours' },
		);
		// `ory.resolve` reads the Bearer before the cookie, so the upstream
		// takes ours.
		expect(withToken.get('authorization')).toBe('Bearer ours');
		// The cookie still travels: a fronted app stays correct on its own
		// address, and one that reads the session cookie there must keep
		// working behind the edge.
		expect(withToken.get('cookie')).toBe('ory_kratos_session=x');

		const mirrored = forwardHeaders(
			new Headers({ authorization: 'Bearer theirs' }),
			base,
		);
		// Mirror mode mints nothing: the edge being mirrored has to
		// authenticate this request itself.
		expect(mirrored.get('authorization')).toBe('Bearer theirs');
	});
});

describe('responseHeaders', () => {
	test('several Set-Cookie headers survive as several', () => {
		const upstream = new Headers();
		upstream.append('set-cookie', 'session=a; Path=/; HttpOnly');
		upstream.append('set-cookie', 'csrf=b; Path=/');

		// `get('set-cookie')` folds them into one comma-joined string no
		// browser accepts, and a login that sets a session AND a CSRF cookie is
		// the ordinary case.
		expect(responseHeaders(upstream).getSetCookie()).toEqual([
			'session=a; Path=/; HttpOnly',
			'csrf=b; Path=/',
		]);
	});
});
