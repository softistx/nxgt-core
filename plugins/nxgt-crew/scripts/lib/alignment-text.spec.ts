import { describe, expect, test } from 'bun:test';
import { align, type SessionView } from './alignment';
import { janus, janusRoadmap, mail, plan } from './alignment.fixtures';
import { renderAlignment } from './alignment-text';

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

	test('names a plan for a Shipped entry, with its roadmap', () => {
		const views: SessionView[] = [
			{ record: plan(janus, 'Store failures'), roadmaps: [janusRoadmap] },
		];
		const text = renderAlignment(align(views), views, 'janus-1111');
		expect(text).toContain(
			'Plans for entries the roadmap closed (Shipped or Not planned):',
		);
		expect(text).toContain(
			`- janus [janus-11] (this session): "Store failures" is Shipped in ${janusRoadmap.path}`,
		);
	});
});
