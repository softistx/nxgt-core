/**
 * A roadmap as the nxgt-docs roadmap-keeper writes it: `docs/roadmap.md`, with
 * entries listed under Now, Next, Later, Not planned and Shipped. Parsing and
 * identity only. Pure.
 */

import type { SessionRecord } from './record';

export interface RoadmapEntry {
	/** The `##` section it sits under: Now, Next, Later, Not planned, Shipped. */
	readonly section: string;
	readonly title: string;
}

export interface Roadmap {
	/** Absolute path of the docs/roadmap.md. */
	readonly path: string;
	/** What it is the roadmap of: the package name, else the repository name. */
	readonly scope: string;
	readonly entries: readonly RoadmapEntry[];
}

/** Sections whose entries are no longer open to plan: done, or decided against. */
export const CLOSED_SECTIONS: readonly string[] = ['Shipped', 'Not planned'];

export function isClosed(section: string): boolean {
	return CLOSED_SECTIONS.some(
		(c) => c.toLowerCase() === section.trim().toLowerCase(),
	);
}

/**
 * The top-level list items of a roadmap, under their `##`/`###` section. An
 * item's title is its bold text when it has some, else the text before the
 * first ` — `, ` - ` or `: `.
 */
export function parseRoadmap(markdown: string): RoadmapEntry[] {
	const out: RoadmapEntry[] = [];
	let section = '';
	let fence = false;
	for (const line of markdown.split('\n')) {
		if (/^\s*```/.test(line)) fence = !fence;
		if (fence) continue;
		const heading = /^#{2,3}\s+(.+?)\s*#*\s*$/.exec(line);
		if (heading) {
			section = (heading[1] as string).trim();
			continue;
		}
		const item = /^[-*]\s+(.+)$/.exec(line);
		if (!item || !section) continue;
		const text = (item[1] as string).replace(/^\[[ xX]\]\s+/, '');
		const bold = /\*\*(.+?)\*\*/.exec(text);
		const title = (
			bold ? (bold[1] as string) : (text.split(/\s+[—–-]\s+|:\s/)[0] as string)
		)
			.replace(/`/g, '')
			.trim();
		if (title) out.push({ section, title });
	}
	return out;
}

/** A roadmap entry's identity: case, punctuation and markdown ignored. */
export function entryKey(title: string): string {
	return title
		.toLowerCase()
		.replace(/[`*_]/g, '')
		.replace(/[^a-z0-9@/.]+/g, ' ')
		.trim();
}

/** One session as the alignment pass sees it. */
export interface SessionView {
	readonly record: SessionRecord;
	/** The roadmaps of the worktrees it works in. */
	readonly roadmaps: readonly Roadmap[];
}
