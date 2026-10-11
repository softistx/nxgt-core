import { describe, expect, test } from 'bun:test';
import { disabled } from './hook';

describe('disabled', () => {
	test.each(['1', 'true', 'TRUE', ' 1 '])(
		'NXGT_ISSUES_DISABLE=%p opts out',
		(value) => {
			expect(disabled({ NXGT_ISSUES_DISABLE: value })).toBe(true);
		},
	);

	test.each([undefined, '', '0', 'false', 'no', 'yes'])(
		'NXGT_ISSUES_DISABLE=%p keeps the plugin on',
		(value) => {
			expect(disabled({ NXGT_ISSUES_DISABLE: value })).toBe(false);
		},
	);
});
