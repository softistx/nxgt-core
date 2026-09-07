import { USER_HEADERS } from '@nxgt/shared/models';
import { CustomException } from '@nxgt/shared-exceptions';
import { logger } from '@nxgt/shared-logging';
import type { Context } from 'hono';
import { createMiddleware } from 'hono/factory';
import type { MiddlewareHandler } from 'hono/types';
import type {
	PermissionEvaluator,
	PolicyClaims,
	PolicySubject,
} from '../../policy';
import { evaluateRest, parseRules } from '../../policy';

/**
 * Everything a rule carrying `keto` needs, for one request.
 *
 * Declared here rather than imported from `./keto` on purpose: that module
 * imports `stx-sdk`, and this one must not — a service whose rules file has no
 * Keto term should never resolve it. `ketoPermissions()` satisfies this shape
 * structurally.
 */
export interface PolicyPermissions {
	subject: PolicySubject | null | undefined;
	evaluatePermissions: PermissionEvaluator;
}

export type PermissionsProvider = (ctx: Context) => PolicyPermissions;

export interface PolicyGuardOptions {
	/**
	 * Supplies the caller and the Keto evaluator for rules that carry `keto`.
	 * Use `ketoPermissions()` from `@nxgt/security/integrations/hono/keto`,
	 * mounted after `oryChecks(ory)`. Rules with no `keto` term need nothing.
	 */
	permissions?: PermissionsProvider;
}

/**
 * Hono middleware that evaluates every incoming REST request against a
 * `rules.yaml` document.
 *
 * Must be placed **after** the token-resolution middleware (e.g. `bearerAuth`
 * or `currentUser`) so that the USER_HEADERS context variables are populated.
 *
 * Decision semantics:
 *   ALLOW           → passes through to next()
 *   UNAUTHENTICATED → responds 401 immediately
 *   DENY            → responds 403 immediately
 *   NOT_APPLICABLE  → passes through (no rule = open by default)
 *
 * The 401/403 split matters to the UIs: they re-authenticate on 401 and show
 * a "not allowed" error on 403. A matched rule refuses anonymous callers
 * unless it is marked `public`, so this guard — not a `secured()` further
 * down the chain — is what answers an expired session.
 *
 * Body handling:
 *   For `application/json` requests the body is buffered and passed to the
 *   expression evaluator as `req.body`. The raw request is cloned first so
 *   that downstream handlers (e.g. a reverse proxy) can still read the stream.
 *
 * `rawRules` is a raw/unvalidated rules document (e.g. a static YAML import,
 * or `loadRawRulesFromEnv`'s output) — validated and compiled internally via
 * `parseRules`, once, when `policyGuard(...)` is called, not per request.
 *
 * @example
 * ```ts
 * import rawRules from './rules.yaml';
 * import { policyGuard } from '@nxgt/security/integrations/hono';
 *
 * app.use('/api/*', bearerAuth(), policyGuard(rawRules));
 * ```
 */
export function policyGuard(
	rawRules: unknown,
	options: PolicyGuardOptions = {},
): MiddlewareHandler {
	const compiledPolicy = parseRules(rawRules);
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

		// Per request, because both halves are: the subject is this caller, and
		// the evaluator closes over this request's Keto answer cache.
		const permissions = options.permissions?.(ctx);

		const result = await evaluateRest(
			compiledPolicy,
			{
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
			},
			{
				evaluatePermissions: permissions?.evaluatePermissions,
				subject: permissions?.subject,
			},
		);

		if (result.decision === 'UNAUTHENTICATED') {
			logger.error(
				`Policy UNAUTHENTICATED: ${ctx.req.method} ${ctx.req.path}, reason: ${result.reason}`,
			);
			throw CustomException.unauthorized({
				message: 'errors.unauthenticated',
				debugMessage: result.reason,
			});
		}

		if (result.decision === 'DENY') {
			logger.error(
				`Policy DENY: ${ctx.req.method} ${ctx.req.path}, user: ${claims.username || 'anonymous'}, reason: ${result.reason}`,
			);
			// `denial` is only ever set by a Keto term, so an authority or
			// expression refusal keeps answering exactly what it always did.
			throw result.denial === 'NOT_FOUND'
				? CustomException.notFound({
						message: result.message ?? 'errors.not-found',
						debugMessage: result.reason,
					})
				: CustomException.forbidden({
						message: result.message ?? 'errors.forbidden',
						debugMessage: result.reason,
					});
		}
		logger.info(
			`Policy ${result.decision}: ${ctx.req.method} ${ctx.req.path}, user: ${claims.username || 'anonymous'}, reason: ${result.reason}`,
		);

		return next();
	});
}
