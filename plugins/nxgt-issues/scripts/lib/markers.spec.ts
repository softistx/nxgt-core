import { describe, expect, test } from 'bun:test';
import {
	describeTarget,
	groupByUpstream,
	MARKER_GREP_ARGV,
	parseMarkerLine,
	parseMarkers,
	parseTarget,
} from './markers';

describe('parseMarkerLine', () => {
	test('an unscoped package', () => {
		expect(
			parseMarkerLine('src/a.ts:12:\t// Temporary, until nxgt-thing#34 ships'),
		).toEqual({
			file: 'src/a.ts',
			line: 12,
			target: { kind: 'package', name: 'nxgt-thing' },
			number: 34,
			text: '// Temporary, until nxgt-thing#34 ships',
		});
	});

	test('a scoped package', () => {
		const marker = parseMarkerLine(
			'a.ts:1:// Temporary, until @nxgt/shared-hono#9',
		);
		expect(marker?.target).toEqual({
			kind: 'package',
			name: '@nxgt/shared-hono',
		});
		expect(marker?.number).toBe(9);
	});

	test('owner/repo form', () => {
		const marker = parseMarkerLine(
			'a.ts:1:# Temporary, until softistx/nxgt-core#2',
		);
		expect(marker?.target).toEqual({
			kind: 'repo',
			repo: { owner: 'softistx', repo: 'nxgt-core' },
		});
	});

	test('works in any comment style and mid-line', () => {
		expect(
			parseMarkerLine('x.py:3:  x = 1  # Temporary, until pkg#5')?.number,
		).toBe(5);
		expect(
			parseMarkerLine('x.html:3:<!-- Temporary, until pkg#5 -->')?.number,
		).toBe(5);
		expect(parseMarkerLine('x.ts:3:/* Temporary, until pkg#5 */')?.number).toBe(
			5,
		);
	});

	test('a path with a colon-free name and CRLF', () => {
		expect(
			parseMarkerLine('dir/with space/f.ts:7:// Temporary, until p#1\r')?.file,
		).toBe('dir/with space/f.ts');
	});

	test.each([
		'a.ts:1:// Temporary, until we ship',
		'a.ts:1:// Temporary, until #5',
		'a.ts:1:// Temporary until pkg#5',
		'a.ts:1:// temporary, until pkg#5',
		'a.ts:x:// Temporary, until pkg#5',
		'not a grep line',
		'',
	])('ignores %p', (line) => {
		expect(parseMarkerLine(line)).toBeUndefined();
	});
});

describe('parseMarkers', () => {
	const output = [
		'src/a.ts:12:// Temporary, until nxgt-thing#34',
		'src/b.ts:3:// Temporary, until nxgt-thing#34',
		'src/c.ts:9:// Temporary, until softistx/lib#2',
		'src/d.ts:1:// Temporary, until we are done',
		'',
	].join('\n');

	test('keeps the markers, drops the rest', () => {
		expect(parseMarkers(output).map((m) => `${m.file}:${m.line}`)).toEqual([
			'src/a.ts:12',
			'src/b.ts:3',
			'src/c.ts:9',
		]);
		expect(parseMarkers('')).toEqual([]);
	});

	test('groups by upstream', () => {
		const groups = groupByUpstream(parseMarkers(output));
		expect([...groups.keys()]).toEqual(['nxgt-thing#34', 'softistx/lib#2']);
		expect(groups.get('nxgt-thing#34')).toHaveLength(2);
	});
});

describe('targets', () => {
	test('parseTarget and describeTarget', () => {
		expect(describeTarget(parseTarget('@a/b'))).toBe('@a/b');
		expect(describeTarget(parseTarget('a/b'))).toBe('a/b');
		expect(describeTarget(parseTarget('plain'))).toBe('plain');
	});

	test('the grep command is the one the plan names', () => {
		expect(MARKER_GREP_ARGV.join(' ')).toBe('git grep -n -E Temporary, until ');
	});
});
