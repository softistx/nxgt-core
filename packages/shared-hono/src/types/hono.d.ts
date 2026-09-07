import type { Principal } from '@nxgt/shared/models';
import type { OryPrincipal, Permission, Subject } from 'stx-sdk/ory';

declare module 'hono' {
	interface ContextVariableMap {
		principal?: Principal | null;
		/** The Bearer token the caller sent, when that is how they signed in. */
		accessToken?: string | null;
		/**
		 * Set by `oryAuth()`: the Ory principal, `null` for an anonymous
		 * caller. `ory.subject` is the string Keto receives.
		 */
		ory?: OryPrincipal | null;
		/**
		 * Set by `useOry()`: the per-request Keto answer cache every
		 * `ketoCheck()` and the app's own access layer share, so asking the
		 * same question twice costs one round trip.
		 */
		ketoChecks?: (permission: Permission, subject: Subject) => Promise<boolean>;
		'X-User-Id'?: string | null;
		'X-User-Name'?: string | null;
		'X-User-Email'?: string | null;
		'X-User-Firstname'?: string | null;
		'X-User-Lastname'?: string | null;
		'X-User-Birthdate'?: string | null;
		'X-User-Authorities'?: string[] | null;
		'X-Roles'?: string[] | null;
		'X-Realm'?: string | null;
		'X-Scopes'?: string[] | null;
		'X-Client-Id'?: string | null;
		'X-Claims'?: Record<string, any> | null;
	}
}
