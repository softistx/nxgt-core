export const SCOPE_PREFIX = 'SCOPE_';

/** Build the authority string for a scope name: "SCOPE_<name>" */
export function scopeAuthority(name: string): string {
	return `${SCOPE_PREFIX}${name}`;
}

/**
 * Build an array of authority strings for a space-separated list of scope names: "scope1 scope2" => ["SCOPE_scope1", "SCOPE_scope2"]
 * Ignores empty scope names (e.g. extra spaces).
 */
export function scopeAuthorities(scope: string): string[] {
	return scope
		.split(' ')
		.filter((s) => s.trim() !== '')
		.map(scopeAuthority);
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
