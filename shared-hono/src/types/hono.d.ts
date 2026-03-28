import type { Principal } from '@nxgt/shared/models';

declare module 'hono' {
	interface ContextVariableMap {
		principal?: Principal | null;
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
