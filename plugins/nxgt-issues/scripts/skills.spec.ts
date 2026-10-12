import { describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every place that runs `issues.ts` runs it with the plugin's own empty
 * `bunfig.toml` and without `.env`: otherwise bun, started inside a
 * repository, executes that repository's `bunfig.toml` `preload` and loads its
 * `.env`.
 */

const PLUGINS = join(import.meta.dir, '..', '..');
const PREFIX =
	'bun --no-env-file --config=$' +
	'{CLAUDE_PLUGIN_ROOT}/bunfig.toml $' +
	'{CLAUDE_PLUGIN_ROOT}/scripts/issues.ts';
/** Where the plugin is found by path (an agent of another plugin): `$issues` is its `issues.ts`. */
const LOOKUP_PREFIX =
	'bun --no-env-file --config="$' +
	'{issues%/scripts/issues.ts}/bunfig.toml" "$issues"';

const read = (path: string) => readFileSync(path, 'utf8');

const issuesSkills = readdirSync(join(PLUGINS, 'nxgt-issues', 'skills')).map(
	(name) => join(PLUGINS, 'nxgt-issues', 'skills', name, 'SKILL.md'),
);

const lines = (path: string) => read(path).split('\n');

describe('nxgt-issues skills run the CLI without the repository bunfig or .env', () => {
	test('there are skills to check', () => {
		expect(issuesSkills.length).toBe(4);
	});

	for (const path of issuesSkills) {
		const name = path.split('/').slice(-2, -1)[0];

		test(`${name}: every Bash allowed-tool naming issues.ts has the flagged prefix`, () => {
			const allowed = lines(path).filter(
				(l) => /^\s*-\s*Bash\(/.test(l) && l.includes('issues.ts'),
			);
			expect(allowed.length).toBeGreaterThan(0);
			for (const line of allowed) {
				expect(line.trim()).toMatch(
					new RegExp(`^- Bash\\(${escapeRegExp(PREFIX)} [a-z-]+( \\*)?\\)$`),
				);
			}
		});

		test(`${name}: each command keeps its exact and "<cmd> *" pair`, () => {
			const commands = lines(path)
				.filter((l) => /^\s*-\s*Bash\(/.test(l) && l.includes('issues.ts'))
				.map((l) => l.match(/issues\.ts ([a-z-]+)( \*)?\)/));
			for (const m of commands) expect(m).not.toBeNull();
			const exact = new Set(commands.filter((m) => !m?.[2]).map((m) => m?.[1]));
			const star = new Set(commands.filter((m) => m?.[2]).map((m) => m?.[1]));
			expect([...exact].sort()).toEqual([...star].sort());
		});

		test(`${name}: every issues.ts command in the body has the flagged prefix`, () => {
			const body = lines(path).filter(
				(l) => !/^\s*-\s*Bash\(/.test(l) && /scripts\/issues\.ts/.test(l),
			);
			for (const line of body) {
				const calls = line.match(/bun [^`\n]*?scripts\/issues\.ts/g) ?? [];
				expect(calls.length).toBeGreaterThan(0);
				for (const call of calls) expect(call).toBe(PREFIX);
			}
		});
	}
});

describe('other plugins run issues.ts the same way', () => {
	const others = [
		join(PLUGINS, 'nxgt-autonomy', 'agents', 'queue-refiller.md'),
		join(PLUGINS, 'nxgt-autonomy', 'agents', 'work-queue-auditor.md'),
		join(
			PLUGINS,
			'nxgt-package',
			'skills',
			'release-a-package-change',
			'SKILL.md',
		),
		join(PLUGINS, 'nxgt-issues', 'README.md'),
	];

	for (const path of others) {
		test(`${path.slice(PLUGINS.length + 1)}: every bun "$issues" call is flagged`, () => {
			const calls = lines(path).filter((l) =>
				/\bbun\b[^\n]*"\$issues"/.test(l),
			);
			if (!path.endsWith('README.md')) expect(calls.length).toBeGreaterThan(0);
			for (const line of calls) {
				expect(line).toContain(LOOKUP_PREFIX);
			}
		});
	}

	test('no plugin file teaches the plain `bun <plugin root>/scripts/issues.ts` form', () => {
		const offenders: string[] = [];
		const walk = (dir: string) => {
			for (const entry of readdirSync(dir, { withFileTypes: true })) {
				if (entry.name === 'node_modules') continue;
				const full = join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (/\.(md|json)$/.test(entry.name)) {
					lines(full).forEach((l, i) => {
						if (/bun \$\{CLAUDE_PLUGIN_ROOT\}\/scripts\/issues\.ts/.test(l))
							offenders.push(`${full}:${i + 1}`);
					});
				}
			}
		};
		walk(PLUGINS);
		expect(offenders).toEqual([]);
	});
});

function escapeRegExp(text: string): string {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
