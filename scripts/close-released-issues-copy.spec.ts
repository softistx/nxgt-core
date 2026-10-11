import { describe, expect, test } from 'bun:test';

// scripts/close-released-issues*.ts are a deliberate byte-for-byte copy of the
// canonical files the nxgt-issues plugin ships (AGENTS.md, duplication table):
// the copy runs in release.yml, where the plugin is not installed. Change the
// canonical file first, then copy it here; this fails when the two drift.

const FILES = [
	'close-released-issues.ts',
	'close-released-issues-lib.ts',
	'close-released-issues-git.ts',
	'close-released-issues.spec.ts',
];
const canonical = new URL(
	'../plugins/nxgt-issues/scripts/release/',
	import.meta.url,
);

describe('close-released-issues copy', () => {
	for (const name of FILES) {
		test(`${name} equals the nxgt-issues canonical file`, async () => {
			const copy = await Bun.file(new URL(name, import.meta.url)).text();
			const source = await Bun.file(new URL(name, canonical)).text();
			expect(copy).toBe(source);
		});
	}
});
