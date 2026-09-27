import { describe, expect, test } from 'bun:test';
import {
	directoriesToResolve,
	parseCommand,
	resolvePath,
	segments,
	staticBase,
	tokenize,
} from './command';

const where = { cwd: '/repo', home: '/home/u' };
const parse = (c: string) => parseCommand(c, where);

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

	test('a glob is checked at its first static directory', () => {
		expect(staticBase('/tmp/a/*')).toBe('/tmp/a');
		expect(staticBase('/tmp/a/b?/c')).toBe('/tmp/a');
		expect(staticBase('/tmp/a')).toBe('/tmp/a');
	});
});

describe('git operations', () => {
	test.each([
		'checkout main',
		'switch -c x',
		'reset --hard',
		'stash',
		'stash pop',
		'clean -fdx',
		'rebase develop',
		'merge x',
		'pull',
		'restore .',
		'cherry-pick abc',
		'revert abc',
		'am x.patch',
	])('git %s moves the worktree', (sub) => {
		expect(parse(`git ${sub}`)).toEqual([
			{ kind: 'tree', verb: sub.split(' ')[0] as string, dir: '/repo' },
		]);
	});

	test('read-only git commands are ignored', () => {
		expect(
			parse('git status && git log --oneline && git stash list && git diff'),
		).toEqual([]);
	});

	test('cd and -C set where the operation lands', () => {
		expect(parse('cd ../other && git checkout x')).toEqual([
			{ kind: 'tree', verb: 'checkout', dir: '/other' },
		]);
		expect(parse('git -C /elsewhere -c core.pager=cat reset --hard')).toEqual([
			{ kind: 'tree', verb: 'reset', dir: '/elsewhere' },
		]);
	});

	test('a cd into a variable leaves the directory unknown', () => {
		expect(parse('cd "$d/wt" && git checkout x')).toEqual([
			{ kind: 'tree', verb: 'checkout', dir: undefined },
		]);
	});

	test('env assignments and wrappers are skipped', () => {
		expect(parse('GIT_TRACE=1 sudo git switch x')).toEqual([
			{ kind: 'tree', verb: 'switch', dir: '/repo' },
		]);
	});

	test('worktree remove and move carry their target', () => {
		expect(parse('git worktree remove --force ../wt')).toEqual([
			{ kind: 'worktree-remove', dir: '/repo', target: '/wt' },
		]);
		expect(parse('git worktree add ../wt')).toEqual([]);
	});

	test('branch deletion names its branches', () => {
		expect(parse('git branch -D feat/a feat/b')).toEqual([
			{ kind: 'branch-delete', dir: '/repo', branches: ['feat/a', 'feat/b'] },
		]);
		expect(parse('git branch --delete x')).toEqual([
			{ kind: 'branch-delete', dir: '/repo', branches: ['x'] },
		]);
		expect(parse('git branch -a')).toEqual([]);
	});

	test('a force push names its branch, or the current one', () => {
		expect(parse('git push --force origin feat/x')).toEqual([
			{ kind: 'force-push', dir: '/repo', branch: 'feat/x' },
		]);
		expect(parse('git push -f')).toEqual([
			{ kind: 'force-push', dir: '/repo' },
		]);
		expect(
			parse('git push --force-with-lease origin HEAD:refs/heads/y'),
		).toEqual([{ kind: 'force-push', dir: '/repo', branch: 'y' }]);
		expect(parse('git push origin +z')).toEqual([
			{ kind: 'force-push', dir: '/repo', branch: 'z' },
		]);
		expect(parse('git push -u origin feat/x')).toEqual([]);
	});

	test('git rm deletes paths', () => {
		expect(parse('git rm -r src/old')).toEqual([
			{ kind: 'delete', dir: '/repo', paths: ['/repo/src/old'] },
		]);
	});
});

describe('deletions', () => {
	test('rm, rmdir, unlink resolve their paths', () => {
		expect(parse('rm -rf build /tmp/x -- -weird')).toEqual([
			{
				kind: 'delete',
				dir: '/repo',
				paths: ['/repo/build', '/tmp/x', '/repo/-weird'],
			},
		]);
		expect(parse('rmdir a')).toEqual([
			{ kind: 'delete', dir: '/repo', paths: ['/repo/a'] },
		]);
	});

	test('mv deletes its sources, not its destination', () => {
		expect(parse('mv a b dest/')).toEqual([
			{ kind: 'delete', dir: '/repo', paths: ['/repo/a', '/repo/b'] },
		]);
	});

	test('a path in a variable is not checked', () => {
		expect(parse('rm -rf "$d"')).toEqual([]);
	});
});

describe('publishing', () => {
	test.each([
		'npm publish',
		'bun publish --access public',
		'pnpm publish',
		'yarn npm publish',
		'bunx changeset publish',
		'bun run changeset:publish',
		'bun changeset:publish',
		'gh release create v1.0.0',
		'git push --follow-tags',
	])('%s publishes', (c) => {
		expect(parse(c).some((o) => o.kind === 'publish')).toBe(true);
	});

	test.each(['npm install', 'bun run build', 'bun test', 'gh release view'])(
		'%s does not',
		(c) => {
			expect(parse(c).some((o) => o.kind === 'publish')).toBe(false);
		},
	);
});

describe('directoriesToResolve', () => {
	test('each git directory once, none for deletions', () => {
		const ops = parse('git checkout x; git -C /b reset; git -C /b stash; rm y');
		expect(directoriesToResolve(ops)).toEqual(['/repo', '/b']);
	});
});
