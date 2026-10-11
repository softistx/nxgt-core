import { describe, expect, test } from 'bun:test';
import { report } from './cli.fixtures';
import { parseReport } from './report';

describe('parseReport', () => {
	test('a full report parses', () => {
		const parsed = parseReport(report({ note: 'n' }));
		expect('problems' in parsed).toBe(false);
		expect(!('problems' in parsed) && parsed.kind).toBe('bug');
	});

	test('keywords are optional, workaround too', () => {
		const parsed = parseReport(
			report({ keywords: undefined, workaround: undefined }),
		);
		expect(
			!('problems' in parsed) && parsed.kind === 'bug' && parsed.keywords,
		).toEqual([]);
	});

	test.each([
		['not json', 'stdin is not valid JSON'],
		['[]', 'stdin must hold one JSON object'],
		['{"kind":"question"}', '"kind" must be one of'],
		[report({ versions: {} }), '"versions"'],
		[report({ versions: { a: 1 } }), '"versions"'],
		[report({ expected: '  ' }), '"expected"'],
		[
			'{"kind":"dependencies","package":"x","dependencies":[{"name":"a"}]}',
			'"dependencies"',
		],
		[
			'{"kind":"dependencies","package":"x","dependencies":[]}',
			'"dependencies"',
		],
	])('%p is refused', (raw, problem) => {
		const parsed = parseReport(raw);
		expect('problems' in parsed && parsed.problems.join(' ')).toContain(
			problem,
		);
	});

	test('a dependencies report parses', () => {
		const parsed = parseReport(
			'{"kind":"dependencies","package":"x","dependencies":[{"name":"a","current":"^1.0.0","latest":"2.0.0"}]}',
		);
		expect(parsed).toEqual({
			package: 'x',
			kind: 'dependencies',
			dependencies: [{ name: 'a', current: '^1.0.0', latest: '2.0.0' }],
		});
	});
});
