import { mongoose } from '../mongoose';

/**
 * Errors mongodb 7 raises while interrupting still-checked-out sockets during
 * `MongoClient.close()` — typically an in-flight replica-set heartbeat.
 * They are not a failed command; they escape `disconnect()` as an
 * `uncaughtException` / `unhandledRejection` that Bun otherwise prints.
 */
function isTeardownError(err: unknown): boolean {
	const name =
		typeof err === 'object' && err !== null && 'name' in err
			? String(err.name)
			: '';
	const message = err instanceof Error ? err.message : String(err);
	return (
		name === 'MongoClientClosedError' ||
		name === 'MongoPoolClosedError' ||
		message.includes('client was closed') ||
		message.includes('closed connection pool')
	);
}

function ignoreTeardownError(err: unknown): void {
	if (!isTeardownError(err)) {
		throw err;
	}
}

/**
 * Close the default mongoose connection without surfacing mongodb 7's
 * teardown noise. Used by the programmatic `migrate()` / `withMigrationRunner`
 * helpers, which must actually drop the connection (a CLI can just
 * `process.exit`).
 */
export async function disconnectQuietly(): Promise<void> {
	process.on('uncaughtException', ignoreTeardownError);
	process.on('unhandledRejection', ignoreTeardownError);
	try {
		await mongoose.disconnect().catch(ignoreTeardownError);
		// PoolClosedError can land on the next turn, after close() has resolved.
		await new Promise<void>((resolve) => setImmediate(resolve));
	} finally {
		process.off('uncaughtException', ignoreTeardownError);
		process.off('unhandledRejection', ignoreTeardownError);
	}
}
