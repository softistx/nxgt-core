/**
 * Temporary folders for specs, each removed by `removeTempDirs`, which every
 * spec that makes one registers with `afterAll`: a run leaves nothing named
 * `nxgt-issues-*` in the temporary directory.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const made: string[] = [];

export function tempDir(prefix: string): string {
	const dir = mkdtempSync(join(tmpdir(), `nxgt-issues-${prefix}-`));
	made.push(dir);
	return dir;
}

export function removeTempDirs(): void {
	for (const dir of made.splice(0))
		rmSync(dir, { recursive: true, force: true });
}
