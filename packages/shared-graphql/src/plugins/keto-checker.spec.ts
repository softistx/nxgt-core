import { describe, expect, it } from 'bun:test';
import {
	type Ory,
	OryUnavailable,
	type Permission,
	tuple,
} from '@nxgt/ory-sdk';
import { createKetoChecks } from './keto-checker';

function fakeOry(held: string[]) {
	const batches: number[] = [];
	const ory = {
		checkMany: async (
			questions: { permission: Permission; subject: string }[],
		) => {
			batches.push(questions.length);
			return questions.map(({ permission, subject }) =>
				held.includes(tuple(permission, subject)),
			);
		},
	} as unknown as Ory;
	return { ory, batches };
}

const view: Permission = { namespace: 'Note', object: 'n1', relation: 'view' };
const edit: Permission = { namespace: 'Note', object: 'n1', relation: 'edit' };

describe('createKetoChecks', () => {
	it('asks the same question once, however many times it is asked', async () => {
		const { ory, batches } = fakeOry(['Note:n1#view@idn-7']);
		const check = createKetoChecks(ory);

		const answers = await Promise.all([
			check(view, 'idn-7'),
			check(view, 'idn-7'),
		]);

		expect(answers).toEqual([true, true]);
		expect(batches).toEqual([1]);
	});

	it('sends distinct questions of one tick as a single batch', async () => {
		const { ory, batches } = fakeOry(['Note:n1#view@idn-7']);
		const check = createKetoChecks(ory);

		expect(
			await Promise.all([check(view, 'idn-7'), check(edit, 'idn-7')]),
		).toEqual([true, false]);
		expect(batches).toEqual([2]);
	});

	it('keeps its answers for the life of the request', async () => {
		const { ory, batches } = fakeOry([]);
		const check = createKetoChecks(ory);

		await check(view, 'idn-7');
		await check(view, 'idn-7');

		expect(batches).toEqual([1]);
	});

	it('does not memoise an outage: the next ask goes back to Keto', async () => {
		let calls = 0;
		const ory = {
			checkMany: async (questions: unknown[]) => {
				calls += 1;
				if (calls === 1) throw new OryUnavailable('keto', 0, null);
				return questions.map(() => true);
			},
		} as unknown as Ory;
		const check = createKetoChecks(ory);

		await expect(check(view, 'idn-7')).rejects.toBeInstanceOf(OryUnavailable);
		expect(await check(view, 'idn-7')).toBe(true);
	});
});
