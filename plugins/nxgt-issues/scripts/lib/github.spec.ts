import { afterAll, describe, expect, test } from 'bun:test';
import {
	GhError,
	gh,
	ghJson,
	RATE_LIMIT_PAUSE_MS,
	RateLimitedError,
	rateLimitedUntil,
	repoFacts,
} from './github';
import { commentIssue, createIssue, privateRepos } from './github-issues';
import { fakeRunner, type RunRule } from './runner.fixtures';
import { removeTempDirs, tempDir } from './temp.fixtures';

afterAll(removeTempDirs);

const NOW = 1_000_000;
const WIDGET = { owner: 'softistx', repo: 'nxgt-widget' };

const ctxWith = (rules: RunRule[], now = NOW) => {
	const runner = fakeRunner({ run: rules });
	const home = tempDir('gh');
	return { runner, home, now: () => now };
};

describe('gh', () => {
	test('returns stdout on success and passes stdin', async () => {
		const ctx = ctxWith([{ argv: ['gh'], result: { stdout: 'ok' } }]);
		expect(await gh(ctx, ['x'], 'body')).toBe('ok');
		expect(ctx.runner.calls[0]?.options.stdin).toBe('body');
	});

	test('a failure throws GhError', async () => {
		const ctx = ctxWith([
			{ argv: ['gh'], result: { code: 1, stderr: 'boom' } },
		]);
		await expect(gh(ctx, ['x'])).rejects.toBeInstanceOf(GhError);
		expect(rateLimitedUntil(ctx.home, NOW)).toBeUndefined();
	});

	test.each([
		'API rate limit exceeded for user',
		'You have exceeded a secondary rate limit',
		'HTTP 429: Too Many Requests',
	])('%p pauses every call for 15 minutes', async (stderr) => {
		const ctx = ctxWith([{ argv: ['gh'], result: { code: 1, stderr } }]);
		await expect(gh(ctx, ['x'])).rejects.toBeInstanceOf(RateLimitedError);
		expect(rateLimitedUntil(ctx.home, NOW)).toBe(NOW + RATE_LIMIT_PAUSE_MS);
		await expect(gh(ctx, ['y'])).rejects.toBeInstanceOf(RateLimitedError);
		expect(ctx.runner.calls).toHaveLength(1);
	});

	test('the pause lifts once rateLimitedUntil has passed', async () => {
		const failing = ctxWith([
			{ argv: ['gh'], result: { code: 1, stderr: 'rate limit' } },
		]);
		await gh(failing, ['x']).catch(() => undefined);
		const later = ctxWith([{ argv: ['gh'], result: { stdout: 'ok' } }]);
		const ctx = {
			...later,
			home: failing.home,
			now: () => NOW + RATE_LIMIT_PAUSE_MS,
		};
		expect(await gh(ctx, ['x'])).toBe('ok');
	});

	test('ghJson refuses output that is not JSON', async () => {
		const ctx = ctxWith([{ argv: ['gh'], result: { stdout: '<html>' } }]);
		await expect(ghJson(ctx, ['x'])).rejects.toBeInstanceOf(GhError);
	});
});

describe('wrappers', () => {
	test('repoFacts reads the gate fields', async () => {
		const ctx = ctxWith([
			{
				argv: ['gh', 'api', 'repos/softistx/nxgt-widget'],
				result: {
					stdout: JSON.stringify({
						full_name: 'softistx/nxgt-widget',
						has_issues: true,
						archived: false,
						private: true,
					}),
				},
			},
		]);
		expect(await repoFacts(ctx, WIDGET)).toEqual({
			fullName: 'softistx/nxgt-widget',
			hasIssues: true,
			archived: false,
			private: true,
		});
	});

	test('createIssue sends the body on stdin and returns the URL', async () => {
		const ctx = ctxWith([
			{
				argv: ['gh', 'issue', 'create'],
				result: { stdout: 'x\nhttps://u/1\n' },
			},
		]);
		const url = await createIssue(ctx, WIDGET, {
			title: 'T',
			body: 'B',
			labels: ['bug', 'consumer-report'],
		});
		expect(url).toBe('https://u/1');
		const call = ctx.runner.calls[0];
		expect(call?.options.stdin).toBe('B');
		expect(call?.argv).toEqual(
			expect.arrayContaining([
				'--body-file',
				'-',
				'--title',
				'T',
				'-R',
				'softistx/nxgt-widget',
				'--label',
				'bug,consumer-report',
			]),
		);
	});

	test('commentIssue targets the number and sends the body on stdin', async () => {
		const ctx = ctxWith([
			{ argv: ['gh', 'issue', 'comment', '7'], result: { stdout: 'u\n' } },
		]);
		expect(await commentIssue(ctx, WIDGET, 7, 'C')).toBe('u');
		expect(ctx.runner.calls[0]?.options.stdin).toBe('C');
	});

	test('privateRepos keeps the names', async () => {
		const ctx = ctxWith([
			{
				argv: ['gh', 'repo', 'list', 'softistx'],
				result: {
					stdout: JSON.stringify([{ nameWithOwner: 'softistx/a' }, {}]),
				},
			},
		]);
		expect(await privateRepos(ctx, 'softistx')).toEqual(['softistx/a']);
		expect(ctx.runner.calls[0]?.argv).toContain('private');
	});
});

describe('a 403 that is not a rate limit', () => {
	test('is a permission GhError and pauses nothing', async () => {
		const ctx = ctxWith([
			{
				argv: ['gh'],
				result: {
					code: 1,
					stderr: 'HTTP 403: Resource not accessible by integration',
				},
			},
		]);
		const error = await gh(ctx, ['x']).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(GhError);
		expect((error as GhError).message).toContain('permission');
		expect(rateLimitedUntil(ctx.home, NOW)).toBeUndefined();
	});

	test.each([
		'HTTP 403: You have exceeded a secondary rate limit',
		'HTTP 403: abuse detection mechanism',
		'HTTP 403: API rate limit exceeded',
	])('%p still pauses', async (stderr) => {
		const ctx = ctxWith([{ argv: ['gh'], result: { code: 1, stderr } }]);
		await expect(gh(ctx, ['x'])).rejects.toBeInstanceOf(RateLimitedError);
	});
});
