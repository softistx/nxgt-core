#!/usr/bin/env bun
/**
 * Closes the issues a release fixed, after `changesets/action` publishes:
 *   bun scripts/close-released-issues.ts --published '<publishedPackages JSON>' [--repo owner/repo] [--dry-run]
 *
 * Per `{ name, version }`: the PRs of that version (the CHANGELOG section's
 * `[#N]` links, plus commits touching `packages/<dir>` since the previous tag
 * whose PR touches it), their closing issues (`closingIssuesReferences`, then
 * body keywords; a PR merged into `feat/*` leads to the integration PR holding
 * its commit), and once per issue "Fixed in <pkg>@<version> (#PR)", the
 * `released` label and the close. A second run changes nothing. Needs only
 * `gh` and GITHUB_TOKEN (`issues: write`); imports nothing from the plugin:
 * this is the canonical copy, byte-copied with its spec into each library's
 * `scripts/` (AGENTS.md lists it; it duplicates `lib/release.ts` on purpose).
 * It never fails the release: problems print as warnings, the exit code is 0.
 */

import { dirname, join } from 'node:path';

export type Exec = (
	argv: string[],
	stdin?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;
type Obj = Record<string, unknown>;
interface Pkg {
	name: string;
	version: string;
	tag: string;
	dir: string;
}
interface Ctx {
	exec: Exec;
	repo: string;
	dry: boolean;
	log: (line: string) => void;
	cwd: string;
}

const obj = (v: unknown): Obj => (v && typeof v === 'object' ? (v as Obj) : {});
const rows = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
const lower = (v: unknown) => String(v).toLowerCase();
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const warn = (c: Ctx, what: string, e: unknown) =>
	c.log(`warning: ${what}: ${message(e)}`);
const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
const CLOSING =
	/(?<![\w-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+([\w.-]+\/[\w.-]+)?#(\d+)(?!\w)/gi;

/** Issues of `repo` a text closes by keyword (`Fixes #1`, `closes owner/repo#2`). */
export function closedBy(text: string, repo: string): number[] {
	return [...text.matchAll(CLOSING)]
		.filter((m) => !m[1] || lower(m[1]) === lower(repo))
		.map((m) => Number(m[2]));
}

/** The `[#N]` links of the `## <version>` section of a changelog. */
export function changelogPrs(changelog: string, version: string): number[] {
	const section = changelog
		.split(/^## /m)
		.find((s) => s.split('\n')[0]?.trim() === version);
	return [...(section ?? '').matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]));
}

async function run(c: Ctx, cmd: string, args: string[] = [], stdin?: string) {
	const r = await c.exec(cmd.split(' ').concat(args), stdin);
	if (r.code !== 0) throw new Error(`${cmd}: ${r.stderr.trim().slice(0, 200)}`);
	return r.stdout;
}
const gh = async (c: Ctx, cmd: string, ...args: string[]) =>
	JSON.parse(await run(c, `gh ${cmd}`, [...args, '-R', c.repo]));

async function readPr(c: Ctx, number: number) {
	const fields = 'baseRefName,body,closingIssuesReferences,mergeCommit,files';
	const raw = obj(await gh(c, 'pr view', String(number), '--json', fields));
	const issues = new Set(closedBy(String(raw['body'] ?? ''), c.repo));
	for (const ref of rows(raw['closingIssuesReferences'])) {
		const where = obj(ref['repository']);
		const name = `${obj(where['owner'])['login']}/${where['name']}`;
		if (!where['name'] || lower(name) === lower(c.repo)) {
			issues.add(Number(ref['number']));
		}
	}
	return {
		feat: String(raw['baseRefName']).startsWith('feat/'),
		sha: String(obj(raw['mergeCommit'])['oid'] ?? ''),
		issues: [...issues],
		files: rows(raw['files']).map((f) => String(f['path'])),
	};
}

/** PR numbers named by the commits touching `dir` since the package's previous tag. */
async function loggedPrs(c: Ctx, p: Pkg) {
	const list = `git tag --list ${p.name}@* --sort=-version:refname`;
	const tags = (await run(c, list)).split('\n').filter(Boolean);
	const previous = tags[tags.indexOf(p.tag) + 1];
	if (!previous) return [];
	const log = await run(c, `git log --format=%s ${previous}..HEAD -- ${p.dir}`);
	return log.split('\n').flatMap((subject) => {
		const m = /^Merge pull request #(\d+)\b|\(#(\d+)\)\s*$/.exec(subject);
		return m ? [Number(m[1] ?? m[2])] : [];
	});
}

/** The issues the release fixes, each with the PR its comment names. */
async function fixes(c: Ctx, p: Pkg) {
	const show = await c.exec(['git', 'show', `HEAD:${p.dir}/CHANGELOG.md`]);
	const listed = changelogPrs(show.stdout, p.version);
	const logged = await loggedPrs(c, p).catch((e) => {
		warn(c, 'git log', e);
		return [];
	});
	// rank 0: a direct or integration PR's issues; 1: a slice's, named after its integration PR; 2: a slice with none yet
	const found = new Map<number, { pr: number; rank: number }>();
	const keep = (issue: number, pr: number, rank: number) => {
		if (rank < (found.get(issue)?.rank ?? 3)) found.set(issue, { pr, rank });
	};
	for (const number of new Set([...listed, ...logged])) {
		try {
			const info = await readPr(c, number);
			const touches = info.files.some((f) => f.startsWith(`${p.dir}/`));
			if (!(touches || listed.includes(number))) continue;
			const api = `gh api repos/${c.repo}/commits/${info.sha}/pulls`;
			const pulls =
				info.feat && info.sha ? rows(JSON.parse(await run(c, api))) : [];
			const parents = pulls
				.filter((p) => p['merged_at'] && p['number'] !== number)
				.filter((p) => !String(obj(p['base'])['ref']).startsWith('feat/'))
				.map((p) => Number(p['number']));
			const rank = !info.feat ? 0 : parents.length > 0 ? 1 : 2;
			for (const issue of info.issues) keep(issue, parents[0] ?? number, rank);
			for (const parent of parents) {
				for (const issue of (await readPr(c, parent)).issues)
					keep(issue, parent, 0);
			}
		} catch (error) {
			warn(c, `PR #${number}`, error);
		}
	}
	return [...found].sort((a, b) => a[1].rank - b[1].rank);
}

async function release(c: Ctx, p: Pkg, issue: number, pr: number) {
	const n = String(issue);
	const raw = obj(
		await gh(c, 'issue view', n, '--json', 'state,labels,comments'),
	);
	const body = `Fixed in ${p.tag} (#${pr}).\n\n<!-- nxgt-issues:fixed=${p.tag} -->\n`;
	const posted = rows(raw['comments']).some((m) => {
		const bot = obj(m['author'])['login'] === 'github-actions';
		const trusted = bot || TRUSTED.includes(String(m['authorAssociation']));
		return trusted && String(m['body']).trim() === body.trim();
	});
	const labelled = rows(raw['labels']).some(
		(l) => lower(l['name']) === 'released',
	);
	const steps = [
		[`comment (#${pr})`, !posted, `issue comment ${n} --body-file -`],
		['label released', !labelled, `issue edit ${n} --add-label released`],
		['close', lower(raw['state']) === 'open', `issue close ${n}`],
	] as const;
	const todo = steps.filter(([, needed]) => needed);
	const what = todo.map(([label]) => label).join(', ') || 'already released';
	c.log(`  #${issue}: ${c.dry && todo.length > 0 ? 'would ' : ''}${what}`);
	for (const [, , cmd] of c.dry ? [] : todo) {
		const stdin = cmd.includes('comment') ? body : undefined;
		await run(c, `gh ${cmd} -R ${c.repo}`, [], stdin);
	}
}

async function releasePackage(c: Ctx, name: string, version: string) {
	let dir: string | undefined;
	for (const file of new Bun.Glob('packages/*/package.json').scanSync(c.cwd)) {
		const json = Bun.file(join(c.cwd, file)).json();
		if (obj(await json.catch(() => ({})))['name'] === name) dir = dirname(file);
	}
	if (!dir) return c.log(`warning: ${name} is not a package of this checkout`);
	const p = { name, version, dir, tag: `${name}@${version}` };
	const found = await fixes(c, p);
	c.log(`${c.dry ? 'dry run: ' : ''}${p.tag}: ${found.length} issue(s)`);
	if (found.length === 0) return;
	const labels = rows(
		await gh(c, 'label list', '--limit', '200', '--json', 'name'),
	);
	if (!labels.some((l) => lower(l['name']) === 'released')) {
		c.log(`  label released: ${c.dry ? 'would be created' : 'created'}`);
		const create = 'label create released --color 0e8a16 --description';
		if (!c.dry)
			await run(c, `gh ${create}`, ['The fix is published', '-R', c.repo]);
	}
	for (const [issue, { pr }] of found) {
		await release(c, p, issue, pr).catch((e) => warn(c, `issue #${issue}`, e));
	}
}

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
		const c: Ctx = { exec, repo, dry: args.includes('--dry-run'), log, cwd };
		for (const { name, version } of published) {
			await releasePackage(c, String(name), String(version)).catch((e) =>
				warn(c, `${name}@${version}`, e),
			);
		}
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
