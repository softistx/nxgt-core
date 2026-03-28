import { USER_HEADERS } from '@nxgt/shared/models';
import type { PolicyClaims, Rules } from '@nxgt/shared/policy';
import { evaluateRest } from '@nxgt/shared/policy';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { createMiddleware } from 'hono/factory';

/**
 * Hono middleware that evaluates every incoming REST request against a
 * pre-validated `Rules` document loaded from a `rules.yaml` file.
 *
 * Must be placed **after** the token-resolution middleware (e.g. `bearerAuth`
 * or `currentUser`) so that the USER_HEADERS context variables are populated.
 *
 * Decision semantics:
 *   ALLOW          → passes through to next()
 *   DENY           → responds 403 immediately
 *   NOT_APPLICABLE → passes through (no rule = open by default)
 *
 * Body handling:
 *   For `application/json` requests the body is buffered and passed to the
 *   expression evaluator as `req.body`. The raw request is cloned first so
 *   that downstream handlers (e.g. a reverse proxy) can still read the stream.
 *
 * @example
 * ```ts
 * import rawRules from './rules.yaml';
 * import { RulesSchema } from '@nxgt/shared/policy';
 * import { policyGuard } from '@nxgt/shared-hono';
 *
 * const rules = RulesSchema.parse(rawRules);
 * app.use('/api/*', bearerAuth(), policyGuard(rules));
 * ```
 */
export function policyGuard(rules: Rules) {
	return createMiddleware(async (ctx, next) => {
		const clonedRaw = ctx.req.raw.clone();

		const claims: PolicyClaims = ctx.get(USER_HEADERS.CLAIMS) ?? ({} as any);

		let body: unknown;
		const contentType = ctx.req.header('content-type') ?? '';
		if (contentType.includes('application/json')) {
			try {
				body = await ctx.req.json();
			} catch {
				// Malformed or empty body — leave body undefined
			}
		}

		ctx.req.raw = clonedRaw;

		const cookies: Record<string, string> = {};
		const cookieHeader = ctx.req.header('cookie');
		if (cookieHeader) {
			for (const part of cookieHeader.split(';')) {
				const eqIdx = part.indexOf('=');
				if (eqIdx === -1) continue;
				const key = part.slice(0, eqIdx).trim();
				const val = part.slice(eqIdx + 1).trim();
				if (key) cookies[key] = val;
			}
		}

		const query: Record<string, string> = Object.fromEntries(
			new URL(ctx.req.url).searchParams,
		);

		const result = evaluateRest(rules, {
			type: 'rest',
			method: ctx.req.method,
			path: ctx.req.path,
			claims,
			req: {
				body,
				query,
				cookies,
				headers: ctx.req.header(),
			},
		});

		if (result.decision === 'DENY') {
			logger.error(
				`Policy DENY: ${ctx.req.method} ${ctx.req.path}, user: ${claims.username || 'anonymous'}, reason: ${result.reason}`,
			);
			throw CustomException.forbidden({
				message: 'errors.forbidden',
				debugMessage: result.reason,
			});
		}
		logger.info(
			`Policy ${result.decision}: ${ctx.req.method} ${ctx.req.path}, user: ${claims.username || 'anonymous'}, reason: ${result.reason}`,
		);

		return next();
	});
}
