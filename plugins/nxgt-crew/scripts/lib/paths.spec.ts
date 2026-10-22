import { describe, expect, test } from 'bun:test';
import { isHomeOrAbove } from './paths';

describe('isHomeOrAbove', () => {
	const home = '/Users/steve';

	test.each(['/Users/steve', '/Users/steve/', '/Users', '/'])(
		'%s is the home folder or above',
		(dir) => {
			expect(isHomeOrAbove(dir, home)).toBe(true);
		},
	);

	test.each([
		'/Users/steve/workspace',
		'/Users/steve/workspace/dev/repo',
		'/Users/stevex',
		'/Users/other',
	])('%s is below or beside the home folder', (dir) => {
		expect(isHomeOrAbove(dir, home)).toBe(false);
	});

	test('a trailing slash on home does not matter', () => {
		expect(isHomeOrAbove('/Users/steve', '/Users/steve/')).toBe(true);
		expect(isHomeOrAbove('/Users/steve/x', '/Users/steve/')).toBe(false);
	});
});
