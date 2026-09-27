/**
 * Links `node_modules/@nxgt/i18n-vue` in the fixture to the package, as a
 * consumer's install does. Bun's isolated linker puts no workspace package at
 * the root, and without the link Nuxt resolves the module by self-reference
 * but warns that it cannot resolve `useI18n`'s auto-import.
 */

import { lstatSync, mkdirSync, symlinkSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const scope = join(import.meta.dir, 'node_modules/@nxgt');
mkdirSync(scope, { recursive: true });
const link = join(scope, 'i18n-vue');
// Unlinked, never removed recursively: the link points at the package itself.
if (lstatSync(link, { throwIfNoEntry: false })?.isSymbolicLink()) {
	unlinkSync(link);
}
symlinkSync('../../../..', link);
