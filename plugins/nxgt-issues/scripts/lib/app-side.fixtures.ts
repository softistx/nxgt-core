/** An application whose cache holds a snapshot of tracking issues, for the app-side specs. */

import { cachePath, writeEntry } from './cache';
import { harness, makeApp } from './cli.fixtures';
import type { Snapshot, TrackingIssue } from './snapshot';

export const NOW = Date.parse('2026-10-10T12:00:00Z');
export const APP = { owner: 'softistx', repo: 'acme-store' };

export const tracking = (
	number: number,
	upstream: string,
	over: Partial<TrackingIssue> = {},
): TrackingIssue => ({
	number,
	title: `workaround ${number}`,
	upstream,
	upstreamState: 'CLOSED',
	upstreamLabels: ['released', 'bug'],
	...over,
});

export const TRACKING: TrackingIssue[] = [
	tracking(21, 'softistx/nxgt-widget#12', {
		lastComment:
			'Fixed in @nxgt/widget@1.4.0 (#40).\n\n<!-- nxgt-issues:fixed=x -->',
		lastCommentBy: 'OWNER',
	}),
	tracking(22, 'softistx/nxgt-widget#13', {
		upstreamState: 'OPEN',
		upstreamLabels: ['bug'],
	}),
	tracking(23, 'softistx/nxgt-widget#14', { upstreamLabels: ['bug'] }),
	tracking(24, 'softistx/nxgt-widget#15', {
		lastComment: 'Fixed in @evil/pkg@9.9.9 (#1).',
		lastCommentBy: 'NONE',
	}),
];

/** An application whose cache already holds this snapshot, fresh. */
export function seeded(
	over: Partial<Parameters<typeof harness>[0]>,
	tracked = TRACKING,
) {
	const h = harness({ cwd: makeApp(), now: NOW, ...over });
	const snapshot: Snapshot = {
		repo: 'softistx/acme-store',
		issues: [],
		tracking: tracked,
	};
	writeEntry(cachePath(h.home, APP), snapshot, NOW);
	return h;
}

export const grep = (stdout: string, code = 0) => ({
	argv: ['git', 'grep'],
	result: { stdout, code },
});
