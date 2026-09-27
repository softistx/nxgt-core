/** One session planning an entry in two scopes: owners, closed entries and the text. */

import { describe, expect, test } from 'bun:test';
import { align } from './alignment';
import { janus, janusRoadmap, mail, plan } from './alignment.fixtures';
import { renderAlignment } from './alignment-text';
import { minutesAgo } from './fixtures';
import type { SessionView } from './roadmap';

describe('an entry planned in two scopes by one session', () => {
	test('the home session still wins against a peer that planned it once, earlier', () => {
		let home = plan(janus, 'janus-mail transport');
		home = plan(home, 'janus-mail transport', { scope: '@nxgt/janus-mail' });
		const views: SessionView[] = [
			{ record: home, roadmaps: [janusRoadmap] },
			{
				record: plan(
					mail,
					'janus-mail transport',
					{},
					new Date(minutesAgo(30)),
				),
				roadmaps: [],
			},
		];
		const [duplicate] = align(views).duplicates;
		expect(duplicate?.claimants).toHaveLength(3);
		expect(duplicate?.proposal.owner).toBe('janus-1111');
		expect(duplicate?.proposal.why).toContain('roadmap lists the entry');
		const text = renderAlignment(align(views), views, 'mail-2222');
		expect(text).toContain(
			'janus [janus-11] (@nxgt/janus-mail) and janus [janus-11] and mail [mail-222] (this session)',
		);
	});

	test('each scope gives its own closed entry', () => {
		let r = plan(janus, 'store failures');
		r = plan(r, 'store failures', { scope: '@nxgt/janus-mail' });
		const views: SessionView[] = [{ record: r, roadmaps: [janusRoadmap] }];
		const { closed } = align(views);
		expect(closed).toHaveLength(2);
		expect(closed.map((c) => c.scope ?? null).sort()).toEqual([
			'@nxgt/janus-mail',
			null,
		]);
		const text = renderAlignment(align(views), views, 'mail-2222');
		expect(text).toContain(
			'- janus [janus-11]: "store failures" is Shipped in',
		);
		expect(text).toContain(
			'- janus [janus-11] (@nxgt/janus-mail): "store failures" is Shipped in',
		);
	});
});
