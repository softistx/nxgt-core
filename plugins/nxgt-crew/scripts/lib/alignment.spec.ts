import { describe, expect, test } from 'bun:test';
import {
	align,
	entryKey,
	parseRoadmap,
	proposeOwner,
	renderAlignment,
	repoName,
	type SessionView,
	scopeKey,
	splitNeed,
} from './alignment';
import { minutesAgo, NOW, record } from './fixtures';
import { announce, type PlanFields, type SessionRecord } from './registry';

const ROADMAP = `# Roadmap

Intro text with - a dash that is not an item.

## Now

- **janus-mail transport** — send through @nxgt/mail
- [ ] OAuth2 device flow: for CLIs

## Next

* \`retry\` policy - backoff for the store

\`\`\`md
- not an entry
\`\`\`

## Shipped

- **Store failures** — one StoreFailure
`;

const plan = (
	r: SessionRecord,
	entry: string,
	fields: PlanFields = {},
	at = NOW,
) => announce(r, `planning ${entry}`, 'plan', at, { entry, ...fields });

const janus = record('janus-1111', {
	title: 'janus',
	worktree: '/w/nxgt-janus',
	remote: 'git@github.com:softistx/nxgt-janus.git',
});
const mail = record('mail-2222', {
	title: 'mail',
	worktree: '/w/nxgt-mail',
	remote: 'https://github.com/softistx/nxgt-mail',
});
const janusRoadmap = {
	path: '/w/nxgt-janus/packages/janus-mail/docs/roadmap.md',
	scope: '@nxgt/janus-mail',
	entries: parseRoadmap(ROADMAP),
};

describe('parseRoadmap', () => {
	test('top-level items under their section, bold title or text before the dash', () => {
		expect(parseRoadmap(ROADMAP)).toEqual([
			{ section: 'Now', title: 'janus-mail transport' },
			{ section: 'Now', title: 'OAuth2 device flow' },
			{ section: 'Next', title: 'retry policy' },
			{ section: 'Shipped', title: 'Store failures' },
		]);
	});
});

describe('keys', () => {
	test('entryKey ignores case, markdown and punctuation', () => {
		expect(entryKey('**Janus-Mail  Transport**')).toBe(
			entryKey('janus mail transport'),
		);
	});

	test('scopeKey makes packages, repos and slugs comparable', () => {
		expect(scopeKey('@nxgt/mail')).toBe('nxgt-mail');
		expect(scopeKey('softistx/nxgt-mail')).toBe('nxgt-mail');
		expect(scopeKey('nxgt-mail.git')).toBe('nxgt-mail');
	});

	test('splitNeed separates a version, keeping a scoped name whole', () => {
		expect(splitNeed('@nxgt/mail@0.5.0')).toEqual({
			name: '@nxgt/mail',
			version: '0.5.0',
		});
		expect(splitNeed('@nxgt/mail')).toEqual({ name: '@nxgt/mail' });
		expect(splitNeed('nxgt-mail')).toEqual({ name: 'nxgt-mail' });
	});

	test('repoName from the remote, else the worktree', () => {
		expect(repoName(janus)).toBe('nxgt-janus');
		expect(repoName(record('x', { worktree: '/w/nxgt-ory' }))).toBe('nxgt-ory');
		expect(repoName(record('y'))).toBeUndefined();
	});
});

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
		expect(align(views).shipped).toEqual([
			{
				sessionId: 'janus-1111',
				entry: 'store failures',
				roadmap: janusRoadmap.path,
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

describe('renderAlignment', () => {
	test('reads as facts and proposals, naming this session', () => {
		const views: SessionView[] = [
			{
				record: plan(janus, 'janus-mail transport', {
					needs: ['@nxgt/mail@0.5.0'],
				}),
				roadmaps: [janusRoadmap],
			},
			{ record: plan(mail, 'janus-mail transport'), roadmaps: [] },
		];
		const text = renderAlignment(align(views), views, 'janus-1111');
		expect(text).toContain('Roadmaps read (1):');
		expect(text).toContain('janus [janus-11] (this session)');
		expect(text).toContain(
			'Same entry in two sessions:\n- "janus-mail transport"',
		);
		expect(text).toContain('Proposed owner: janus [janus-11] (this session)');
		expect(text).toContain(
			'needs @nxgt/mail@0.5.0: not yet released; produced by mail [mail-222]',
		);
	});

	test('says none when there is nothing', () => {
		const text = renderAlignment(align([]), [], 'x');
		expect(text).toContain('Roadmaps read: none');
		expect(text).toContain('Same entry in two sessions: none.');
		expect(text).toContain('Dependencies: none announced.');
	});
});
