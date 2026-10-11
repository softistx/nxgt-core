import { describe, expect, test } from 'bun:test';
import {
	extractFingerprint,
	fingerprint,
	fingerprintMarker,
	normalizeSymptom,
} from './fingerprint';

describe('normalizeSymptom', () => {
	test('drops case, versions, numbers, hashes, paths and punctuation', () => {
		expect(
			normalizeSymptom(
				'TypeError: Cannot read "foo" of undefined at /Users/x/app/src/a.ts:12:5 (v1.2.3, abcdef1234)',
			),
		).toBe('typeerror cannot read foo of undefined at');
	});

	test('two consumers phrase the same symptom the same way', () => {
		expect(normalizeSymptom('Fails on 1.2.3 with  "boom"')).toBe(
			normalizeSymptom('fails on 4.5.6-beta.1 with boom!'),
		);
	});

	test('urls are dropped', () => {
		expect(normalizeSymptom('see https://example.com/a?b=1 now')).toBe(
			'see now',
		);
	});
});

describe('fingerprint', () => {
	test('is a stable 40-hex sha1', () => {
		const hash = fingerprint('@nxgt/x', 'bug', 'It crashes on 1.0.0');
		expect(hash).toMatch(/^[0-9a-f]{40}$/);
		expect(fingerprint('@nxgt/x', 'bug', 'it crashes on 2.3.4')).toBe(hash);
	});

	test('changes with the package, the kind and the symptom', () => {
		const base = fingerprint('@nxgt/x', 'bug', 'it crashes');
		expect(fingerprint('@nxgt/y', 'bug', 'it crashes')).not.toBe(base);
		expect(fingerprint('@nxgt/x', 'enhancement', 'it crashes')).not.toBe(base);
		expect(fingerprint('@nxgt/x', 'bug', 'it hangs')).not.toBe(base);
	});

	test('the package name ignores case', () => {
		expect(fingerprint('PKG', 'bug', 's')).toBe(fingerprint('pkg', 'bug', 's'));
	});
});

describe('marker', () => {
	test('written and extracted', () => {
		const hash = fingerprint('p', 'bug', 's');
		const marker = fingerprintMarker(hash);
		expect(marker).toBe(`<!-- nxgt-issues:fp=${hash} -->`);
		expect(extractFingerprint(`body\n\n${marker}\nmore`)).toBe(hash);
	});

	test('absent or malformed gives undefined', () => {
		expect(extractFingerprint('nothing')).toBeUndefined();
		expect(extractFingerprint('<!-- nxgt-issues:fp=zz -->')).toBeUndefined();
	});
});
