/**
 * The text the Stop hook gives Claude when it blocks: what changed, what is
 * missing, the keep-docs-current bar — and the way out when the change is not
 * consumer-visible. It defers to Claude's judgement; it never insists.
 */

import { join } from 'node:path';
import type { Gap } from './gaps';

/** Where the package lives: absolute when the root is known, since several repositories may be checked. */
function location(gap: Gap): string {
	if (gap.root)
		return gap.pkg.dir === '' ? gap.root : join(gap.root, gap.pkg.dir);
	return gap.pkg.dir === '' ? 'the repository root' : gap.pkg.dir;
}

function describe(gap: Gap): string {
	const where = location(gap);
	const missing = gap.pkg.hasDocs
		? `${where}/README.md (and the docs/ guide page for that area)`
		: `${where}/README.md`;
	return [
		`- ${gap.pkg.name} (${where}): public files changed — ${gap.files.join(', ')}.`,
		`  Not changed: ${missing}.`,
	].join('\n');
}

export function buildReason(gaps: readonly Gap[]): string {
	return [
		'nxgt-docs: the public surface of a published package changed on this branch, but neither its README nor its docs/ did:',
		...gaps.map(describe),
		'',
		'If the change is consumer-visible, bring the docs to the keep-docs-current bar (nxgt-docs:keep-docs-current) before finishing: a README section with a concise copy-paste example for each export, subpath, option or peer that changed; the detailed guide under docs/ when the package has one; a docs/troubleshooting.md entry for any new consumer-visible error; and no private application named on the npm page or in docs/. The documentation-writer and documentation-auditor agents do this.',
		'',
		'If it is not consumer-visible (an internal refactor, a private helper, a comment), say so in one line and finish — this gate will not ask again for this package in this session. Never invent documentation for a guess.',
	].join('\n');
}
