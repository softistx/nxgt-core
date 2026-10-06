import type { RestRuleEntry } from '../rest/schema';
import { type Compile, compileExpression } from './expression';
import type { CompiledRestRoute } from './types';

const REST_SCOPE = ['claims', 'req'] as const;

/** One REST rule, checked for contradictions and precomputed for the request path. */
export function compileRestRoute(
	rule: RestRuleEntry,
	method: string,
	pattern: string,
	matcher: CompiledRestRoute['matcher'],
	compile: Compile,
): CompiledRestRoute {
	if (rule.authenticated && rule.public) {
		throw new Error(
			`Invalid rule for ${method} ${pattern}: \`authenticated\` and ` +
				'`public` are contradictory — a route either requires a ' +
				'signed-in caller or admits anonymous ones.',
		);
	}

	// A Keto term asks what THIS caller may do to an object; a public
	// rule has no caller to ask about. Refused here, next to the
	// `authenticated` + `public` contradiction, for the same reason.
	// The GraphQL side is checked in `compileGraphqlEntry`.
	//
	// Nothing else needs checking at this point: the schema already
	// refuses `[]` ("admits nobody"), `[[]]` (a conjunction over no
	// terms is vacuously true, so it would admit EVERYONE) and an `id`
	// that is not a readable path — at parse time, with a message that
	// names the offending key.
	if (rule.public && rule.keto?.length) {
		throw new Error(
			`Invalid rule for ${method} ${pattern}: \`public\` and \`keto\` are ` +
				'contradictory — a Keto term asks what the caller may do to an ' +
				'object, and a public rule admits callers there is nothing to ask ' +
				'about.',
		);
	}

	const ketoReadsBody = Boolean(
		rule.keto?.some((check) =>
			check.permissions.some((group) =>
				group.some((term) => term.id.startsWith('json.')),
			),
		),
	);

	const hasDomainPlaceholder = Boolean(
		rule.authorities?.some((group) =>
			group.some((authority) => authority.includes('$domain')),
		),
	);

	const compiledExpression = compileExpression(
		rule.expression,
		compile,
		REST_SCOPE,
	);
	return {
		pattern,
		matcher,
		rule,
		hasDomainPlaceholder,
		...(compiledExpression ? { compiledExpression } : {}),
		ketoReadsBody,
	};
}
