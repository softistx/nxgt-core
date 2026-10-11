/**
 * The anonymity pass over text that will land in a public issue. It transforms
 * what is identifying but generic (absolute paths, emails, URLs, tokens),
 * refuses text that carries a credential assignment, then verifies against a
 * deny-list of names that must never appear (the application, its packages,
 * private repositories, the person, the machine; see `deny.ts`). Any hit
 * refuses the filing: the caller files nothing and says why. The deny-list is
 * an input; nothing here reaches out. Auto-filing on a public repository relies
 * on this refusing rather than leaking.
 */

import { type DenyList, EMPTY_DENY_LIST, findDenied } from './deny';
import { normalize } from './fold';
import { scrubHosts } from './hosts';
import { findSecrets, looksLikeSecret, scrubKnownTokens } from './secrets';

export {
	buildDenyList,
	type DenyInputs,
	type DenyList,
	findDenied,
} from './deny';
export { findSecrets } from './secrets';

const KEPT_HOSTS = new Set([
	'github.com',
	'www.github.com',
	'npmjs.com',
	'www.npmjs.com',
	'registry.npmjs.org',
]);

const SCHEME_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi;
/** Not `git@github.com:o/r` (kept scp form), whose host is no mailbox. */
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+(?![\w-]|:[\w~./-])/g;

const WIN_SEGMENT = '[^\\\\/\\s"\'`<>|:*?]+';
const WIN_USER = '[^\\\\/\\r\\n"\'`<>|:*?,;]+';
/** `C:\…`; the folder under `Users\` may hold spaces, inner folders may too; a last segment may not. */
const WINDOWS_PATH = new RegExp(
	`\\b[A-Za-z]:\\\\(?:Users\\\\${WIN_USER}\\\\?)?(?:${WIN_SEGMENT}(?: ${WIN_SEGMENT})*\\\\)*(?:${WIN_SEGMENT})?`,
	'g',
);

const SEG = String.raw`[\p{L}\p{N}_.@+~-]`;
const KNOWN_ROOT = '(?:Users|home|opt|srv|var|tmp|etc|root|mnt|Volumes)';
/**
 * `/a/b`, `~/a`, and a path after `:` or `=` when it starts at a known root.
 * Only a path that starts at a known root or `~`, lies under the cwd or ends in
 * a file extension is rewritten (`keepsPath`): `/api/v1/users/:id` is a route.
 */
const NOT_AFTER = String.raw`(?<![\p{L}\p{N}_.:/@~>-])`;
/** `/Users/Jane Doe/proj`: a home folder with spaces, whose rest is a path. */
const HOME_WITH_SPACES = new RegExp(
	String.raw`${NOT_AFTER}\/(?:Users|home)\/${SEG}+(?: ${SEG}+)+(?:\/${SEG}+)*\/?`,
	'gu',
);
/** `\\server\share\dir\file`. */
const UNC_PATH =
	/(?<![\\\w])\\\\[\w.$-]+\\[^\\\s"'`<>|:*?]+(?:\\[^\\\s"'`<>|:*?]+)*/g;
/** `user@host:path` (the scp form of a git remote). */
const SCP_URL =
	/(?<![\w.+@/-])[\w.-]+@([a-z0-9.-]+):(?!\d+\b)[\w~./-][^\s<>"'`)\]]*/gi;
const POSIX_PATH = new RegExp(
	String.raw`(?:(?<![\p{L}\p{N}_.:/@~>-])~?\/|(?<=[:=])\/(?=${KNOWN_ROOT}\/))(?:${SEG}+\/)+${SEG}*|(?<![\p{L}\p{N}_.:/@~>-])~\/${SEG}*`,
	'gu',
);

export interface ScrubOptions {
	/** The working directory: a path under it becomes `<app>/…`. */
	readonly cwd?: string | undefined;
	readonly denyList?: DenyList;
	/** Terms to take off the deny-list, such as the package being reported. */
	readonly allow?: readonly string[];
}

export interface ScrubResult {
	readonly text: string;
	/** What was transformed: `path`, `email`, `url`, `token`. */
	readonly changes: string[];
	/** Deny-list terms still present after the transforms; non-empty means refuse. */
	readonly denied: string[];
	/** Credential assignments (`password: x`, `Bearer x`), by keyword, that make it refuse. */
	readonly secrets: string[];
	readonly refused: boolean;
}

const FILE_EXTENSION = /\.[A-Za-z0-9]{1,8}(?::\d+){0,2}$/;

/** Whether a matched `/a/b` is a route or prose rather than a filesystem path. */
function keepsPath(path: string, cwd: string | undefined): boolean {
	const trimmed = path.replace(/[.,;)]+$/, '');
	if (trimmed.startsWith('~') || FILE_EXTENSION.test(trimmed)) return false;
	if (new RegExp(`^/${KNOWN_ROOT}/`).test(trimmed)) return false;
	const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '');
	return !(root && trimmed.startsWith(`${root}/`));
}

