import { CustomException } from '@nxgt/shared-exceptions';
import DataLoader from 'dataloader';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import {
	assertRequirement,
	evaluateRequirement,
	type Ory,
	type Permission,
	type PermissionRequirement,
	type PermissionTerm,
	type Subject,
	tuple,
} from 'stx-sdk/ory';

/**
 * The per-request Keto answer cache — the same thing `useKetoChecks` puts on a
 * GraphQL context, for the same reason.
 *
 * `DataLoader` **batches** distinct questions into one
 * `POST /relation-tuples/batch/check` and **memoises** identical ones for the
 * life of the request. So a route guarded by `ketoCheck(view)` and a service
 * that then calls `require<M>Access` — the same question — pay for one round
 * trip between them. The key is Keto's own notation, `Bookmark:b1#view@idn-7`,
 * so a cache hit is legible in a log line.
 *
 * Mount it once, next to `oryAuth(ory)`. Nothing else in the app then needs to
 * know a Keto URL exists.
 */
export type KetoChecker = (
	permission: Permission,
	subject: Subject,
) => Promise<boolean>;

export function useOry(ory: Ory) {
	return createMiddleware(async (ctx, next) => {
		const loader = new DataLoader<
			{ permission: Permission; subject: Subject },
			boolean,
			string
		>((questions) => ory.checkMany([...questions]), {
			cacheKeyFn: ({ permission, subject }) => tuple(permission, subject),
		});

		ctx.set('ketoChecks', (permission, subject) =>
			loader.load({ permission, subject }),
		);

		return next();
	});
}

/**
 * 401 for a caller `oryAuth()` could not resolve.
 *
 * `oryAuth()` deliberately calls `next()` for an anonymous caller — it
 * authenticates, it does not decide — so something has to say a route needs
 * somebody. This replaces the `authenticated: true` that every rule of an
 * Ory-native `rules.yaml` used to carry, and nothing else that file said.
 *
 * The `NODE_ENV=test` mock headers set `ory` like any other credential, so a
 * route spec that sends `X-User-Id` passes here unchanged.
 */
export function requireAuthenticated() {
	return createMiddleware(async (ctx, next) => {
		if (!ctx.get('ory')?.subject) {
			throw CustomException.unauthenticated({
				message: 'errors.unauthenticated',
			});
		}
		return next();
	});
}

export type KetoCheckOptions = {
	/**
	 * `NOT_FOUND` (the default) is the same answer as for an id that never
	 * existed, so ids cannot be probed. `FORBIDDEN` is for a second check on
	 * an object the caller can already see.
	 */
	onDeny?: 'NOT_FOUND' | 'FORBIDDEN';

	/**
	 * The i18n key the denial carries, e.g. `bookmarks.errors.not-found`.
	 * Defaults to `errors.not-found` / `errors.insufficient-permissions`.
	 *
	 * Set it whenever the module's own `<m>.access.ts` answers the same refusal
	 * with a domain message. Two layers guard these routes, and if they word
	 * one 404 differently, the wording tells the caller WHICH refused — a
	 * generic message means "you may not", a domain one means "it is gone".
	 * That is the distinction NOT_FOUND exists to hide.
	 */
	message?: string;
};

/**
 * The permission a route requires, in the same `[[ ]]` grammar as the `@check`
 * directive: the OUTER list is OR, the INNER list is AND.
 *
 * ```ts
 * app.patch('/:id',
 *   ketoCheck([[{ namespace: 'Bookmark', permit: 'view', id: 'param.id' }]]),
 *   ketoCheck([[{ namespace: 'Bookmark', permit: 'edit', id: 'param.id' }]],
 *             { onDeny: 'FORBIDDEN' }),
 *   handler);
 * ```
 *
 * Two of them, in that order, is how a denial is a 404 for a stranger and a
 * 403 for a viewer — the ladder `<module>.access.ts` walks, said where the
 * route is declared.
 *
 * `id` is a path: `param.<name>`, `query.<name>` or `json.<path>`. A value
 * that turns out to be a LIST requires the permit on every element. A path
 * that resolves nothing is a wiring mistake and throws — never an allow.
 *
 * `OryUnavailable` is not caught: a Keto outage is a 503 through
 * `withOryUnavailable`, never a denial.
 */
export function ketoCheck(
	permissions: PermissionRequirement,
	options: KetoCheckOptions = {},
) {
	assertRequirement(permissions, 'ketoCheck');
	for (const group of permissions) {
		for (const term of group) assertReadablePath(term);
	}

	return createMiddleware(async (ctx, next) => {
		const subject = ctx.get('ory')?.subject;
		if (!subject) {
			throw CustomException.unauthenticated({
				message: 'errors.unauthenticated',
			});
		}

		const check = ctx.get('ketoChecks');
		if (!check) {
			throw new Error('ketoCheck: useOry(ory) is not mounted on this app');
		}

		// The body is read once, before evaluation, because `evaluateRequirement`
		// resolves objects synchronously — and because reading it twice would
		// consume the stream if Hono did not cache it.
		const body = permissions.some((group) =>
			group.some((term) => term.id.startsWith('json.')),
		)
			? await readJson(ctx)
			: {};

		const allowed = await evaluateRequirement(
			permissions,
			(term) => objectsOf(term, ctx, body),
			check,
			subject,
		);

		if (!allowed) {
			throw options.onDeny === 'FORBIDDEN'
				? CustomException.forbidden({
						message: options.message ?? 'errors.insufficient-permissions',
					})
				: CustomException.notFound({
						message: options.message ?? 'errors.not-found',
					});
		}

		return next();
	});
}

function assertReadablePath(term: PermissionTerm) {
	if (!/^(param|query|json)(\.[A-Za-z0-9_]+)+$/.test(term.id)) {
		throw new Error(
			`ketoCheck: \`id\` must be "param.<name>", "query.<name>" or "json.<path>", got ${JSON.stringify(term.id)}`,
		);
	}
}

async function readJson(ctx: Context): Promise<Record<string, unknown>> {
	try {
		return (await ctx.req.json()) ?? {};
	} catch {
		return {};
	}
}

function objectsOf(
	term: PermissionTerm,
	ctx: Context,
	body: Record<string, unknown>,
): string[] {
	const [root, first = '', ...deeper] = term.id.split('.');

	let value: unknown;
	if (root === 'param') value = ctx.req.param(first);
	else if (root === 'query') value = ctx.req.query(first);
	else value = body?.[first];

	for (const key of deeper) {
		value = (value as Record<string, unknown> | null | undefined)?.[key];
	}

	const ids = (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && item.length > 0,
	);
	if (ids.length === 0) {
		throw new Error(`ketoCheck: "${term.id}" resolved no object id`);
	}
	return ids;
}
