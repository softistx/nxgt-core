import { afterAll, describe, expect, test } from 'bun:test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { main } from './cli';
import { EXIT } from './cli-context';
import { fakeWorld } from './release.fixtures';
import { cliContext, makeLibrary } from './release-checkout.fixtures';
import { releasedCommand } from './release-command';
import { removeTempDirs } from './temp.fixtures';

afterAll(removeTempDirs);

const world = () =>
	fakeWorld({
		prs: { 40: { closing: [12] } },
		issues: { 12: {} },
		tracking: [
			{
				repo: 'softistx/acme-store',
				number: 21,
				title: 'workaround',
				body: '<!-- nxgt-issues:upstream=softistx/nxgt-widget#12 -->',
			},
		],
	});

describe('issues.ts released', () => {
	test('releases the package from the checkout and prints the notification list', async () => {
		const fake = world();
		const { ctx, out, err } = cliContext(fake, makeLibrary());
		expect(await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false)).toBe(
			EXIT.ok,
		);
		expect(err).toEqual([]);
		expect(out.join('\n')).toContain('#12');
		expect(out.join('\n')).toContain('softistx/acme-store#21');
		expect(fake.world.issues[12]?.state).toBe('CLOSED');
	});

	test('--json prints the report', async () => {
		const { ctx, out } = cliContext(world(), makeLibrary());
		await releasedCommand(ctx, '@nxgt/widget@1.4.0', true, true);
		const report = JSON.parse(out.join('\n'));
		expect(report).toMatchObject({
			package: '@nxgt/widget',
			version: '1.4.0',
			dryRun: true,
			prs: [40],
		});
		expect(report.notify).toHaveLength(1);
	});

	test('--dry-run writes nothing', async () => {
		const fake = world();
		const { ctx, out } = cliContext(fake, makeLibrary());
		await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, true);
		expect(fake.writes()).toEqual([]);
		expect(out.join('\n')).toContain('dry run');
	});

	test('is wired into main, and a malformed spec is a usage error', async () => {
		const { ctx, err } = cliContext(world(), makeLibrary());
		expect(await main(ctx, ['released', 'widget'])).toBe(EXIT.usage);
		expect(err.join('\n')).toContain('<pkg>@<version>');
		expect(await main(ctx, ['released'])).toBe(EXIT.usage);
	});

	test('a single package at the repository root is released', async () => {
		const fake = fakeWorld({
			prs: { 40: { closing: [12], files: ['src/a.ts'] } },
			issues: { 12: {} },
			tags: ['v1.4.0', 'v1.3.0'],
		});
		const { ctx } = cliContext(fake, makeLibrary(true));
		expect(await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false)).toBe(
			EXIT.ok,
		);
		expect(fake.world.issues[12]?.state).toBe('CLOSED');
	});

	const withOther = () => {
		const dir = makeLibrary();
		mkdirSync(join(dir, 'packages', 'other'), { recursive: true });
		writeFileSync(
			join(dir, 'packages', 'other', 'package.json'),
			JSON.stringify({ name: '@nxgt/other', version: '1.0.0' }),
		);
		return dir;
	};
	const fixing = (name: string) => ({
		prs: {
			40: {
				closing: [12],
				mergeSha: 'm40',
				files: ['packages/widget/a.ts', 'packages/other/b.ts'],
			},
		},
		issues: { 12: { body: `## Versions\n\n- \`${name}\` 1.0.0\n` } },
	});

	test('the other packages of the checkout are passed on, so an issue naming one the PR touched is left to it', async () => {
		const fake = fakeWorld(fixing('@nxgt/other'));
		const { ctx } = cliContext(fake, withOther());
		await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false);
		expect(fake.writes()).toEqual([]);
	});

	test("a monorepo's private root is neither a sibling nor a releasable package", async () => {
		const fake = fakeWorld(fixing('nxgt-widget'));
		const { ctx, err } = cliContext(fake, withOther());
		await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false);
		expect(fake.world.issues[12]?.state).toBe('CLOSED');
		expect(await releasedCommand(ctx, 'nxgt-widget@1.0.0', false, false)).toBe(
			EXIT.usage,
		);
		expect(err.join('\n')).toContain('nxgt-widget');
	});

	test('a package this checkout does not hold is a usage error', async () => {
		const { ctx, err } = cliContext(world(), makeLibrary());
		expect(await releasedCommand(ctx, '@nxgt/nope@1.0.0', false, false)).toBe(
			EXIT.usage,
		);
		expect(err.join('\n')).toContain('@nxgt/nope');
	});

	test('a checkout of a foreign owner is refused before any call', async () => {
		const fake = world();
		const { ctx } = cliContext(fake, makeLibrary());
		const foreign = { ...ctx, env: { NXGT_ISSUES_OWNERS: 'someone-else' } };
		expect(
			await releasedCommand(foreign, '@nxgt/widget@1.4.0', false, false),
		).toBe(EXIT.refusedGate);
		expect(fake.calls).toEqual([]);
	});

	test('a failed read of an issue exits 6 after reporting the rest', async () => {
		const fake = fakeWorld({
			prs: { 40: { closing: [12, 13] } },
			issues: { 13: {} },
		});
		const { ctx, out, err } = cliContext(fake, makeLibrary());
		expect(await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false)).toBe(
			EXIT.failed,
		);
		expect(out.join('\n')).toContain('#13');
		expect(err.join('\n')).toContain('#12');
	});

	test('a rate limit exits 5', async () => {
		const fake = fakeWorld({ failing: [] });
		const original = fake.runner.run.bind(fake.runner);
		const limited = {
			...fake.runner,
			run: async (argv: readonly string[], options?: never) =>
				argv[0] === 'gh'
					? { code: 1, stdout: '', stderr: 'HTTP 429: API rate limit exceeded' }
					: original(argv, options),
		};
		const { ctx } = cliContext({ ...fake, runner: limited }, makeLibrary());
		expect(await releasedCommand(ctx, '@nxgt/widget@1.4.0', false, false)).toBe(
			EXIT.rateLimited,
		);
	});
});
