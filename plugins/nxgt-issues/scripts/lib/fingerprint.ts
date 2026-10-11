/**
 * The duplicate fingerprint of a report: sha1 of the package, the kind and a
 * normalised symptom, carried in the issue body as a hidden comment so a later
 * report of the same thing finds it without a fuzzy search.
 */

import { createHash } from 'node:crypto';

export type ReportKind =
	| 'bug'
	| 'enhancement'
	| 'documentation'
	| 'dependencies';

/**
 * The symptom with everything that varies between consumers removed: case,
 * versions, hashes, paths, line numbers and other digits, quotes, punctuation,
 * spacing.
 */
export function normalizeSymptom(symptom: string): string {
	return symptom
		.toLowerCase()
		.replace(/https?:\/\/\S+/g, ' ')
		.replace(/(?:[a-z]:\\|\/)[\w.@+~\\/-]+/g, ' ')
		.replace(/\b[0-9a-f]{7,}\b/g, ' ')
		.replace(/\bv?\d+(?:\.\d+)*(?:-[\w.]+)?\b/g, ' ')
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function fingerprint(
	pkg: string,
	kind: ReportKind,
	symptom: string,
): string {
	return createHash('sha1')
		.update(`${pkg.toLowerCase()}\n${kind}\n${normalizeSymptom(symptom)}`)
		.digest('hex');
}

export const fingerprintMarker = (hash: string): string =>
	`<!-- nxgt-issues:fp=${hash} -->`;

export function extractFingerprint(body: string): string | undefined {
	return /<!--\s*nxgt-issues:fp=([0-9a-f]{40})\s*-->/.exec(body)?.[1];
}
