import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { RestEvaluateInput } from '../../policy';

/**
 * A JSON content type, exactly as Hono's validator detects one — copied from
 * `hono/dist/validator/validator.js` (`jsonRegex`, hono 4.13): `application/json`
 * and any `application/<x>+json`, any case, with optional parameters.
 */
const JSON_CONTENT_TYPE =
	/^application\/([a-z-.]+\+)?json(;\s*[a-zA-Z0-9-]+=([^;]+))*$/i;

/**
 * The `req` a rule's expression and `keto` terms see, read the way the
 * handler behind the guard reads it.
 *
 * The guard decides on these values and the handler acts on its own, so the
 * two read them the same way: the query comes from
 * `ctx.req.query()` and the cookies from `getCookie(ctx)` — the first value of
 * a repeated name, decoded once, quotes stripped — exactly what a Hono handler
 * gets from the same calls.
 *
 * The body is read only for a JSON content type, detected as Hono's validator
 * detects it (`JSON_CONTENT_TYPE`). The raw request is cloned first and put back, so a
 * downstream reader of `ctx.req.raw` (a reverse proxy, say) still has the
 * stream; `ctx.req.json()` itself is cached for the handler.
 */
export async function readPolicyRequest(
	ctx: Context,
): Promise<NonNullable<RestEvaluateInput['req']>> {
	const clonedRaw = ctx.req.raw.clone();

	let body: unknown;
	if (JSON_CONTENT_TYPE.test(ctx.req.header('content-type') ?? '')) {
		try {
			body = await ctx.req.json();
		} catch {
			// Malformed or empty body — leave body undefined
		}
	}

	ctx.req.raw = clonedRaw;

	return {
		body,
		query: ctx.req.query(),
		cookies: getCookie(ctx),
		headers: ctx.req.header(),
	};
}
