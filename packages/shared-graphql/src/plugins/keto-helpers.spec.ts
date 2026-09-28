import { describe, expect, it } from 'bun:test';
import { type Ory, OryUnavailable, type Permission } from '@nxgt/ory-sdk';
import type { TokenPrincipal } from '@nxgt/shared';
import { CustomException, ErrorCode } from '@nxgt/shared-exceptions';
import { createKetoChecks } from './keto-checker';
import { can, requireUser } from './keto-helpers';

const codeOf = (error: unknown) => (error as CustomException).errorCode;

describe('requireUser', () => {
	it('returns the caller', () => {
		const user = { sub: 'idn-7' } as TokenPrincipal;
		expect(requireUser({ user })).toBe(user);
	});

	it('refuses an anonymous caller as UNAUTHENTICATED', () => {
		try {
			requireUser({});
			throw new Error('unreachable');
		} catch (error) {
			expect(error).toBeInstanceOf(CustomException);
			expect(codeOf(error)).toBe(ErrorCode.Unauthenticated);
		}
	});
});

describe('can', () => {
	const signedIn = { ory: { subject: 'idn-7' } } as const;
	const question = { name: 'view', type: 'Note', id: 'n1' };

	it("answers Keto's answer, in @permission's words", async () => {
		const asked: Permission[] = [];
		const ketoChecks = async (permission: Permission) => {
			asked.push(permission);
			return true;
		};
		expect(await can({ ...signedIn, ketoChecks } as never, question)).toBe(
			true,
		);
		expect(asked).toEqual([
			{ namespace: 'Note', object: 'n1', relation: 'view' },
		]);
	});

	it('shares the per-request memo the directives use', async () => {
		let batches = 0;
		const ory = {
			checkMany: async (questions: unknown[]) => {
				batches += 1;
				return questions.map(() => false);
			},
		} as unknown as Ory;
		const context = { ...signedIn, ketoChecks: createKetoChecks(ory) };

		expect(await can(context as never, question)).toBe(false);
		expect(await can(context as never, question)).toBe(false);
		expect(batches).toBe(1);
	});

	it('throws on an outage, never answers false', async () => {
		const ketoChecks = async () => {
			throw new OryUnavailable('keto', 503, null);
		};
		await expect(
			can({ ...signedIn, ketoChecks } as never, question),
		).rejects.toBeInstanceOf(OryUnavailable);
	});

	it('refuses an anonymous caller before asking', async () => {
		let asked = false;
		const ketoChecks = async () => {
			asked = true;
			return true;
		};
		const refusal = await can({ ory: null, ketoChecks }, question).catch(
			(error: unknown) => error,
		);
		expect(codeOf(refusal)).toBe(ErrorCode.Unauthenticated);
		expect(asked).toBe(false);
	});

	it('names the missing plugin rather than answering', async () => {
		await expect(can(signedIn as never, question)).rejects.toThrow(
			/useKetoChecks\(ory\) is not registered/,
		);
	});
});

describe('createKetoChecks after an outage', () => {
	it('does not memoise the failure: the next ask goes back to Keto', async () => {
		let calls = 0;
		const ory = {
			checkMany: async (questions: unknown[]) => {
				calls += 1;
				if (calls === 1) throw new OryUnavailable('keto', 0, null);
				return questions.map(() => true);
			},
		} as unknown as Ory;
		const check = createKetoChecks(ory);
		const view = { namespace: 'Note', object: 'n1', relation: 'view' };

		await expect(check(view, 'idn-7')).rejects.toBeInstanceOf(OryUnavailable);
		expect(await check(view, 'idn-7')).toBe(true);
	});
});
