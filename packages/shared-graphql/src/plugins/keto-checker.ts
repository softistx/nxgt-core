import { type Ory, type Permission, type Subject, tuple } from '@nxgt/ory-sdk';
import DataLoader from 'dataloader';

/**
 * The per-request answer cache, and the reason `@check` / `@permission` cost
 * nothing on top of the access layer that already asks Keto.
 *
 * `DataLoader` here does two things: it **batches** distinct questions into
 * one `POST /relation-tuples/batch/check`, and it **memoises** identical ones
 * for the life of the request. So a field guarded by `@permission(view)` and a
 * service that then calls `require<M>Access` — which asks the same question —
 * pay for one round trip between them.
 *
 * A failed batch is not memoised: `DataLoader` clears the keys of a batch that
 * rejected, so an outage answers `OryUnavailable` to every question it touched
 * and the next ask goes back to Keto.
 *
 * The key is Keto's own notation, `Note:n1#view@idn-7`, so a cache hit is
 * legible in a log line.
 */
export type KetoChecker = (
	permission: Permission,
	subject: Subject,
) => Promise<boolean>;

export type KetoChecksContext = {
	ketoChecks?: KetoChecker;
};

export function createKetoChecks(ory: Ory): KetoChecker {
	const loader = new DataLoader<
		{ permission: Permission; subject: Subject },
		boolean,
		string
	>((questions) => ory.checkMany([...questions]), {
		cacheKeyFn: ({ permission, subject }) => tuple(permission, subject),
	});

	return (permission, subject) => loader.load({ permission, subject });
}
