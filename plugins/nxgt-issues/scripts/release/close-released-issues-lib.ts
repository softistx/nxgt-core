/**
 * The discovery half of `close-released-issues.ts`, copied with it (and its
 * spec) into each library repository's `scripts/`: which issues a published
 * `<package>@<version>` fixes. It imports nothing from the plugin; it
 * duplicates `lib/release-prs.ts` and `lib/release-git.ts` on purpose
 * (AGENTS.md lists the pair).
 *
 * The PRs are the CHANGELOG section's `[#N]` links that touched the package
 * (`git diff` of the merge commit), plus the PRs the first-parent log of
 * `packages/<dir>` names since the previous tag. Each PR gives its closing
 * issues (`closingIssuesReferences`, then body keywords outside code and
 * quotes); a PR merged into `feat/*` leads to the PR merged from that branch
 * (`gh pr list --head`), which the comment names.
 */

export type Exec = (
	argv: string[],
	stdin?: string,
) => Promise<{ code: number; stdout: string; stderr: string }>;
export interface Pkg {
	name: string;
	version: string;
	tag: string;
	dir: string;
}
export interface Ctx {
	exec: Exec;
	repo: string;
	dry: boolean;
	log: (line: string) => void;
	cwd: string;
}
type Obj = Record<string, unknown>;

export const obj = (v: unknown): Obj =>
	v && typeof v === 'object' ? (v as Obj) : {};
export const rows = (v: unknown): Obj[] => (Array.isArray(v) ? v.map(obj) : []);
export const lower = (v: unknown) => String(v).toLowerCase();
export const message = (e: unknown) =>
	e instanceof Error ? e.message : String(e);
export const warn = (c: Ctx, what: string, e: unknown) =>
	c.log(`warning: ${what}: ${message(e)}`);

