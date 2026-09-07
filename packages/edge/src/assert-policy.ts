import type { CompiledPolicy } from '@nxgt/security/policy';
import type { EdgeRoutes } from './routes.schema';

/**
 * The object id an edge rule is allowed to name, and the only one the router
 * supplies. See below for why there is exactly one.
 */
const EDGE_TERM_ID = 'param.app';

/**
 * What a rules document must be to run at an edge, checked once at startup.
 *
 * Everything here is refused at boot rather than at a request. An edge that
 * starts and then behaves wrongly is the worst of the two, because the wrong
 * behaviour is an authorization answer.
 */
export function assertEdgePolicy(
	policy: CompiledPolicy,
	routes: EdgeRoutes,
): void {
	assertClosedByDefault(policy);
	assertNoBodyReads(policy);
	assertOnlyNamesApps(policy);
	assertEveryAppIsNamed(policy, routes);
}

/**
 * `global.unmatched: deny` is required, not merely recommended.
 *
 * Inside one app, an unnamed path being open is defensible: the guard is
 * mounted on a prefix, the authentication floor still applies, and the route
 * itself decides. At an edge none of that is true — an unnamed path is a path
 * forwarded to an upstream with no decision made about it at all. Oathkeeper
 * refuses what no rule names, and a replacement that quietly did the opposite
 * would publish everything the document forgot to mention.
 */
function assertClosedByDefault(policy: CompiledPolicy): void {
	if (policy.global?.unmatched !== 'deny') {
		throw new Error(
			'Invalid edge rules document: `global.unmatched` must be `deny`. At an ' +
				'edge, a path no rule names is one forwarded upstream with no ' +
				'decision made about it — the default that is defensible inside an ' +
				'app, where a route still decides for itself, is indefensible here.',
		);
	}
}

/**
 * No rule may read the request body.
 *
 * `compilePolicy` already works out which routes would, for the guard's sake;
 * here it is a refusal. An edge that buffers every JSON body to decide is an
 * edge that holds every upload in memory, and the body says nothing an edge is
 * allowed to care about anyway — it decides on host, path, method and caller.
 */
function assertNoBodyReads(policy: CompiledPolicy): void {
	for (const routes of policy.restRoutesByMethod.values()) {
		for (const route of routes) {
			if (route.ketoReadsBody) {
				throw new Error(
					`Invalid edge rules document: the rule for ${route.pattern} has a ` +
						'Keto term reading `json.…`. An edge decides on host, path, ' +
						'method and caller; reading a body would mean buffering every ' +
						'request to answer a question the edge should not be asking.',
				);
			}
		}
	}
}

/**
 * A rule may ask about the APP and about nothing else.
 *
 * This is the boundary the parc has written down: the edge answers "who is
 * this caller" and "may they reach this app at all"; whether they may see a
 * particular object is the API's question, because only the API has the
 * context to answer it — and to answer 404 rather than 403 when the honest
 * answer would leak that the object exists.
 *
 * Enforced rather than documented, because "the edge must not decide about
 * objects" is exactly the rule that erodes the first time someone has a
 * plausible reason.
 */
function assertOnlyNamesApps(policy: CompiledPolicy): void {
	for (const routes of policy.restRoutesByMethod.values()) {
		for (const route of routes) {
			for (const check of route.rule.keto ?? []) {
				for (const group of check.permissions) {
					for (const term of group) {
						if (term.id === EDGE_TERM_ID) continue;
						throw new Error(
							`Invalid edge rules document: the rule for ${route.pattern} ` +
								`names \`${term.id}\`. An edge rule may only ask about the ` +
								`app it is routing to — \`id: ${EDGE_TERM_ID}\`, which the ` +
								'router supplies. Whether this caller may see a particular ' +
								"object is the API's question: it has the context to answer " +
								'it, and to answer 404 where 403 would leak that the object ' +
								'exists.',
						);
					}
				}
			}
		}
	}
}

/**
 * Every routable app must be named by at least one rule.
 *
 * Routing and policy are two documents on purpose — it is what removes
 * Oathkeeper's `/health` and `QUERY` traps — but two documents can disagree,
 * and under `unmatched: deny` the disagreement is silent and total: an app
 * that is routable and unnamed has every request to it refused, with a reason
 * that says only "no rule matched".
 */
function assertEveryAppIsNamed(
	policy: CompiledPolicy,
	routes: EdgeRoutes,
): void {
	const patterns = [...policy.restRoutesByMethod.values()].flat();

	for (const app of routes.apps) {
		const probe = app.match.path ?? (app.match.prefix as string);
		if (patterns.some((route) => route.matcher(probe) !== false)) continue;

		throw new Error(
			`Edge routing table names the app "${app.name}" at ${probe}, but no ` +
				'rule in the rules document matches that path. With ' +
				'`global.unmatched: deny` every request to it would be refused, and ' +
				'the reason would say only that no rule matched.',
		);
	}
}
