/** Path containment, by segment: `/ab` is not inside `/a`. */

/** `true` when `path` is `parent` or lies under it. */
export function isInside(path: string, parent: string): boolean {
	if (path === parent) return true;
	const prefix = parent.endsWith('/') ? parent : `${parent}/`;
	return path.startsWith(prefix);
}

/** `true` when `dir` is the home folder or one of its ancestors (`/` included). */
export function isHomeOrAbove(dir: string, home: string): boolean {
	const trim = (p: string) => (p.length > 1 ? p.replace(/\/+$/, '') : p) || '/';
	return isInside(trim(home), trim(dir));
}
