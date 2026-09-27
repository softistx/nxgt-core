/** Path containment, by segment: `/ab` is not inside `/a`. */

/** `true` when `path` is `parent` or lies under it. */
export function isInside(path: string, parent: string): boolean {
	if (path === parent) return true;
	const prefix = parent.endsWith('/') ? parent : `${parent}/`;
	return path.startsWith(prefix);
}
