import { describe, expect, test } from 'bun:test';
import { changesetNames } from './release-git';

describe('changesetNames', () => {
	test.each([
		[
			'quoted',
			'---\n"@nxgt/a": minor\n"@nxgt/b": patch\n---\n\nText.\n',
			['@nxgt/a', '@nxgt/b'],
		],
		['unquoted', '---\nnxgt-a: minor\n---\n', ['nxgt-a']],
		['spaced colon', '---\n"@nxgt/a" : minor\n---\n', ['@nxgt/a']],
		['CRLF', '---\r\n"@nxgt/a": minor\r\n---\r\n\r\nText\r\n', ['@nxgt/a']],
		['BOM', '\uFEFF---\n"@nxgt/a": minor\n---\n', ['@nxgt/a']],
		['empty frontmatter', '---\n---\n', []],
		[
			'empty frontmatter, then a body with a rule and a colon',
			'---\n---\n\nBody.\n\n---\nNote: x\n',
			[],
		],
		['a rule later in the text', 'Intro\n---\n"@nxgt/a": minor\n---\n', []],
		['no frontmatter', 'Just text: here\n', []],
	])('%s', (_name, text, expected) => {
		expect(changesetNames(text)).toEqual(expected);
	});
});
