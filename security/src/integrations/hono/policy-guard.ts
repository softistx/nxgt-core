import { USER_HEADERS } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono/types';
import type { PolicyClaims } from '../../policy';
import { ensureCompiledPolicy, evaluateRest } from '../../policy';

/**
 * Hono middleware that evaluates every incoming REST request against a
 * `rules.yaml` document.
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
 * `policy` accepts either an already-compiled `CompiledPolicy` (e.g. from
 * `loadRulesFromEnv`/`parseRules`) or a raw/unvalidated rules document —
 * compiled internally via `ensureCompiledPolicy`, once, when `policyGuard(...)`
 * is called, not per request.
 *
 * @example
 * ```ts
 * import rawRules from './rules.yaml';
 * import { policyGuard } from '@nxgt/security/integrations/hono';
 *
 * app.use('/api/*', bearerAuth(), policyGuard(rawRules));
 * ```
 */
export function policyGuard(policy: unknown): MiddlewareHandler {
	const compiledPolicy = ensureCompiledPolicy(policy);
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

		const result = evaluateRest(compiledPolicy, {
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
