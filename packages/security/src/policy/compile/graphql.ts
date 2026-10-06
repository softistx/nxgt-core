import type { GraphqlRuleEntry } from '../graphql/schema';
import { type Compile, compileExpression } from './expression';
import type { CompiledGraphqlEntry } from './types';

const GRAPHQL_SCOPE = ['claims', 'args', 'source', 'info'] as const;

/** One GraphQL rule as a `[field, entry]` pair, checked for contradictions. */
export function compileGraphqlEntry(
	rule: GraphqlRuleEntry,
	operationType: string,
	field: string,
	compile: Compile,
): [string, CompiledGraphqlEntry] {
	if (rule.authenticated && rule.public) {
		throw new Error(
			`Invalid rule for ${operationType}.${field}: \`authenticated\` ` +
				'and `public` are contradictory — a field either requires ' +
				'a signed-in caller or admits anonymous ones.',
		);
	}
	if (rule.public && rule.keto?.length) {
		throw new Error(
			`Invalid rule for ${operationType}.${field}: \`public\` and ` +
				'`keto` are contradictory — a Keto term asks what the ' +
				'caller may do to an object, and a public rule admits ' +
				'callers there is nothing to ask about.',
		);
	}
	const compiledExpression = compileExpression(
		rule.expression,
		compile,
		GRAPHQL_SCOPE,
	);
	return [
		field,
		{
			rule,
			...(compiledExpression ? { compiledExpression } : {}),
		} satisfies CompiledGraphqlEntry,
	];
}
