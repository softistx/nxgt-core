import type { Connection } from 'mongoose';
import { mongoose } from '../mongoose';

/**
 * Empties every non-view, non-system collection on `connection`.
 *
 * Test-suite helper, deliberately living here rather than in each app: it used
 * to exist as five identical unguarded copies here and five more in
 * `sellix-monorepo`, and one shell export was enough to point a whole suite at a
 * real database and empty it — which is how `sellix` was lost once. Bun gives
 * the process environment precedence over `--env-file`, so `MONGODB_URI` set in
 * a shell silently beats `.env.test` — and the centralized env layout makes a
 * forgotten `--env-file=.env.test` resolve to the production URI just as
 * quietly.
 *
 * Hence the guard, and hence both halves of it: `NODE_ENV` and the database
 * name are each individually defeatable by exactly the kind of stray export
 * that caused the incident, so both must hold. An unconnected connection
 * reports an empty name and is refused, so this fails closed.
 *
 * `Bun.env` rather than an app's parsed env: this package has no schema of its
 * own to load, and reading the raw value is the point — the guard must see what
 * the process actually got, not what a `.default()` filled in.
 */
export async function clearDatabase(
	connection: Connection = mongoose.connection,
): Promise<void> {
	const database = connection.name;

	if (Bun.env.NODE_ENV !== 'test' || !database.endsWith('-test')) {
		throw new Error(
			`clearDatabase refused to run: NODE_ENV="${Bun.env.NODE_ENV}", database="${database}". ` +
				'It only runs with NODE_ENV=test against a database whose name ends in "-test". ' +
				'A test run reaching a non-test database usually means MONGODB_URI is set in the ' +
				'shell, or the test env file was not passed.',
		);
	}

	const collections = await connection.listCollections();

	await Promise.all(
		collections
			.filter(
				(collection) =>
					collection.type !== 'view' && !collection.name.includes('system'),
			)
			.map((collection) =>
				connection.collection(collection.name).deleteMany({}),
			),
	);
}
