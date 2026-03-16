export const SCOPE_PREFIX = 'SCOPE_';

/** Build the authority string for a scope name: "SCOPE_<name>" */
export function scopeAuthority(name: string): string {
	return `${SCOPE_PREFIX}${name}`;
}

/** Extract the scope name from a SCOPE_ authority string. Returns null if not a scope authority. */
export function parseScopeAuthority(authority: string): string | null {
	return authority.startsWith(SCOPE_PREFIX)
		? authority.slice(SCOPE_PREFIX.length)
		: null;
}

/** Check whether an authority string is a scope authority */
export function isScopeAuthority(authority: string): boolean {
	return authority.startsWith(SCOPE_PREFIX);
}
