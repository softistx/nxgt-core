/**
 * Whether a release another session announced covers what a plan needs. Pure.
 */

import type { SessionView } from './roadmap';

/** `@nxgt/mail@0.5.0` → name `@nxgt/mail`, version `0.5.0`. */
export function splitNeed(need: string): { name: string; version?: string } {
	const at = need.lastIndexOf('@');
	if (at > 0) return { name: need.slice(0, at), version: need.slice(at + 1) };
	return { name: need };
}

/** A release announcement's words, lower-cased, with surrounding punctuation dropped. */
export function releaseTokens(text: string): string[] {
	return text
		.toLowerCase()
		.split(/[\s,;()[\]]+/)
		.map((t) => t.replace(/^[`'"]+/, '').replace(/[`'".:!?]+$/, ''))
		.filter(Boolean);
}

/**
 * Whether a release announcement covers a need. Name and version must each be
 * a whole word — `@nxgt/mail 0.5.0`, `@nxgt/mail@0.5.0` or `v0.5.0` — so
 * `@nxgt/mail-config 10.5.0` covers neither `@nxgt/mail` nor `0.5.0`.
 */
export function releaseCovers(
	text: string,
	name: string,
	version?: string,
): boolean {
	const tokens = releaseTokens(text);
	const n = name.toLowerCase();
	const v = version?.toLowerCase().replace(/^v/, '');
	if (v !== undefined && tokens.includes(`${n}@${v}`)) return true;
	if (!tokens.includes(n)) return false;
	return v === undefined || tokens.includes(v) || tokens.includes(`v${v}`);
}

export function releaseCovering(
	name: string,
	version: string | undefined,
	views: readonly SessionView[],
	except: string,
): { view: SessionView; text: string } | undefined {
	for (const view of views) {
		if (view.record.sessionId === except) continue;
		for (const a of view.record.announcements) {
			if (a.kind === 'release' && releaseCovers(a.text, name, version)) {
				return { view, text: a.text };
			}
		}
	}
	return undefined;
}
