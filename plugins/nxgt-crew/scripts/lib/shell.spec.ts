import { describe, expect, test } from 'bun:test';
import {
	deletionTarget,
	redact,
	resolvePath,
	segments,
	tokenize,
} from './shell';

describe('tokenize and segments', () => {
	test('quotes group, operators separate', () => {
		expect(tokenize(`git commit -m "a b" && echo 'c d'; ls|wc`)).toEqual([
			'git',
			'commit',
			'-m',
			'a b',
			'&&',
			'echo',
			'c d',
			';',
			'ls',
			'|',
			'wc',
		]);
	});

	test('a command substitution is read as its own segment', () => {
		expect(segments('echo $(git reset --hard)')).toEqual([
			['echo'],
			['git', 'reset', '--hard'],
		]);
	});

	test('comments are dropped', () => {
		expect(segments('git status # then git reset')).toEqual([
			['git', 'status'],
		]);
	});
});

describe('resolvePath', () => {
	test('relative to the directory, with ~ expanded', () => {
		expect(resolvePath('a/../b', '/repo', '/home/u')).toBe('/repo/b');
		expect(resolvePath('~/x', '/repo', '/home/u')).toBe('/home/u/x');
	});

	test('anything the shell would expand is unknown', () => {
		expect(resolvePath('$d/wt', '/repo', '/home/u')).toBeUndefined();
		expect(resolvePath('`pwd`', '/repo', '/home/u')).toBeUndefined();
		expect(resolvePath('rel', undefined, '/home/u')).toBeUndefined();
	});

	test('a glob is a pattern in the last component, else its first static directory', () => {
		expect(deletionTarget('/tmp/a/*')).toEqual({ path: '/tmp/a' });
		expect(deletionTarget('/tmp/a/.*')).toEqual({ path: '/tmp/a' });
		expect(deletionTarget('/tmp/a/b?/c')).toEqual({ path: '/tmp/a' });
		expect(deletionTarget('/tmp/a/*.log')).toEqual({ pattern: '/tmp/a/*.log' });
		expect(deletionTarget('/tmp/a')).toEqual({ path: '/tmp/a' });
	});
});

describe('redact', () => {
	test('masks credential flags in both forms and drops assignments', () => {
		expect(
			redact([
				'TOKEN=x',
				'npm',
				'publish',
				'--otp',
				'1',
				'--registry=r',
				'--_authToken=s',
			]),
		).toBe('npm publish --otp *** --registry=r --_authToken=***');
	});
});
