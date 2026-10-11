/**
 * The terms `buildDenyList` derives from a name beyond the name itself: the
 * product stem (`schoolz` from `schoolz-api`), the scope of a package, and the
 * registrable domain of an application domain with its main label.
 */

export const MIN_LABEL_LENGTH = 4;

/** Words too common to deny on their own as a segment of a repository name. */
const GENERIC = new Set(
	(
		'api core web ui server client app apps service services backend frontend ' +
		'admin shared common utils lib libs sdk docs monorepo mobile worker gateway ' +
		'secret federation token session auth security nxgt alxia'
	).split(' '),
);

/** Hyphen segments of 4+ characters of a name, except generic words (never the scope). */
export function stems(name: string | undefined): string[] {
	const bare = (name ?? '').trim().replace(/^@[^/]*\//, '');
	return bare
		.split(/[-_.\s]+/)
		.filter(
			(part) =>
				part.length >= MIN_LABEL_LENGTH && !GENERIC.has(part.toLowerCase()),
		);
}

/** `@scope/name`: the scope with and without `@`, the name (4+), its stems. */
export function scopedParts(pkg: string): string[] {
	const match = /^(@[^/\s]+)\/([^/\s]+)$/.exec(pkg.trim());
	if (!match?.[1] || !match[2]) return stems(pkg);
	const scope = match[1].slice(1);
	return [
		match[1],
		...(scope.length >= MIN_LABEL_LENGTH ? [scope] : []),
		...(match[2].length >= MIN_LABEL_LENGTH ? [match[2]] : []),
		...stems(match[2]),
	];
}

const SECOND_LEVEL = new Set(['co', 'com', 'org', 'net', 'ac', 'gov', 'edu']);

/** The registrable domain: two labels, three under `co.uk`-style suffixes. */
export function registrableDomain(domain: string): string {
	const labels = domain.trim().toLowerCase().split('.').filter(Boolean);
	const [tld, second] = [labels.at(-1) ?? '', labels.at(-2) ?? ''];
	const take = SECOND_LEVEL.has(second) && tld.length === 2 ? 3 : 2;
	return labels.slice(-take).join('.');
}

/** The domain, its registrable domain and that domain's main label (4+). */
export function domainTerms(domain: string): string[] {
	const registrable = registrableDomain(domain);
	if (!registrable.includes('.')) return [domain];
	const main = registrable.split('.')[0] ?? '';
	return [
		domain,
		registrable,
		...(main.length >= MIN_LABEL_LENGTH ? [main] : []),
	];
}

/** The bare scope of `@scope/name` (no generic filter: the scope is the app's own). */
export function scopeOf(pkg: string): string | undefined {
	return /^@([^/\s]+)\//.exec(pkg.trim())?.[1];
}

/** The main label of a domain's registrable part. */
export function mainLabel(domain: string): string {
	return registrableDomain(domain).split('.')[0] ?? '';
}