function scrubPath(path: string, cwd: string | undefined): string {
	const trimmed = path.replace(/[.,;)]+$/, '');
	const tail = path.slice(trimmed.length);
	const normal = trimmed.replace(/\\/g, '/');
	const nodeModules = normal.lastIndexOf('/node_modules/');
	if (nodeModules !== -1) {
		return `node_modules/${normal.slice(nodeModules + '/node_modules/'.length)}${tail}`;
	}
	const root = cwd?.replace(/\\/g, '/').replace(/\/+$/, '');
	if (root && (normal === root || normal.startsWith(`${root}/`))) {
		const rest = normal.slice(root.length + 1);
		return `<app>/${rest}${tail}`;
	}
	return `<app>/…${tail}`;
}

/** A `file://` URL as the path it names. */
function filePath(url: string): string {
	let path = url.replace(/^file:\/\//i, '');
	if (!path.startsWith('/')) path = path.replace(/^[^/]*/, '');
	path = path.replace(/^\/([A-Za-z]:)/, '$1');
	try {
		path = decodeURIComponent(path);
	} catch {
		// keep it percent-encoded
	}
	return path;
}

/** One URL: a file path, a kept host without its credentials, else `<url>`. */
function scrubUrl(
	url: string,
	cwd: string | undefined,
	note: (kind: string) => void,
): string {
	if (/^file:\/\//i.test(url)) {
		note('path');
		return scrubPath(filePath(url), cwd);
	}
	const trimmed = url.replace(/[.,;:!?]+$/, '');
	const tail = url.slice(trimmed.length);
	let host = '';
	try {
		host = new URL(trimmed).hostname.toLowerCase();
	} catch {
		// not parseable: treated as foreign
	}
	if (/^https?:\/\//i.test(trimmed) && KEPT_HOSTS.has(host)) {
		const bare = trimmed.replace(/^([a-z]+:\/\/)[^/?#]*@/i, '$1');
		if (bare !== trimmed) note('url');
		return `${bare}${tail}`;
	}
	note('url');
	return `<url>${tail}`;
}

/** Long random-looking runs become `<token>`; a kept URL's path is left intact. */
function scrubEntropy(text: string, note: (kind: string) => void): string {
	const replaceRuns = (part: string): string =>
		part.replace(/[A-Za-z0-9+/_=-]{33,}/g, (run) => {
			if (!looksLikeSecret(run)) return run;
			note('token');
			return '<token>';
		});
	return text.replace(
		/\bhttps?:\/\/[^\s<>"'`)\]]+|[A-Za-z0-9+/_=-]{33,}/gi,
		(match) => {
			if (!/^https?:/i.test(match)) return replaceRuns(match);
			const cut = match.search(/[?#]/);
			return cut === -1
				? match
				: match.slice(0, cut) + replaceRuns(match.slice(cut));
		},
	);
}

export function transform(
	text: string,
	cwd?: string,
	isDenied?: (label: string) => boolean,
): { text: string; changes: string[] } {
	const changes: string[] = [];
	const note = (kind: string) => changes.push(kind);
	const path = (found: string): string => {
		if (keepsPath(found, cwd)) return found;
		note('path');
		return scrubPath(found, cwd);
	};
	let out = scrubKnownTokens(text, note);
	out = out.replace(SCHEME_URL, (url) => scrubUrl(url, cwd, note));
	out = out.replace(SCP_URL, (url, host: string) => {
		if (KEPT_HOSTS.has(host.toLowerCase())) return url;
		note('url');
		return '<url>';
	});
	out = scrubEntropy(out, note);
	out = out.replace(EMAIL_PATTERN, () => {
		note('email');
		return '<email>';
	});
	out = scrubHosts(out, note, isDenied);
	for (const pattern of [WINDOWS_PATH, UNC_PATH, HOME_WITH_SPACES]) {
		out = out.replace(pattern, (found) => {
			note('path');
			return scrubPath(found, cwd);
		});
	}
	out = out.replace(POSIX_PATH, path);
	return { text: out, changes };
}

export function scrub(text: string, options: ScrubOptions = {}): ScrubResult {
	const denyList = options.denyList ?? EMPTY_DENY_LIST;
	const transformed = transform(
		text,
		options.cwd,
		(label) => findDenied(label, denyList, options.allow).length > 0,
	);
	const denied = findDenied(transformed.text, denyList, options.allow);
	// Also as a reader sees it: fullwidth colons, entities, percent-encoding.
	const secrets = [
		...new Set([
			...findSecrets(transformed.text),
			...findSecrets(normalize(transformed.text)),
		]),
	];
	return {
		text: transformed.text,
		changes: transformed.changes,
		denied,
		secrets,
		refused: denied.length > 0 || secrets.length > 0,
	};
}
