/**
 * A stateful fake GitHub for the release specs: a library repository
 * `softistx/nxgt-widget` with the package `@nxgt/widget` under
 * `packages/widget`, its tags and git log, its PRs and issues, answering what
 * GitHub and git really print. A comment, a label or a close made through the
 * runner changes the world, so a second run sees what the first did.
 */

import type { GhContext } from './github';
import {
	CHANGELOG,
	fail,
	gh,
	git,
	type W,
	type World,
} from './release-world.fixtures';
import type { Runner } from './runner';
import { tempDir } from './temp.fixtures';

export {
	CHANGELOG,
	DIR,
	PKG,
	REPO,
	type World,
	type WorldIssue,
	type WorldPr,
} from './release-world.fixtures';

export interface Fake {
	readonly runner: Runner;
	readonly calls: string[][];
	readonly world: Required<World>;
	/** The calls that change something on GitHub. */
	writes(): string[][];
}

const WRITES = [
	['gh', 'issue', 'comment'],
	['gh', 'issue', 'edit'],
	['gh', 'issue', 'close'],
	['gh', 'label', 'create'],
];

export function fakeWorld(init: World = {}): Fake {
	const world: W = {
		tags: ['@nxgt/widget@1.4.0', '@nxgt/widget@1.3.0'],
		log: [],
		changelog: CHANGELOG,
		prs: {},
		issues: {},
		repoLabels: ['bug', 'released'],
		tracking: [],
		failing: [],
		failOnce: [],
		...init,
	};
	const calls: string[][] = [];
	const runner: Runner = {
		async run(argv, options = {}) {
			calls.push([...argv]);
			const text = argv.join(' ');
			const once = world.failOnce.findIndex((needle) => text.includes(needle));
			if (once !== -1) {
				world.failOnce.splice(once, 1);
				return fail('HTTP 500: server error');
			}
			if (world.failing.some((needle) => text.includes(needle))) {
				return fail('HTTP 500: server error');
			}
			return argv[0] === 'git'
				? git(world, argv)
				: gh(world, argv, options.stdin);
		},
		async fetchJson() {
			throw new Error('fake world: no network');
		},
	};
	return {
		runner,
		calls,
		world,
		writes: () =>
			calls.filter((call) =>
				WRITES.some((write) => write.every((w, i) => call[i] === w)),
			),
	};
}

export function ghContext(fake: Fake): GhContext {
	return {
		runner: fake.runner,
		home: tempDir('home'),
		now: () => Date.parse('2026-10-10T12:00:00Z'),
	};
}
