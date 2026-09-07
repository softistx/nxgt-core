import type { PermissionTerm } from '../permissions.types';
import type { RestEvaluateInput } from './evaluator';

/**
 * Resolve the object ids one term names, off this request.
 *
 * `param.` reads the captures of the path pattern **written in the rules
 * file** — not the app's own route. A rules file that says `/bookmarks/:id`
 * gives `param.id`; one that says `/bookmarks/:bookmarkId` does not, however
 * the Hono route is spelled. That is the one place the two rails can drift
 * apart silently, so the pattern and the term have to be read together.
 *
 * A value that is a LIST requires the permit on every element. A path that
 * resolves nothing throws — a term that names no object is a wiring mistake,
 * and answering `false` would turn it into a denial that looks like a policy
 * decision. Same rule, same reason, as `objectsOf` in `keto-check.ts`.
 */
export function objectsOfTerm(
	term: PermissionTerm,
	req: RestEvaluateInput['req'],
): string[] {
	const [root, first = '', ...deeper] = term.id.split('.');

	let value: unknown;
	if (root === 'param') value = req?.params?.[first];
	else if (root === 'query') value = req?.query?.[first];
	else value = (req?.body as Record<string, unknown> | undefined)?.[first];

	for (const key of deeper) {
		value = (value as Record<string, unknown> | null | undefined)?.[key];
	}

	const ids = (Array.isArray(value) ? value : [value]).filter(
		(item): item is string => typeof item === 'string' && item.length > 0,
	);
	if (ids.length === 0) {
		throw new Error(
			`Policy: Keto term "${term.namespace}#${term.permit}" read "${term.id}", which resolved no object id`,
		);
	}
	return ids;
}
