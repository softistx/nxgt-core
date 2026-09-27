import { describe, expect, test } from 'bun:test';
import { align, proposeOwner } from './alignment';
import { janus, janusRoadmap, mail, plan } from './alignment.fixtures';
import { announce } from './announcements';
import { minutesAgo, NOW, record } from './fixtures';
import { plansOf } from './plans';
import type { Announcement } from './record';
import { entryKey, parseRoadmap, type SessionView } from './roadmap';

describe('align', () => {
	test('the same entry planned in two sessions is a duplicate, owned by the repo that lists it', () => {
		const views: SessionView[] = [
			{
				record: plan(
					mail,
					'janus-mail transport',
					{},
					new Date(minutesAgo(10)),
				),
				roadmaps: [],
			},
			{ record: plan(janus, 'Janus-mail transport'), roadmaps: [janusRoadmap] },
		];
		const { duplicates } = align(views);
		expect(duplicates).toHaveLength(1);
		expect(duplicates[0]?.claimants.map((c) => c.sessionId).sort()).toEqual([
			'janus-1111',
			'mail-2222',
		]);
		expect(duplicates[0]?.proposal.owner).toBe('janus-1111');
		expect(duplicates[0]?.proposal.why).toContain('roadmap lists the entry');
	});

	test('without a home roadmap, the first to announce owns it', () => {
		const views: SessionView[] = [
			{ record: plan(janus, 'shared thing'), roadmaps: [] },
			{
				record: plan(mail, 'shared thing', {}, new Date(minutesAgo(5))),
				roadmaps: [],
			},
		];
		expect(align(views).duplicates[0]?.proposal.owner).toBe('mail-2222');
	});

	test('the same title in two different scopes is not a duplicate', () => {
		const views: SessionView[] = [
			{
				record: plan(janus, 'docs', { scope: '@nxgt/janus-mail' }),
				roadmaps: [],
			},
			{ record: plan(mail, 'docs', { scope: '@nxgt/mail' }), roadmaps: [] },
		];
		expect(align(views).duplicates).toEqual([]);
	});

	test('markdown and case variants of one entry are a duplicate', () => {
		const views: SessionView[] = [
			{ record: plan(janus, '**Mail** transport'), roadmaps: [] },
			{ record: plan(mail, '`mail` Transport'), roadmaps: [] },
		];
		expect(align(views).duplicates).toHaveLength(1);
	});

	test('a withdrawn plan is no longer a duplicate', () => {
		const dropped = announce(
			plan(mail, 'shared'),
			'dropped shared',
			'plan',
			NOW,
			{
				entry: 'Shared',
				dropped: true,
			},
		);
		const views: SessionView[] = [
			{ record: plan(janus, 'shared'), roadmaps: [] },
			{ record: dropped, roadmaps: [] },
		];
		expect(align(views).duplicates).toEqual([]);
	});

	test('one session planning its entry twice is not a duplicate', () => {
		const twice = plan(plan(janus, 'a'), 'a');
		expect(align([{ record: twice, roadmaps: [] }]).duplicates).toEqual([]);
	});

	test('a need is matched to the session that produces it, released or not', () => {
		const waiting = plan(janus, 'janus-mail transport', {
			needs: ['@nxgt/mail@0.5.0'],
		});
		const pending = align([
			{ record: waiting, roadmaps: [] },
			{ record: mail, roadmaps: [] },
		]).dependencies;
		expect(pending).toEqual([
			{
				waiting: 'janus-1111',
				entry: 'janus-mail transport',
				need: '@nxgt/mail@0.5.0',
				satisfied: false,
				producer: 'mail-2222',
			},
		]);
		const released = announce(
			mail,
			'published @nxgt/mail 0.5.0',
			'release',
			NOW,
		);
		const done = align([
			{ record: waiting, roadmaps: [] },
			{ record: released, roadmaps: [] },
		]).dependencies[0];
		expect(done).toMatchObject({
			satisfied: true,
			producer: 'mail-2222',
			evidence: 'published @nxgt/mail 0.5.0',
		});
	});

	test('a release of another version does not satisfy the need', () => {
		const waiting = plan(janus, 'x', { needs: ['@nxgt/mail@0.5.0'] });
		const old = announce(mail, 'published @nxgt/mail 0.4.2', 'release', NOW);
		expect(
			align([
				{ record: waiting, roadmaps: [] },
				{ record: old, roadmaps: [] },
			]).dependencies[0]?.satisfied,
		).toBe(false);
	});

	test('a need nobody live produces has no producer', () => {
		const waiting = plan(janus, 'x', { needs: ['@nxgt/ory'] });
		expect(align([{ record: waiting, roadmaps: [] }]).dependencies[0]).toEqual({
			waiting: 'janus-1111',
			entry: 'x',
			need: '@nxgt/ory',
			satisfied: false,
		});
	});

	test('a plan for an entry already Shipped is flagged', () => {
		const views: SessionView[] = [
			{ record: plan(janus, 'store failures'), roadmaps: [janusRoadmap] },
		];
		expect(align(views).closed).toEqual([
			{
				sessionId: 'janus-1111',
				entry: 'store failures',
				roadmap: janusRoadmap.path,
				section: 'Shipped',
			},
		]);
	});
});

