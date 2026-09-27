import { describe, expect, test } from 'bun:test';
import { ROADMAP } from './alignment.fixtures';
import { entryKey, isClosed, parseRoadmap } from './roadmap';

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

describe('entries', () => {
	test('entryKey ignores case, markdown and punctuation', () => {
		expect(entryKey('**Janus-Mail  Transport**')).toBe(
			entryKey('janus mail transport'),
		);
	});

	test('Shipped and Not planned are closed, whatever the case', () => {
		expect(isClosed('Shipped')).toBe(true);
		expect(isClosed('not planned')).toBe(true);
		expect(isClosed('Next')).toBe(false);
	});

	test('a Not planned section is parsed like any other', () => {
		expect(parseRoadmap('## Not planned\n\n- **Sync API** — never')).toEqual([
			{ section: 'Not planned', title: 'Sync API' },
		]);
	});
});
