import { describe, expect, test } from 'bun:test';
import { resolveWsUser } from './ws-context';

function fakeAuthClient(response: { active: boolean; sub?: string } | null) {
	return { POST: async () => ({ data: response }) } as any;
}

describe('resolveWsUser', () => {
	test('returns no user when connectionParams has no token', async () => {
		const result = await resolveWsUser({}, fakeAuthClient(null));
		expect(result.user).toBeUndefined();
		expect(result.token).toBeUndefined();
	});

	test('strips Bearer and populates user from an active introspection response', async () => {
		const result = await resolveWsUser(
			{ authorization: 'Bearer abc123' },
			fakeAuthClient({ active: true, sub: 'user-1' }),
		);
		expect(result.token).toBe('abc123');
		expect(result.user).toMatchObject({ sub: 'user-1', name: 'user-1' });
	});

	test('falls back to the capitalized Authorization key', async () => {
		const result = await resolveWsUser(
			{ Authorization: 'Bearer abc123' },
			fakeAuthClient({ active: true, sub: 'user-1' }),
		);
		expect(result.token).toBe('abc123');
	});

	test('returns no user for an inactive token but still returns the token', async () => {
		const result = await resolveWsUser(
			{ authorization: 'Bearer expired' },
			fakeAuthClient({ active: false }),
		);
		expect(result.user).toBeUndefined();
		expect(result.token).toBe('expired');
	});
});
