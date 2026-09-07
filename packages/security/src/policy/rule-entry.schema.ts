import { z } from 'zod';

// ---------------------------------------------------------------------------
// Reusable sub-schemas — shared between `global` and per-rule overrides
// ---------------------------------------------------------------------------

export const zCorsConfig = z.object({
	origins: z.array(z.string()).describe('Allowed CORS origins.'),
	methods: z.array(z.string()).describe('Allowed CORS HTTP methods.'),
	allowedHeaders: z.array(z.string()).describe('Allowed CORS request headers.'),
});

export const zRateLimitConfig = z.object({
	windowMs: z.number().describe('Rate-limit window size, in milliseconds.'),
	limit: z.number().describe('Maximum number of requests allowed per window.'),
});

// ---------------------------------------------------------------------------
// Keto permission checks
// ---------------------------------------------------------------------------

/**
 * The paths a Keto term's `id` may take. Two grammars, because the two
 * transports have two different things to read an object id out of — the same
 * split `ketoCheck()` and the `@check` directive already make.
 *
 * Kept in step by hand with `assertReadablePath` in `@nxgt/shared-hono` and
 * `assertReadablePath` in `@nxgt/shared-graphql`. Enforced in the schema
 * rather than at startup, so a bad path is underlined in the editor as it is
 * typed — and, more usefully, so REST's `param.id` written under `graphql:`
 * is refused by the schema that annotates that half of the document.
 */
export const REST_PERMISSION_ID_PATH = /^(param|query|json)(\.[A-Za-z0-9_]+)+$/;
export const GRAPHQL_PERMISSION_ID_PATH = /^(args|source)(\.[A-Za-z0-9_]+)+$/;

/**
 * One Keto check — the exact equivalent of one `ketoCheck()` middleware or one
 * `@check` directive, denial and message included.
 *
 * Built per transport because only the `id` grammar differs; everything the
 * reader has to understand — the DNF nesting, the rungs, the denials — is
 * identical on both sides, which is the whole point.
 */
function ketoCheckSchema(
	idPattern: RegExp,
	idDefault: string,
	idHelp: string,
	idExamples: string[],
) {
	const zTerm = z.object({
		namespace: z
			.string()
			.min(1)
			.describe(
				'Keto namespace of the object, e.g. "Bookmark". Named here rather ' +
					'than in a URL, so no Keto address ever appears in a rules file.',
			),
		permit: z
			.string()
			.min(1)
			.describe(
				'The relation the caller must hold on the object, e.g. "view" or ' +
					'"edit".',
			),
		id: z
			.string()
			.regex(idPattern, { message: `\`id\` must be ${idHelp}` })
			.default(idDefault)
			.describe(
				`Where the object id is read from: ${idHelp} (dotted). A path ` +
					'resolving to a LIST requires the permit on every element; a path ' +
					'resolving to nothing is a wiring mistake and throws — it is ' +
					`never an allow. Defaults to "${idDefault}".`,
			)
			.meta({ examples: idExamples }),
	});

	return z.object({
		/**
		 * The permission requirement, in the SAME grammar as the `@check`
		 * directive and `ketoCheck()`: outer list is OR, inner list is AND.
		 */
		permissions: z
			.array(z.array(zTerm).min(1))
			.min(1)
			.describe(
				'Permission requirement in disjunctive normal form: the OUTER list ' +
					'is OR, the INNER list is AND — [[A, B], [C]] reads "(A and B) or ' +
					'C". NOTE this is the OPPOSITE nesting to `authorities`, which is ' +
					'outer-AND / inner-OR. It is deliberate: this is the same grammar ' +
					'as the `@check` directive and `ketoCheck()`, so one permission ' +
					'reads identically wherever it is declared. The two are not ' +
					'confusable in practice — an authority is a string, a permission ' +
					'term is an object.',
			),
		onDeny: z
			.enum(['NOT_FOUND', 'FORBIDDEN'])
			.default('NOT_FOUND')
			.describe(
				'How a failure of THIS check is answered. NOT_FOUND (the default) is ' +
					'the same answer as for an id that never existed, so ids cannot be ' +
					'probed. FORBIDDEN is for a second check on an object the caller ' +
					'can already see.',
			),
		message: z
			.string()
			.optional()
			.describe(
				'The i18n key the denial carries, e.g. "bookmarks.errors.not-found". ' +
					'Defaults to "errors.not-found" / "errors.insufficient-' +
					'permissions" — the same fallbacks as `ketoCheck()` and the ' +
					'`@check` directive, because rails that refuse the same thing ' +
					'must say it with the same words.',
			),
	});
}

export const zRestKetoCheck = ketoCheckSchema(
	REST_PERMISSION_ID_PATH,
	'param.id',
	'"param.<name>", "query.<name>" or "json.<path>"',
	['param.id', 'param.subjectId', 'query.projectId', 'json.bookmarkId'],
);

export const zGraphqlKetoCheck = ketoCheckSchema(
	GRAPHQL_PERMISSION_ID_PATH,
	'args.id',
	'"args.<path>" or "source.<path>"',
	['args.id', 'args.ids', 'args.input.noteId', 'source.id'],
);