const CLOSING =
	/(?<![\w-])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?):?\s+(?:([\w.-]+\/[\w.-]+)?#(\d+)|https:\/\/(?:www\.)?github\.com\/([\w.-]+\/[\w.-]+)\/issues\/(\d+))(?!\w)/gi;

/** Text outside fenced blocks, code spans and `>` quote lines: where a keyword means it. */
const unquoted = (text: string) =>
	text
		.replace(/(```|~~~)[\s\S]*?(?:\1|$)/g, '')
		.replace(/`[^`\n]*`/g, '')
		.split('\n')
		.filter((line) => !/^\s*>/.test(line))
		.join('\n');

/** Issues of `repo` a text closes by keyword (`Fixes #1`, `closes owner/repo#2`, a github.com URL). */
export function closedBy(text: string, repo: string): number[] {
	return [...unquoted(text).matchAll(CLOSING)]
		.filter((m) => lower(m[1] ?? m[3] ?? repo) === lower(repo))
		.map((m) => Number(m[2] ?? m[4]));
}

/** The `[#N]` links of the `## <version>` section of a changelog. */
export function changelogPrs(changelog: string, version: string): number[] {
	const section = changelog
		.split(/^## /m)
		.find((s) => s.split('\n')[0]?.trim() === version);
	return [...(section ?? '').matchAll(/\[#(\d+)\]/g)].map((m) => Number(m[1]));
}

export async function run(
	c: Ctx,
	cmd: string,
	args: string[] = [],
	stdin?: string,
) {
	const r = await c.exec(cmd.split(' ').concat(args), stdin);
	if (r.code !== 0) throw new Error(`${cmd}: ${r.stderr.trim().slice(0, 200)}`);
	return r.stdout;
}
export const gh = async (c: Ctx, cmd: string, ...args: string[]) =>
	JSON.parse(await run(c, `gh ${cmd}`, [...args, '-R', c.repo]));

const FIELDS =
	'number,baseRefName,headRefName,body,closingIssuesReferences,mergeCommit,files';

function toPr(raw: Obj, repo: string) {
	const issues = new Set(closedBy(String(raw['body'] ?? ''), repo));
	for (const ref of rows(raw['closingIssuesReferences'])) {
		const where = obj(ref['repository']);
		const name = `${obj(where['owner'])['login']}/${where['name']}`;
		if (!where['name'] || lower(name) === lower(repo)) {
			issues.add(Number(ref['number']));
		}
	}
	return {
		number: Number(raw['number']),
		feat: String(raw['baseRefName']).startsWith('feat/'),
		head: String(raw['headRefName']),
		sha: String(obj(raw['mergeCommit'])['oid'] ?? ''),
		issues: [...issues],
		files: rows(raw['files']).map((f) => String(f['path'])),
	};
}
type Pr = ReturnType<typeof toPr>;

/** PR numbers named by the first-parent commits touching the package since its previous tag. */
async function loggedPrs(c: Ctx, p: Pkg) {
	const list = `git tag --list ${p.name}@* --sort=-version:refname`;
	const tags = (await run(c, list)).split('\n').filter(Boolean);
	const previous = tags[tags.indexOf(p.tag) + 1];
	if (!previous || !tags.includes(p.tag)) return [];
	const range = `${previous}..HEAD`;
	const log = await run(
		c,
		`git log --first-parent --format=%s ${range} -- ${p.dir}`,
	);
	return log.split('\n').flatMap((subject) => {
		const m = /^Merge pull request #(\d+)\b|\(#(\d+)\)\s*$/.exec(subject);
		return m ? [Number(m[1] ?? m[2])] : [];
	});
}

/** Whether the PR's merge (or squash) commit changed the package; its files when git cannot say. */
async function touches(c: Ctx, p: Pkg, pr: Pr) {
	const diff =
		pr.sha &&
		(await c.exec([
			'git',
			'diff',
			'--name-only',
			`${pr.sha}^1`,
			pr.sha,
			'--',
			p.dir,
		]));
	if (diff && diff.code === 0) return diff.stdout.trim() !== '';
	return pr.files.some((f) => f.startsWith(`${p.dir}/`));
}

/** The issues the release fixes, each with the PR its comment names, best-named first. */
export async function fixes(c: Ctx, p: Pkg) {
	const show = await c.exec(['git', 'show', `HEAD:${p.dir}/CHANGELOG.md`]);
	const listed = changelogPrs(show.stdout, p.version);
	const logged = await loggedPrs(c, p).catch((e): number[] => {
		warn(c, 'git log', e);
		return [];
	});
	// rank 0: a direct or integration PR's issues; 1: a slice's, named after its integration PR; 2: a slice with none yet
	const found = new Map<number, { pr: number; rank: number }>();
	const keep = (issue: number, pr: number, rank: number) => {
		if (rank < (found.get(issue)?.rank ?? 3)) found.set(issue, { pr, rank });
	};
	const merged = new Map<string, Pr[]>();
	for (const number of new Set([...listed, ...logged])) {
		try {
			const raw = obj(await gh(c, 'pr view', String(number), '--json', FIELDS));
			const pr = toPr(raw, c.repo);
			if (pr.head.startsWith('changeset-release/')) continue;
			// The path-limited log proves a logged PR touched the package; a listed one may belong to another.
			if (!logged.includes(number) && !(await touches(c, p, pr))) continue;
			if (!pr.feat) {
				for (const issue of pr.issues) keep(issue, number, 0);
				continue;
			}
			const base = String(raw['baseRefName']);
			if (!merged.has(base)) {
				const list = await gh(
					c,
					'pr list',
					'--state',
					'merged',
					'--head',
					base,
					'--json',
					FIELDS,
				);
				merged.set(
					base,
					rows(list)
						.map((r) => toPr(r, c.repo))
						.filter((r) => !r.feat),
				);
			}
			const parents = merged.get(base) ?? [];
			for (const issue of pr.issues)
				keep(issue, parents[0]?.number ?? number, parents[0] ? 1 : 2);
			for (const parent of parents) {
				for (const issue of parent.issues) keep(issue, parent.number, 0);
			}
		} catch (error) {
			warn(c, `PR #${number}`, error);
		}
	}
	return [...found].sort((a, b) => a[1].rank - b[1].rank);
}
