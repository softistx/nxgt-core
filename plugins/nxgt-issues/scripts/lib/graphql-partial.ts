/**
 * A GraphQL call that tolerates partial errors and says which aliases they hit.
 * `gh api graphql` exits 1 on any `errors`, even beside usable `data`: the
 * data is returned, with the first path segment of each error (the alias the
 * error is under), so a caller can refuse to trust or cache just that alias.
 * No data at all throws `GhError`; a rate limit throws `RateLimitedError`.
 */

import { type GhContext, GhError, gh } from './github';

export interface PartialResult {
	readonly data: Record<string, unknown>;
	/** Aliases with an error somewhere beneath them. */
	readonly errored: ReadonlySet<string>;
}

export async function graphqlPartial(
	ctx: GhContext,
	query: string,
): Promise<PartialResult> {
	const args = ['api', 'graphql', '-f', `query=${query}`];
	const out = await gh(ctx, args, undefined, { partial: true });
	let parsed: { data?: unknown; errors?: unknown };
	try {
		parsed = JSON.parse(out) as typeof parsed;
	} catch {
		throw new GhError(
			args,
			0,
			`unparseable JSON from gh: ${out.slice(0, 100)}`,
		);
	}
	if (!parsed.data || typeof parsed.data !== 'object') {
		throw new GhError(args, 0, 'GraphQL answered no data');
	}
	const errored = new Set<string>();
	for (const error of Array.isArray(parsed.errors) ? parsed.errors : []) {
		const path = (error as { path?: unknown } | null)?.path;
		if (Array.isArray(path) && typeof path[0] === 'string')
			errored.add(path[0]);
	}
	return { data: parsed.data as Record<string, unknown>, errored };
}