// ---------------------------------------------------------------------------
// Shared rule entry — used by both REST and GraphQL rule maps
// ---------------------------------------------------------------------------

export const zRuleEntry = z.object({
	/**
	 * Authority groups to check against the caller's claims.
	 *
	 * - null / undefined / empty array  → authenticated caller is sufficient
	 * - Outer array = AND — every group must be satisfied
	 * - Inner array = OR  — at least one authority in the group must match
	 *
	 * The check is performed against the union of claims.authorities,
	 * claims.roles, and the individual items in claims.scope (space-separated).
	 *
	 * @example [["ADMIN", "users:read"]]        — ADMIN or users:read
	 * @example [["ADMIN"], ["users:read"]]       — ADMIN and users:read
	 */
	authorities: z
		.array(z.array(z.string()))
		.nullish()
		.describe(
			'Authority groups checked against the union of claims.authorities, ' +
				'claims.roles, and space-separated claims.scope tokens. Outer array ' +
				'is AND (every group must be satisfied), inner array is OR (at ' +
				'least one authority in the group must match). Omit, or use an ' +
				'empty/null value, to require only that the caller is authenticated. ' +
				'Example: [["ADMIN", "users:read"]] means ADMIN OR users:read; ' +
				'[["ADMIN"], ["users:read"]] means ADMIN AND users:read.',
		),

	/**
	 * Optional JavaScript expression evaluated against the request context.
	 * Must return a truthy value for the rule to allow the request.
	 *
	 * Available scope variables differ by evaluator type:
	 *   REST    — `claims`, `req` (body, params, query, headers, cookies)
	 *   GraphQL — `claims`, `args`, `source`, `info`
	 */
	expression: z
		.object({
			value: z
				.string()
				.describe(
					'JavaScript expression source evaluated at request time; must ' +
						'return a truthy value for the rule to allow the request. ' +
						'REST rules see `claims` and `req` (body, params, query, ' +
						'headers, cookies) in scope; GraphQL rules see `claims`, ' +
						"`args`, `source` (the resolver's parent/source value — " +
						'useful for ownership checks like `source.id === claims.sub`), ' +
						'and `info` (the GraphQLResolveInfo). Example: ' +
						'"args.input.username.toLowerCase() !== \'admin\'".',
				)
				.meta({
					// Not exhaustive, and not enforced — these just seed editor
					// autocompletion (vscode-yaml suggests `examples` as value
					// choices for a string field) with realistic starting points,
					// since the field itself is arbitrary JS and can't offer real
					// member-level completion (e.g. typing `claims.` and seeing
					// `roles`/`scope`) through a JSON Schema alone.
					examples: [
						// REST
						"req.body.username.toLowerCase() !== 'admin'",
						"req.method === 'GET' || claims.roles?.includes('ADMIN')",
						'req.params.id === claims.sub',
						// GraphQL
						"args.input.username.toLowerCase() !== 'admin'",
						'source.id === claims.sub',
						"info.fieldName !== 'ssn' || claims.roles?.includes('ADMIN')",
					],
				}),
			message: z
				.string()
				.optional()
				.describe(
					'Custom error message surfaced when the expression returns ' +
						'falsy. Defaults to "Expression check failed".',
				),
		})
		.optional()
		.describe(
			'Optional JavaScript expression check evaluated in addition to (and ' +
				'after) the authorities check.',
		),

	/**
	 * Declares that the rule requires nothing beyond a signed-in caller.
	 *
	 * Purely documentary: a matched rule already requires one. It exists
	 * because the alternatives all read wrong — `authorities: []` looks like
	 * "no constraint" and `expression: "!!claims.sub"` buries the intent in a
	 * string. Prefer it over both.
	 */
	authenticated: z
		.boolean()
		.nullish()
		.describe(
			'Declares that this route needs a signed-in caller and no ' +
				'particular authority. Documentary — every matched rule already ' +
				'requires one — but far clearer than an empty `authorities` list ' +
				'or an expression on `claims.sub`. Cannot be combined with ' +
				'`public: true`.',
		),

	/**
	 * Opts the rule out of the authentication floor, letting anonymous
	 * callers through to the authority and expression checks.
	 *
	 * For routes that carry their own credential instead of a session — a
	 * share link whose token, password and expiry the service checks itself.
	 * Everything else should stay authenticated.
	 */
	public: z
		.boolean()
		.nullish()
		.describe(
			'Lets anonymous callers reach this rule instead of being answered ' +
				'401. Only for routes that carry their own credential (e.g. a ' +
				'share-link token the service validates). Cannot be combined ' +
				'with `authenticated: true`.',
		),

	cors: zCorsConfig
		.optional()
		.describe(
			'Per-rule CORS override. Reserved for future use — not currently ' +
				'enforced by the policy evaluators in this package.',
		),

	rateLimit: zRateLimitConfig
		.optional()
		.describe(
			'Per-rule rate-limit override. Reserved for future use — not ' +
				'currently enforced by the policy evaluators in this package.',
		),
});

export type RuleEntry = z.infer<typeof zRuleEntry>;
export type RestKetoCheck = z.infer<typeof zRestKetoCheck>;
export type GraphqlKetoCheck = z.infer<typeof zGraphqlKetoCheck>;
