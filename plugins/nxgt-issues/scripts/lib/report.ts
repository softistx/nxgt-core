/**
 * The JSON a session pipes into `issues.ts file` and `issues.ts track`,
 * checked field by field. Every text field is written by Claude from scratch
 * (a minimal reproduction, never pasted application code); the filer scrubs
 * the rendered result anyway.
 */

import type { ReportKind } from './fingerprint';
import type { DependencyRow } from './issue-body';

export const KINDS: readonly ReportKind[] = [
	'bug',
	'enhancement',
	'documentation',
	'dependencies',
];

export interface IssueReport {
	readonly package: string;
	readonly kind: Exclude<ReportKind, 'dependencies'>;
	readonly title: string;
	/** One line naming the symptom; the duplicate fingerprint is computed from it. */
	readonly symptom: string;
	readonly summary: string;
	readonly versions: Readonly<Record<string, string>>;
	readonly expected: string;
	readonly actual: string;
	readonly repro: string;
	readonly workaround?: string | undefined;
	/** Words for the duplicate search; the title's words when absent. */
	readonly keywords: readonly string[];
	/** Added to the "another consumer" comment when this turns out a duplicate. */
	readonly note?: string | undefined;
}

export interface DependenciesReport {
	readonly package: string;
	readonly kind: 'dependencies';
	readonly dependencies: readonly DependencyRow[];
}

export type Report = IssueReport | DependenciesReport;

type Fields = Record<string, unknown>;

const text = (o: Fields, key: string, problems: string[]): string => {
	const value = o[key];
	if (typeof value === 'string' && value.trim()) return value;
	problems.push(`"${key}" must be a non-empty string`);
	return '';
};

const optional = (o: Fields, key: string): string | undefined =>
	typeof o[key] === 'string' && (o[key] as string).trim()
		? (o[key] as string)
		: undefined;

function stringRecord(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return;
	const entries = Object.entries(value);
	if (!entries.every(([, v]) => typeof v === 'string')) return;
	return Object.fromEntries(entries) as Record<string, string>;
}

export function parseRows(value: unknown): DependencyRow[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const rows: DependencyRow[] = [];
	for (const row of value) {
		const r = (row ?? {}) as Fields;
		const [name, current, latest] = [r['name'], r['current'], r['latest']];
		if (typeof name !== 'string' || typeof current !== 'string') return;
		if (typeof latest !== 'string') return undefined;
		rows.push({ name, current, latest });
	}
	return rows;
}

function parseIssue(o: Fields, kind: IssueReport['kind'], problems: string[]) {
	const versions = stringRecord(o['versions']);
	if (!versions || Object.keys(versions).length === 0) {
		problems.push('"versions" must map package names to versions');
	}
	const keywords = Array.isArray(o['keywords'])
		? o['keywords'].filter((k): k is string => typeof k === 'string')
		: [];
	const report: IssueReport = {
		package: text(o, 'package', problems),
		kind,
		title: text(o, 'title', problems),
		symptom: text(o, 'symptom', problems),
		summary: text(o, 'summary', problems),
		versions: versions ?? {},
		expected: text(o, 'expected', problems),
		actual: text(o, 'actual', problems),
		repro: text(o, 'repro', problems),
		workaround: optional(o, 'workaround'),
		keywords,
		note: optional(o, 'note'),
	};
	return report;
}

/** The report, or the list of what is wrong with it. */
export function parseReport(raw: string): Report | { problems: string[] } {
	let o: Fields;
	try {
		const value: unknown = JSON.parse(raw);
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			return { problems: ['stdin must hold one JSON object'] };
		}
		o = value as Fields;
	} catch {
		return { problems: ['stdin is not valid JSON'] };
	}
	const problems: string[] = [];
	const kind = o['kind'];
	if (!KINDS.includes(kind as ReportKind)) {
		return { problems: [`"kind" must be one of ${KINDS.join(', ')}`] };
	}
	if (kind === 'dependencies') {
		const rows = parseRows(o['dependencies']);
		if (!rows || rows.length === 0) {
			problems.push('"dependencies" must list { name, current, latest }');
		}
		const pkg = text(o, 'package', problems);
		if (problems.length > 0) return { problems };
		return { package: pkg, kind, dependencies: rows ?? [] };
	}
	const report = parseIssue(o, kind as IssueReport['kind'], problems);
	return problems.length > 0 ? { problems } : report;
}
