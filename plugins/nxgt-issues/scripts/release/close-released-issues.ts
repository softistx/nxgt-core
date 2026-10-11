#!/usr/bin/env bun
/**
 * Closes the issues a release fixed, after `changesets/action` publishes:
 *   bun scripts/close-released-issues.ts --published "$PUBLISHED" [--repo owner/repo] [--dry-run]
 * (`PUBLISHED` is `steps.<id>.outputs.publishedPackages`, a JSON array of
 * `{ name, version }`; `GH_TOKEN` is the workflow's token, with `issues: write`.)
 *
 * Per published package the issues come from `close-released-issues-lib.ts`;
 * they are collected across all packages first, so an issue gets one comment,
 * naming the first package that fixes it: "Fixed in <pkg>@<version> (#PR)", the
 * `released` label and the close. The hidden marker in the comment is the
 * idempotency key: an issue gets at most one such comment ever (any trusted
 * comment with a fixed marker, whatever package or version, means done), and an
 * issue reopened after the release is reported, never closed again. Needs only `gh`; imports nothing
 * from the plugin. This is the canonical copy: byte-copy it, the lib file and
 * the spec into each library's `scripts/`. It never fails the release:
 * problems print as warnings and the exit code is 0.
 */

import { dirname, join } from 'node:path';
import {
	type Ctx,
	type Exec,
	fixes,
	gh,
	lower,
	message,
	obj,
	type Pkg,
	rows,
	run,
	warn,
} from './close-released-issues-lib';

const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const FIXED_MARKER = /<!--\s*nxgt-issues:fixed=\S+@\S+\s*-->/;

async function release(c: Ctx, p: Pkg, issue: number, pr: number) {
	const n = String(issue);
	const raw = obj(
		await gh(c, 'issue view', n, '--json', 'state,labels,comments'),
	);
	const marker = (tag: string) => `<!-- nxgt-issues:fixed=${tag} -->`;
	const body = `Fixed in ${p.tag} (#${pr}).\n\n${marker(p.tag)}\n`;
	const done = rows(raw['comments']).some((m) => {
		const bot = obj(m['author'])['login'] === 'github-actions';
		const trusted = bot || TRUSTED.includes(String(m['authorAssociation']));
		return trusted && FIXED_MARKER.test(String(m['body']));
	});
	const open = lower(raw['state']) === 'open';
	const labelled = rows(raw['labels']).some(
		(l) => lower(l['name']) === 'released',
	);
	const steps = [
		[`comment (#${pr})`, !done, `issue comment ${n} --body-file -`],
		['label released', !labelled, `issue edit ${n} --add-label released`],
		['close', open && !done, `issue close ${n}`],
	] as const;
	const todo = steps.filter(([, needed]) => needed);
	const what = todo.map(([label]) => label).join(', ') || 'already released';
	const note =
		open && done ? '; reopened after the release: not closed again' : '';
	c.log(
		`  #${issue}: ${c.dry && todo.length > 0 ? 'would ' : ''}${what}${note}`,
	);
	for (const [, , cmd] of c.dry ? [] : todo) {
		const stdin = cmd.includes('comment') ? body : undefined;
		await run(c, `gh ${cmd} -R ${c.repo}`, [], stdin);
	}
}

async function packageOf(
	c: Ctx,
	name: string,
	version: string,
): Promise<Pkg | undefined> {
	for (const file of new Bun.Glob('packages/*/package.json').scanSync(c.cwd)) {
		const json = Bun.file(join(c.cwd, file)).json();
		if (obj(await json.catch(() => ({})))['name'] === name) {
			return { name, version, dir: dirname(file), tag: `${name}@${version}` };
		}
	}
	c.log(`warning: ${name} is not a package of this checkout`);
	return undefined;
}

async function releaseAll(c: Ctx, published: Obj[]) {
	const issues = new Map<number, { p: Pkg; pr: number }>();
	for (const { name, version } of published) {
		try {
			const p = await packageOf(c, String(name), String(version));
			const found = p ? await fixes(c, p) : [];
			if (p)
				c.log(`${c.dry ? 'dry run: ' : ''}${p.tag}: ${found.length} issue(s)`);
			for (const [issue, { pr }] of found) {
				if (p && !issues.has(issue)) issues.set(issue, { p, pr });
			}
		} catch (error) {
			warn(c, `${name}@${version}`, error);
		}
	}
	if (issues.size === 0) return;
	const labels = rows(
		await gh(c, 'label list', '--limit', '200', '--json', 'name'),
	);
	if (!labels.some((l) => lower(l['name']) === 'released')) {
		c.log(`  label released: ${c.dry ? 'would be created' : 'created'}`);
		const create = 'label create released --color 0e8a16 --description';
		if (!c.dry)
			await run(c, `gh ${create}`, ['The fix is published', '-R', c.repo]);
	}
	for (const [issue, { p, pr }] of issues) {
		await release(c, p, issue, pr).catch((e) => warn(c, `issue #${issue}`, e));
	}
}
type Obj = Record<string, unknown>;

/** Always resolves 0: a release is never failed by its issue housekeeping. */
export async function closeReleasedIssues(
	args: string[],
	env: Record<string, string | undefined>,
	exec: Exec,
	log: (line: string) => void,
	cwd: string = process.cwd(),
): Promise<0> {
	const flag = (name: string) =>
		args.includes(name) ? args[args.indexOf(name) + 1] : undefined;
	const repo = flag('--repo') ?? env['GITHUB_REPOSITORY'];
	try {
		const published = rows(JSON.parse(flag('--published') ?? ''));
		if (!repo)
			throw new Error('no repository: pass --repo or set GITHUB_REPOSITORY');
		await releaseAll(
			{ exec, repo, dry: args.includes('--dry-run'), log, cwd },
			published,
		);
	} catch (error) {
		log(`warning: nothing closed: ${message(error)}`);
	}
	return 0;
}

if (import.meta.main) {
	const env = {
		...process.env,
		GH_TOKEN: process.env['GH_TOKEN'] ?? process.env['GITHUB_TOKEN'] ?? '',
	};
	const exec: Exec = async (argv, stdin) => {
		const child = Bun.spawn(argv, {
			env,
			stdin: stdin === undefined ? 'ignore' : new Blob([stdin]),
			stdout: 'pipe',
			stderr: 'pipe',
		});
		const [stdout, stderr, code] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
			child.exited,
		]);
		return { code, stdout, stderr };
	};
	process.exit(
		await closeReleasedIssues(
			process.argv.slice(2),
			process.env,
			exec,
			console.log,
		),
	);
}