describe('proposeOwner', () => {
	test('two sessions in the home repository fall back to the first announcer', () => {
		const views: SessionView[] = [
			{ record: janus, roadmaps: [janusRoadmap] },
			{
				record: { ...janus, sessionId: 'janus-3333' },
				roadmaps: [janusRoadmap],
			},
		];
		const claimants = [
			{ sessionId: 'janus-3333', label: 'b', at: minutesAgo(1) },
			{ sessionId: 'janus-1111', label: 'a', at: minutesAgo(9) },
		];
		expect(
			proposeOwner(claimants, views, entryKey('janus-mail transport')).owner,
		).toBe('janus-1111');
	});
});

describe('plansOf', () => {
	test('drops a plan whose entry is not a string, and cleans scope and needs', () => {
		const bad = {
			text: 't',
			kind: 'plan',
			at: NOW.toISOString(),
			entry: 42,
		} as unknown as Announcement;
		const odd = {
			text: 't',
			kind: 'plan',
			at: NOW.toISOString(),
			entry: 'E',
			scope: 7,
			needs: ['@nxgt/a', 3, null],
		} as unknown as Announcement;
		const r = record('s', { announcements: [bad, odd] });
		expect(plansOf(r)).toEqual([
			{ entry: 'E', at: NOW.toISOString(), text: 't', needs: ['@nxgt/a'] },
		]);
		expect(
			align([{ record: r, roadmaps: [] }]).dependencies.map((d) => d.need),
		).toEqual(['@nxgt/a']);
	});
});

describe('Not planned', () => {
	const roadmap = {
		path: '/w/nxgt-janus/docs/roadmap.md',
		scope: 'nxgt-janus',
		entries: parseRoadmap('## Not planned\n\n- **Sync API**\n'),
	};

	test('a plan for a Not planned entry is flagged', () => {
		const views: SessionView[] = [
			{ record: plan(janus, 'Sync API'), roadmaps: [roadmap] },
		];
		expect(align(views).closed).toEqual([
			{
				sessionId: 'janus-1111',
				entry: 'Sync API',
				roadmap: roadmap.path,
				section: 'Not planned',
			},
		]);
	});

	test('listing an entry as Not planned does not make its repository the owner', () => {
		const views: SessionView[] = [
			{
				record: plan(mail, 'Sync API', {}, new Date(minutesAgo(10))),
				roadmaps: [],
			},
			{ record: plan(janus, 'Sync API'), roadmaps: [roadmap] },
		];
		expect(align(views).duplicates[0]?.proposal.owner).toBe('mail-2222');
		expect(
			proposeOwner(
				[{ sessionId: 'janus-1111', label: 'j', at: NOW.toISOString() }],
				views,
				entryKey('Sync API'),
			).why,
		).toContain('recorded its accepted plan first');
	});
});
