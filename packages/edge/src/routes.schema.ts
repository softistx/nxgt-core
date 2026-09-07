import { z } from 'zod';

/**
 * Where a request goes — and nothing about who may make it.
 *
 * Routing answers "which upstream", the rules document answers "who may", and
 * the separation is load-bearing rather than tidy. A routing table that also
 * listed methods would make a method nobody thought of — `QUERY` — unroutable
 * rather than merely unauthorised; and a match that ignored the host would
 * make `/health` a rule that either exists for every fronted app at once or
 * for none, since they all serve that exact path.
 *
 * The two documents are kept in agreement by a startup assertion, not by hand:
 * every app named here must be named there.
 */
const zMatch = z
	.object({
		host: z
			.string()
			.min(1)
			.optional()
			.describe(
				'The Host header this app answers on, compared exactly after ' +
					// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax this field documents
					'`${VAR}` expansion. Omit to match any host, which is what a ' +
					'single-host deployment wants — the apps are then told apart by ' +
					'`prefix`/`path` alone.',
			),
		prefix: z
			.string()
			.startsWith('/')
			.optional()
			.describe(
				'Path prefix, matched on segment boundaries: "/api" matches "/api" ' +
					'and "/api/x" but never "/apiary".',
			),
		path: z
			.string()
			.startsWith('/')
			.optional()
			.describe('Exact path. Use for a single endpoint, e.g. "/graphql".'),
	})
	.refine((match) => Boolean(match.prefix) !== Boolean(match.path), {
		message:
			'a match needs exactly one of `prefix` or `path` — two ways to say ' +
			'where an app lives would only ever disagree',
	});

const zApp = z.object({
	name: z
		.string()
		.regex(/^[A-Za-z0-9_-]+$/)
		.describe(
			'The app id. It is what the rules document names in a Keto term — ' +
				'`App:<name>#use` — so it is part of the authorization model, not a ' +
				'label. Restricted to characters that are safe in a Keto object id.',
		),
	match: zMatch,
	upstream: z.url().describe(
		// biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax this field documents
		'Where the request is forwarded, after `${VAR}` expansion — so one ' +
			'document serves every environment, and an upstream that differs ' +
			'between them is a variable rather than a second file. An unset ' +
			'variable throws at startup; it is never forwarded as an empty host.',
	),
	stripPrefix: z
		.boolean()
		.default(false)
		.describe(
			'Remove the matched `prefix` before forwarding. Off by default: every ' +
				'app in the parc is mounted at the same path it is fronted at, and ' +
				'a silent rewrite is how a 404 becomes unexplainable.',
		),
});

export const RoutesSchema = z.object({
	apps: z.array(zApp).min(1),
});

export type EdgeRoutes = z.infer<typeof RoutesSchema>;
export type EdgeApp = EdgeRoutes['apps'][number];

/**
 // biome-ignore lint/suspicious/noTemplateCurlyInString: the placeholder syntax this field documents
 * Expand `${VAR}` from an environment map, before validation.
 *
 * Throws on an unset variable rather than expanding to `""`: an upstream of
 * `http://:3008` is a routing table that boots and then fails every request
 * with a message about nothing.
 */
export function expandVariables(
	source: string,
	env: Record<string, string | undefined> = process.env,
): string {
	return source.replace(
		/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g,
		(_, name: string) => {
			const value = env[name];
			if (value === undefined || value === '') {
				throw new Error(
					`Edge routing table references \${${name}}, which is unset. An ` +
						'upstream built from an empty variable boots and then fails every ' +
						'request for no visible reason.',
				);
			}
			return value;
		},
	);
}
