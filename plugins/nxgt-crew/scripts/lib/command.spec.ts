import { describe, expect, test } from 'bun:test';
import { directoriesToResolve, isPublish, parseCommand } from './command';

const where = { cwd: '/repo', home: '/home/u' };
const parse = (c: string) => parseCommand(c, where);

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
			{ kind: 'delete', dir: '/repo', paths: ['/repo/src/old'], patterns: [] },
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
				patterns: [],
			},
		]);
		expect(parse('rmdir a')).toEqual([
			{ kind: 'delete', dir: '/repo', paths: ['/repo/a'], patterns: [] },
		]);
	});

	test('mv deletes its sources, not its destination', () => {
		expect(parse('mv a b dest/')).toEqual([
			{
				kind: 'delete',
				dir: '/repo',
				paths: ['/repo/a', '/repo/b'],
				patterns: [],
			},
		]);
	});

	test('a glob in the last component is a pattern; a bare * deletes the folder', () => {
		expect(parse('rm -f *.orig /tmp/a/*')).toEqual([
			{
				kind: 'delete',
				dir: '/repo',
				paths: ['/tmp/a'],
				patterns: ['/repo/*.orig'],
			},
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

	test('the announced text drops assignments and masks credentials', () => {
		const op = parse(
			'NPM_CONFIG_TOKEN=npm_SECRET bun publish --otp 123456 --auth-token=abc --access public',
		)[0];
		expect(op).toEqual({
			kind: 'publish',
			dir: '/repo',
			text: 'bun publish --otp *** --auth-token=*** --access public',
		});
	});

	test('only scripts named publish or release count', () => {
		expect(isPublish(['bun', 'run', 'release:npm'])).toBe(true);
		expect(isPublish(['npm', 'run', 'release-notes'])).toBe(false);
		expect(isPublish(['bun', 'run', 'prerelease:check'])).toBe(false);
	});

	test.each(['npm install', 'bun run build', 'bun test', 'gh release view'])(
		'%s does not',
		(c) => {
			expect(parse(c).some((o) => o.kind === 'publish')).toBe(false);
		},
	);
});

describe('heredocs and subshells', () => {
	test('a heredoc body is data, not commands', () => {
		const c =
			"cat > notes.md <<'EOF'\nTo undo: git reset --hard\nrm -rf build\ncd /elsewhere\nit's fine\nEOF\ngit checkout main";
		expect(parse(c)).toEqual([
			{ kind: 'tree', verb: 'checkout', dir: '/repo' },
		]);
	});

	test('<<- and unquoted delimiters, and markdown backticks in the body', () => {
		const c =
			'gh pr create --body-file - <<-BODY\n\tRun `rm -rf dist` first\n\tBODY\necho ok';
		expect(parse(c)).toEqual([]);
	});

	test('a here-string is not a heredoc', () => {
		expect(parse('cat <<< "x"; git stash')).toEqual([
			{ kind: 'tree', verb: 'stash', dir: '/repo' },
		]);
	});

	test('a cd inside a subshell does not leak out', () => {
		expect(parse('(cd /other && git status); git checkout main')).toEqual([
			{ kind: 'tree', verb: 'checkout', dir: '/repo' },
		]);
		expect(parse('echo $(cd /x && pwd) && git reset')).toEqual([
			{ kind: 'tree', verb: 'reset', dir: '/repo' },
		]);
	});

	test('popd leaves the directory unknown', () => {
		expect(parse('pushd /x && popd && git reset')).toEqual([
			{ kind: 'tree', verb: 'reset', dir: undefined },
		]);
	});
});

describe('directoriesToResolve', () => {
	test('each git directory once, none for deletions', () => {
		const ops = parse('git checkout x; git -C /b reset; git -C /b stash; rm y');
		expect(directoriesToResolve(ops)).toEqual(['/repo', '/b']);
	});
});
