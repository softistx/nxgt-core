/**
 * The one GraphQL transport: `gh api graphql`, tolerant of partial errors, and
 * saying which aliases they hit. `gh api graphql` exits 1 on any `errors`,
 * even beside usable `data`: the data is returned, with the first path segment
 * of each error (the alias it is under), so a caller can refuse to trust or
 * cache just that alias. A `NOT_FOUND` error means the thing is not there
 * (`missing`); any other error means GitHub could not say (`unknown`), which a
 * caller must never read as "not found". No data at all throws `GhError`; a
 * rate limit throws `RateLimitedError`.
 */

import { type GhContext, GhError, gh } from './github';
import { type Obj, obj, text } from './json';

export interface PartialResult {
	readonly data: Obj;
	/** Aliases with an error somewhere beneath them. */
	readonly errored: ReadonlySet<string>;
	/** Aliases whose every error is `NOT_FOUND`: the object is absent or invisible. */
	readonly missing: ReadonlySet<string>;
	/** Aliases with any other error, and `*` when an error names no alias: the answer there is not to be trusted. */
	readonly unknown: ReadonlySet<string>;
}

export async function graphqlPartial(
	ctx: GhContext,
	query: string,
	variables: Readonly<Record<string, string>> = {},
): Promise<PartialResult> {
	const args = [
		'api',
		'graphql',
		'-f',
		`query=${query}`,
		...Object.entries(variables).flatMap(([name, value]) => [
			'-f',
			`${name}=${value}`,
		]),
	];
	const out = await gh(ctx, args, undefined, { partial: true });
	let parsed: Obj;
	try {
		parsed = obj(JSON.parse(out));
	} catch {
		throw new GhError(
			args,
			0,
			`unparseable JSON from gh: ${out.slice(0, 100)}`,
		);
	}
	if (!parsed['data'] || typeof parsed['data'] !== 'object') {
		throw new GhError(args, 0, 'GraphQL answered no data');
	}
	const errored = new Set<string>();
	const unknown = new Set<string>();
	const found = new Set<string>();
	for (const raw of Array.isArray(parsed['errors']) ? parsed['errors'] : []) {
		const error = obj(raw);
		const path = error['path'];
		const alias =
			Array.isArray(path) && typeof path[0] === 'string' ? path[0] : undefined;
		const notFound = text(error['type']) === 'NOT_FOUND';
		if (alias === undefined) {
			// An error naming no alias cannot be pinned on one: a NOT_FOUND one is a missing object, anything else taints the answer.
			if (!notFound) unknown.add('*');
			continue;
		}
		errored.add(alias);
		if (notFound) found.add(alias);
		else unknown.add(alias);
	}
	const missing = new Set([...found].filter((alias) => !unknown.has(alias)));
	return { data: obj(parsed['data']), errored, missing, unknown };
}

/** Throws `GhError` when an error names no alias: the whole query failed, so no alias can be trusted. */
export function refuseUntraceable(result: PartialResult, what: string): void {
	if (!result.unknown.has('*')) return;
	throw new GhError(
		['api', 'graphql'],
		0,
		`${what}: GitHub answered with an error that names no alias`,
	);
}
