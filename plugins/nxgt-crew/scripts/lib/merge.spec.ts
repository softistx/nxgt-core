import { describe, expect, test } from 'bun:test';
import { minutesAgo, NOW, record } from './fixtures';
import { claim, recordEdit } from './holds';
import { merge } from './merge';

describe('merge', () => {
	test('keeps what a parallel hook added, and the later timestamps', () => {
		const onDisk = recordEdit(
			record('s', { lastSeen: NOW.toISOString() }),
			'/w/a.ts',
			'/w',
			NOW,
		);
		const next = claim(
			recordEdit(
				record('s', { lastSeen: minutesAgo(1) }),
				'/w/b.ts',
				'/w',
				NOW,
			),
			'/tmp/x',
			undefined,
			NOW,
		);
		const merged = merge(onDisk, next);
		expect(merged.edits.map((e) => e.path).sort()).toEqual([
			'/w/a.ts',
			'/w/b.ts',
		]);
		expect(merged.claims.map((c) => c.path)).toEqual(['/tmp/x']);
		expect(merged.lastSeen).toBe(NOW.toISOString());
	});

	test('one entry per file, the most recent', () => {
		const old = recordEdit(
			record('s'),
			'/w/a.ts',
			'/w',
			new Date(NOW.getTime() - 60_000),
		);
		const fresh = recordEdit(record('s'), '/w/a.ts', '/w', NOW);
		expect(merge(old, fresh).edits).toEqual(fresh.edits);
	});
});
