import { afterAll, describe, expect, test } from 'bun:test';
import { grep } from './app-side.fixtures';
import { main } from './cli';
import { harness, makeApp, removeTempDirs } from './cli.fixtures';
import { EXIT } from './cli-context';
import { fakeWorld } from './release.fixtures';
import { cliContext, makeLibrary } from './release-checkout.fixtures';
import { releasedCommand } from './release-command';

afterAll(removeTempDirs);

describe('every subcommand refuses what it does not know', () => {
	test.each([
		[['released', '@nxgt/widget@1.4.0', '--dry-run=false']],
		[['released', '@nxgt/widget@1.4.0', '--dry-run-x']],
		[['released', '@nxgt/widget@1.4.0', '-n']],
		[['released', '@nxgt/widget@1.4.0', 'extra']],
		[['release-plan', '@nxgt/widget@1.4.0', '--dry-run']],
		[['release-plan', '@nxgt/widget@1.4.0', '--bogus']],
		[['ready', '--bogus']],
		[['ready', 'extra']],
		[['dashboard', '-j']],
		[['markers', '--jsonx']],
		[['sessions', 'softistx/nxgt-widget', '--file']],
		[['resolve', '@nxgt/widget', '--file']],
		[['deps', '@nxgt/widget', '--filee']],
		[['file', '--new', '--bogus']],
		[['track', '--json']],
		[['refresh', 'now']],
	])('%p is a usage error that spawns nothing', async (argv) => {
		const h = harness({ cwd: makeApp() });
		expect(await main(h.ctx, argv)).toBe(EXIT.usage);
		expect(h.err.join('\n')).toContain('usage: issues.ts');
		expect(h.runner.calls).toEqual([]);
	});

	test('the flags a command knows still work', async () => {
		const h = harness({ cwd: makeApp(), run: [grep('', 1)] });
		expect(
			await main(h.ctx, ['markers', '--json', '--exclude', 'docs/**']),
		).not.toBe(EXIT.usage);
	});
});

describe('release-plan', () => {
	const world = () =>
		fakeWorld({ prs: { 40: { closing: [12] } }, issues: { 12: {} } });

	test('previews exactly what released --dry-run does, and writes nothing', async () => {
		const plan = world();
		const a = cliContext(plan, makeLibrary());
		expect(await main(a.ctx, ['release-plan', '@nxgt/widget@1.4.0'])).toBe(
			EXIT.ok,
		);
		expect(plan.writes()).toEqual([]);
		const dry = world();
		const b = cliContext(dry, makeLibrary());
		await main(b.ctx, ['released', '@nxgt/widget@1.4.0', '--dry-run']);
		expect(a.out).toEqual(b.out);
		expect(a.out.join('\n')).toContain('dry run');
	});

	test('--json is the dry-run report', async () => {
		const { ctx, out } = cliContext(world(), makeLibrary());
		await main(ctx, ['release-plan', '@nxgt/widget@1.4.0', '--json']);
		expect(JSON.parse(out.join('\n'))).toMatchObject({ dryRun: true });
	});

	test('needs a package@version, and says so under its own name', async () => {
		const { ctx, err } = cliContext(world(), makeLibrary());
		expect(
			await releasedCommand(ctx, 'widget', false, true, 'release-plan'),
		).toBe(EXIT.usage);
		expect(err).toEqual([
			'usage: issues.ts release-plan <pkg>@<version> [--json]',
		]);
		expect(await main(ctx, ['release-plan'])).toBe(EXIT.usage);
	});
});
