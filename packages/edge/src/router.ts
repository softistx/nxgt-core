import type { EdgeApp, EdgeRoutes } from './routes.schema';

export interface RoutedRequest {
	app: EdgeApp;
	/** The path to send upstream — rewritten only if `stripPrefix` is set. */
	upstreamPath: string;
}

/**
 * The first app whose match accepts this request, in document order.
 *
 * `null` is not an error here. What happens to an unrouted request is the
 * rules document's business — under `global.unmatched: deny` it is refused,
 * which is the only defensible default at an edge — and `/health` is
 * deliberately routable to nothing.
 */
export function route(
	routes: EdgeRoutes,
	host: string,
	path: string,
): RoutedRequest | null {
	for (const app of routes.apps) {
		if (app.match.host && app.match.host !== host) continue;

		if (app.match.path) {
			if (app.match.path !== path) continue;
			return { app, upstreamPath: path };
		}

		const prefix = app.match.prefix as string;
		if (!underPrefix(path, prefix)) continue;

		return {
			app,
			upstreamPath: app.stripPrefix ? path.slice(prefix.length) || '/' : path,
		};
	}

	return null;
}

/**
 * Prefix matching on SEGMENT boundaries.
 *
 * A plain `startsWith` would route `/apiary` to the app mounted at `/api`,
 * which is a routing bug that presents as an authorization bug: the request
 * reaches an upstream that knows nothing about it, having been checked against
 * a rule written for a different app.
 */
function underPrefix(path: string, prefix: string): boolean {
	if (!path.startsWith(prefix)) return false;
	const next = path[prefix.length];
	return next === undefined || next === '/';
}
