import { describe, expect, test } from 'bun:test';
import { extractFingerprint } from './fingerprint';
import {
	adoptedComment,
	DEPS_MARKER,
	dependenciesIssueBody,
	duplicateComment,
	fixedComment,
	fixedMarker,
	packageIssueBody,
	trackingIssueBody,
} from './issue-body';
import { upstreamRef } from './refs';

const hash = 'a'.repeat(40);

describe('packageIssueBody', () => {
	const input = {
		fingerprint: hash,
		summary: 'createThing throws on empty input.',
		versions: { '@nxgt/thing': '1.2.3', bun: '1.3.0' },
		expected: 'It returns an empty thing.',
		actual: 'TypeError: x is undefined',
		repro: '```ts\ncreateThing([])\n```',
	};

	test('holds every section, the fingerprint marker and the footer', () => {
		const body = packageIssueBody(input);
		for (const heading of [
			'## Versions',
			'## Expected',
			'## Actual',
			'## Reproduction',
		]) {
			expect(body).toContain(heading);
		}
		expect(body).toContain('- `@nxgt/thing` 1.2.3');
		expect(body).toContain('- `bun` 1.3.0');
		expect(body).not.toContain('## Workaround');
		expect(extractFingerprint(body)).toBe(hash);
		expect(body).toContain('Filed by `nxgt-issues`');
		expect(body.endsWith('\n')).toBe(true);
	});

	test('a workaround adds its section; blank does not', () => {
		expect(
			packageIssueBody({ ...input, workaround: 'Pass undefined.' }),
		).toContain('## Workaround\n\nPass undefined.');
		expect(packageIssueBody({ ...input, workaround: '  ' })).not.toContain(
			'Workaround',
		);
	});
});

describe('trackingIssueBody', () => {
	const upstream = {
		repo: { owner: 'softistx', repo: 'nxgt-core' },
		number: 42,
	};

	test('links upstream both visibly and in the marker, and lists markers', () => {
		const body = trackingIssueBody({
			upstream,
			packageName: '@nxgt/thing',
			summary: 'Blocks the export.',
			markers: [
				{ file: 'src/a.ts', line: 3 },
				{ file: 'src/b.ts', line: 9 },
			],
		});
		expect(body).toContain('Tracks softistx/nxgt-core#42 (`@nxgt/thing`).');
		expect(body).toContain('// Temporary, until @nxgt/thing#42');
		expect(body).toContain('- `src/a.ts:3`');
		expect(body).toContain('- `src/b.ts:9`');
		expect(upstreamRef(body)).toEqual(upstream);
	});

	test('no markers says so', () => {
		const body = trackingIssueBody({
			upstream,
			packageName: 'p',
			summary: 's',
			markers: [],
		});
		expect(body).toContain('- none yet');
	});
});

describe('dependenciesIssueBody', () => {
	test('a table and the rolling marker', () => {
		const body = dependenciesIssueBody([
			{ name: 'zod', current: '3.0.0', latest: '4.1.0' },
			{ name: 'hono', current: '4.1.0', latest: '4.9.0' },
		]);
		expect(body).toContain('| `zod` | 3.0.0 | 4.1.0 |');
		expect(body).toContain('| `hono` | 4.1.0 | 4.9.0 |');
		expect(body).toContain(DEPS_MARKER);
	});

	test('an empty table is still a valid body', () => {
		expect(dependenciesIssueBody([])).toContain(
			'| dependency | used | latest |',
		);
	});
});

describe('comments', () => {
	test('duplicateComment', () => {
		const text = duplicateComment({
			versions: { p: '1.0.0' },
			note: 'Same trace.',
		});
		expect(text).toStartWith('Another consumer hit this.');
		expect(text).toContain('- `p` 1.0.0');
		expect(text).toContain('Same trace.');
		expect(duplicateComment({ versions: { p: '1' } })).not.toContain('Same');
	});

	test('fixedComment carries its once-only marker', () => {
		const text = fixedComment('@nxgt/thing', '1.3.0', 57);
		expect(text).toStartWith('Fixed in @nxgt/thing@1.3.0 (#57).');
		expect(text).toContain(fixedMarker('@nxgt/thing', '1.3.0'));
		expect(
			fixedComment('p', '1.0.0', {
				repo: { owner: 'a', repo: 'b' },
				number: 2,
			}),
		).toContain('(a/b#2)');
	});

	test('adoptedComment', () => {
		expect(adoptedComment(8)).toBe('Adopted in #8.\n');
	});
});
