import { describe, expect, test } from 'bun:test';
import { janus } from './alignment.fixtures';
import { record } from './fixtures';
import { repoName, scopeKey } from './scope';

describe('scopeKey', () => {
	test('makes packages, repos and slugs comparable', () => {
		expect(scopeKey('@nxgt/mail')).toBe('nxgt-mail');
		expect(scopeKey('softistx/nxgt-mail')).toBe('nxgt-mail');
		expect(scopeKey('nxgt-mail.git')).toBe('nxgt-mail');
		expect(scopeKey('  NXGT-Mail ')).toBe('nxgt-mail');
	});
});

describe('repoName', () => {
	test('from the remote, else the worktree', () => {
		expect(repoName(janus)).toBe('nxgt-janus');
		expect(repoName(record('x', { worktree: '/w/nxgt-ory' }))).toBe('nxgt-ory');
		expect(repoName(record('y'))).toBeUndefined();
	});

	test('every shape of a remote gives the same name', () => {
		for (const remote of [
			'git@github.com:softistx/nxgt-mail.git',
			'https://github.com/softistx/nxgt-mail',
			'https://github.com/SoftistX/NXGT-Mail.git/',
			'ssh://git@github.com/softistx/nxgt-mail.git',
		]) {
			expect(repoName({ remote, worktree: '/w/wt' })).toBe('nxgt-mail');
		}
	});
});
