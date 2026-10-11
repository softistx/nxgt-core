/** A checkout of the library and a `CliContext` around a fake world, for the command specs. */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CliContext } from './cli-context';
import { DIR, type Fake, ghContext, PKG } from './release.fixtures';
import { tempDir } from './temp.fixtures';

/** A checkout of the library: origin and `packages/widget`, or with `root` a single package at the root. */
export function makeLibrary(root = false): string {
	const dir = join(tempDir('lib'), 'nxgt-widget');
	const put = (path: string, data: string) => {
		mkdirSync(join(dir, path, '..'), { recursive: true });
		writeFileSync(join(dir, path), data);
	};
	put(
		'.git/config',
		'[remote "origin"]\n\turl = git@github.com:softistx/nxgt-widget.git\n',
	);
	if (root) {
		put('package.json', JSON.stringify({ name: PKG, version: '1.4.0' }));
		return dir;
	}
	put(
		'package.json',
		JSON.stringify({ name: 'nxgt-widget', workspaces: ['packages/*'] }),
	);
	put(`${DIR}/package.json`, JSON.stringify({ name: PKG, version: '1.4.0' }));
	return dir;
}

export function cliContext(
	fake: Fake,
	cwd: string,
): { ctx: CliContext; out: string[]; err: string[] } {
	const out: string[] = [];
	const err: string[] = [];
	const ctx: CliContext = {
		...ghContext(fake),
		env: {},
		cwd,
		hostname: 'h',
		homeDir: '/h',
		stdin: async () => '',
		out: (line) => out.push(line),
		err: (line) => err.push(line),
	};
	return { ctx, out, err };
}
