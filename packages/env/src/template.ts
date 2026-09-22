import { classifyByName, readAnnotation } from './classify';
import { generateValue } from './generate';
import type { CheckResult, Entry, RenderResult, Template } from './types';

const ASSIGNMENT = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/;

/**
 * Parses a `.env.example` / `.env.template` / `.env`.
 *
 * Comments above a key belong to it, which is what makes `# @env …` work. A
 * blank line ends a comment block, so a file-level header is not read as an
 * annotation for whatever key happens to follow it.
 */
export function parseTemplate(text: string): Template {
	const lines = text.split('\n');
	const entries: Entry[] = [];
	let comments: string[] = [];
	lines.forEach((raw, index) => {
		const line = raw.trimEnd();
		if (line.trim() === '') {
			comments = [];
			return;
		}
		if (line.trimStart().startsWith('#')) {
			comments.push(line.trimStart().replace(/^#+\s?/, ''));
			return;
		}
		const match = ASSIGNMENT.exec(line);
		if (!match) {
			comments = [];
			return;
		}
		const key = match[1] as string;
		const value = match[2] ?? '';
		const source = readAnnotation(comments);
		entries.push({
			key,
			value: value.trim(),
			comments,
			line: index + 1,
			source: source ?? classifyByName(key),
			annotated: source !== null,
		});
		comments = [];
	});
	return { entries, lines };
}

/** The values of an existing `.env`, by key. Quotes are kept as written. */
export function parseValues(text: string): Map<string, string> {
	const values = new Map<string, string>();
	for (const line of text.split('\n')) {
		if (line.trimStart().startsWith('#')) continue;
		const match = ASSIGNMENT.exec(line.trimEnd());
		if (match) values.set(match[1] as string, (match[2] ?? '').trim());
	}
	return values;
}

/**
 * A template value that means "not filled in". These are the placeholder
 * conventions already in use across this parc, and they are treated as empty
 * rather than copied — a `.env` holding the literal `CHANGE_ME` is the failure
 * this package exists to prevent.
 */
export function isPlaceholder(value: string): boolean {
	const bare = value.replace(/^['"]|['"]$/g, '').trim();
	if (bare === '') return true;
	return (
		/^(CHANGE[-_ ]?ME|TODO|FIXME|REPLACE[-_ ]?ME|xxx+|\.\.\.)$/i.test(bare) ||
		/^<[^>]+>$/.test(bare)
	);
}

export interface RenderOptions {
	/** The `.env` as it is today. Its values win — this is never a rewrite. */
	existing?: Map<string, string>;
	/** Keys to regenerate even though they already have a value. */
	rotate?: string[];
}

/**
 * Writes the `.env`, mirroring the template's own lines so the two stay
 * diffable, and **never** replacing a value the existing file already has
 * (except for keys named in `rotate`).
 *
 * Idempotence is the property that matters: running this twice produces the same
 * file, and running it after a key was added to the template fills in that key
 * alone.
 */
export function renderEnv(
	template: Template,
	options: RenderOptions = {},
): RenderResult {
	const existing = options.existing ?? new Map<string, string>();
	const rotate = new Set(options.rotate ?? []);
	const byLine = new Map(template.entries.map((entry) => [entry.line, entry]));
	const generated: string[] = [];
	const kept: string[] = [];
	const pending: string[] = [];
	const out: string[] = [];

	template.lines.forEach((raw, index) => {
		const entry = byLine.get(index + 1);
		if (!entry) {
			out.push(raw);
			return;
		}
		const current = existing.get(entry.key);
		const has = current !== undefined && !isPlaceholder(current);
		if (has && !rotate.has(entry.key)) {
			kept.push(entry.key);
			out.push(`${entry.key}=${current}`);
			return;
		}
		if (entry.source.kind === 'generate') {
			const value = generateValue(
				entry.source.generator,
				entry.source.length,
				entry.source.charset,
			);
			generated.push(entry.key);
			out.push(`${entry.key}=${value}`);
			return;
		}
		if (entry.source.kind === 'manual') {
			pending.push(entry.key);
			out.push(`${entry.key}=`);
			return;
		}
		out.push(`${entry.key}=${isPlaceholder(entry.value) ? '' : entry.value}`);
		if (isPlaceholder(entry.value)) pending.push(entry.key);
	});

	return { text: out.join('\n'), generated, kept, pending };
}

/** Compares a `.env` with its template. This is the CI-shaped half. */
export function checkEnv(templateText: string, envText: string): CheckResult {
	const template = parseTemplate(templateText);
	const values = parseValues(envText);
	const missing: string[] = [];
	const empty: string[] = [];
	const pending: string[] = [];
	for (const entry of template.entries) {
		const value = values.get(entry.key);
		if (value === undefined) {
			missing.push(entry.key);
			continue;
		}
		if (!isPlaceholder(value)) continue;
		if (entry.source.kind === 'manual') pending.push(entry.key);
		else empty.push(entry.key);
	}
	const declared = new Set(template.entries.map((entry) => entry.key));
	const extra = [...values.keys()].filter((key) => !declared.has(key));
	return {
		missing,
		extra,
		empty,
		pending,
		ok: missing.length === 0 && empty.length === 0,
	};
}
