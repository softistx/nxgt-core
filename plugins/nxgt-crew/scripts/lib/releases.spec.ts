import { describe, expect, test } from 'bun:test';
import { align } from './alignment';
import { janus, mail, plan } from './alignment.fixtures';
import { announce } from './announcements';
import { NOW } from './fixtures';
import { releaseCovers, splitNeed } from './releases';

describe('splitNeed', () => {
	test('splitNeed separates a version, keeping a scoped name whole', () => {
		expect(splitNeed('@nxgt/mail@0.5.0')).toEqual({
			name: '@nxgt/mail',
			version: '0.5.0',
		});
		expect(splitNeed('@nxgt/mail')).toEqual({ name: '@nxgt/mail' });
		expect(splitNeed('nxgt-mail')).toEqual({ name: 'nxgt-mail' });
	});
});

describe('releaseCovers', () => {
	test('name and version as whole words, in the usual shapes', () => {
		expect(
			releaseCovers('published @nxgt/mail 0.5.0', '@nxgt/mail', '0.5.0'),
		).toBe(true);
		expect(
			releaseCovers('released @nxgt/mail@0.5.0.', '@nxgt/mail', '0.5.0'),
		).toBe(true);
		expect(
			releaseCovers('@nxgt/mail v0.5.0 is out', '@nxgt/mail', '0.5.0'),
		).toBe(true);
		expect(releaseCovers('published @nxgt/mail 0.6.0', '@nxgt/mail')).toBe(
			true,
		);
	});

	test('a longer package name does not cover a shorter one', () => {
		expect(
			releaseCovers('published @nxgt/mail-config 0.5.0', '@nxgt/mail', '0.5.0'),
		).toBe(false);
	});

	test('a version inside a longer version does not count', () => {
		expect(
			releaseCovers('published @nxgt/mail 10.5.0', '@nxgt/mail', '0.5.0'),
		).toBe(false);
		expect(
			releaseCovers(
				'published @nxgt/mail-config 10.5.0',
				'@nxgt/mail',
				'0.5.0',
			),
		).toBe(false);
	});

	test('in align, @nxgt/mail-config 10.5.0 leaves @nxgt/mail@0.5.0 waiting', () => {
		const waiting = plan(janus, 'x', { needs: ['@nxgt/mail@0.5.0'] });
		const other = announce(
			mail,
			'published @nxgt/mail-config 10.5.0',
			'release',
			NOW,
		);
		const dep = align([
			{ record: waiting, roadmaps: [] },
			{ record: other, roadmaps: [] },
		]).dependencies[0];
		expect(dep?.satisfied).toBe(false);
	});
});
