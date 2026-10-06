/**
 * Whether `MONGODB_URI` names a server, for the suites that need one.
 *
 * CI starts a replica set and sets the URI. Locally `.env.test` expands its
 * Mongo variables from the environment, and with them unset it yields
 * `mongodb://:@/shared-mongo-test…` — a URI with no host — so those suites are
 * skipped rather than failing for an absent database.
 *
 * Test-only: `tsconfig.build.json` excludes `src/test`, so nothing here is
 * emitted into `dist/`.
 */
export function hasMongoHost(
	uri: string | undefined = Bun.env['MONGODB_URI'],
): boolean {
	if (!uri) return false;
	try {
		return new URL(uri).host !== '';
	} catch {
		return false;
	}
}
