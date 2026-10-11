import { describe, expect, test } from 'bun:test';
import { fileURLToPath } from 'node:url';

// scripts/close-released-issues*.ts are a deliberate byte-for-byte copy of the
// canonical files the nxgt-issues plugin ships (AGENTS.md, duplication table):
// the copy runs in release.yml, where the plugin is not installed. Change the
// canonical file first, then copy it here; this fails when the two drift. Both
// folders are listed by glob, so a file added on one side without the other
// fails too (this spec itself is the one name that is not a copy).

const PATTERN = 'close-released-issues*.ts';
const SELF = 'close-released-issues-copy.spec.ts';
const canonical = new URL(
	'../plugins/nxgt-issues/scripts/release/',
	import.meta.url,
);
const here = new URL('./', import.meta.url);

const listed = async (folder: URL): Promise<string[]> =>
	(
		await Array.fromAsync(
			new Bun.Glob(PATTERN).scan({ cwd: fileURLToPath(folder) }),
		)
	)
		.filter((name) => name !== SELF)
		.sort();

describe('close-released-issues copy', () => {
	test('both folders hold the same file names, at least the script, its lib, its git half and its spec', async () => {
		const names = await listed(canonical);
		expect(await listed(here)).toEqual(names);
		expect(names).toEqual(
			expect.arrayContaining([
				'close-released-issues.ts',
				'close-released-issues-lib.ts',
				'close-released-issues-git.ts',
				'close-released-issues.spec.ts',
			]),
		);
	});

	test('every copy equals its canonical file, byte for byte', async () => {
		for (const name of await listed(canonical)) {
			const copy = Buffer.from(
				await Bun.file(new URL(name, here)).arrayBuffer(),
			);
			const source = Buffer.from(
				await Bun.file(new URL(name, canonical)).arrayBuffer(),
			);
			expect({ name, same: copy.equals(source) }).toEqual({
				name,
				same: true,
			});
		}
	});
});
