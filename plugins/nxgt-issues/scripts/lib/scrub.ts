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

import { findDenied } from './deny';

export { buildDenyList, type DenyInputs, findDenied } from './deny';

const KEPT_HOSTS = new Set([
	'github.com',
	'www.github.com',
	'npmjs.com',
	'www.npmjs.com',
	'registry.npmjs.org',
]);

const TOKEN_PATTERNS: readonly RegExp[] = [
	/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g,
	/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
	/\bnpm_[A-Za-z0-9]{20,}\b/g,
	/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
];

function entropy(text: string): number {
	const counts = new Map<string, number>();
	for (const char of text) counts.set(char, (counts.get(char) ?? 0) + 1);
	let bits = 0;
	for (const count of counts.values()) {
		const p = count / text.length;
		bits -= p * Math.log2(p);
	}
	return bits;
}

/** A 40-hex git SHA, alone between non-alphanumerics: useful upstream, not private. */
const GIT_SHA = /(?<![0-9A-Za-z])[0-9a-f]{40}(?![0-9A-Za-z])/g;

/**
 * A run over 32 characters that mixes letters and digits and looks random.
 * Full SHAs are taken out first; short SHAs (7 to 12 hex) never reach the
 * length threshold.
 */
const looksLikeSecret = (run: string): boolean => {
	const rest = run.replace(GIT_SHA, '');
	return (
		rest.length > 32 &&
		/[A-Za-z]/.test(rest) &&
		/\d/.test(rest) &&
		entropy(rest) >= 3.5
	);
};

const SCHEME_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`)\]]+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;

const WIN_SEGMENT = '[^\\\\/\\s"\'`<>|:*?]+';
const WIN_USER = '[^\\\\/\\r\\n"\'`<>|:*?,;]+';
/** `C:\…`; the folder under `Users\` may hold spaces, inner folders may too; a last segment may not. */
const WINDOWS_PATH = new RegExp(
	`\\b[A-Za-z]:\\\\(?:Users\\\\${WIN_USER}\\\\?)?(?:${WIN_SEGMENT}(?: ${WIN_SEGMENT})*\\\\)*(?:${WIN_SEGMENT})?`,
	'g',
);

const SEG = String.raw`[\p{L}\p{N}_.@+~-]`;
const KNOWN_ROOT = '(?:Users|home|opt|srv|var|tmp|etc|root|mnt|Volumes)';
/** `/a/b`, `~/a`, and a path after `:` or `=` when it starts at a known root. */
const POSIX_PATH = new RegExp(
	String.raw`(?:(?<![\p{L}\p{N}_.:/@~>-])~?\/|(?<=[:=])\/(?=${KNOWN_ROOT}\/))(?:${SEG}+\/)+${SEG}*|(?<![\p{L}\p{N}_.:/@~>-])~\/${SEG}*`,
	'gu',
);

const SECRET_ASSIGNMENT =
	/(?<![A-Za-z0-9])(password|passwd|pwd|secret|token|bearer|api[_-]?key)["']?\s*[:=]\s*(\S+)/gi;
const BEARER = /\b(Bearer)\s+(\S+)/gi;
/** Placeholders the transforms write; nothing identifying is behind them. */
const PLACEHOLDER = /^<(?:token|url|email)>[.,;:)\]"']*$/;

export interface ScrubOptions {
	/** The working directory: a path under it becomes `<app>/…`. */
	readonly cwd?: string | undefined;
	readonly denyList?: readonly string[];
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

export function transform(
	text: string,
	cwd?: string,
): { text: string; changes: string[] } {
	const changes: string[] = [];
	const note = (kind: string) => changes.push(kind);
	let out = text;

	for (const pattern of TOKEN_PATTERNS) {
		out = out.replace(pattern, () => {
			note('token');
			return '<token>';
		});
	}
	out = out.replace(/[A-Za-z0-9+/_=-]{33,}/g, (run) => {
		if (!looksLikeSecret(run)) return run;
		note('token');
		return '<token>';
	});
	out = out.replace(SCHEME_URL, (url) => scrubUrl(url, cwd, note));
	out = out.replace(EMAIL_PATTERN, () => {
		note('email');
		return '<email>';
	});
	for (const pattern of [WINDOWS_PATH, POSIX_PATH]) {
		out = out.replace(pattern, (path) => {
			note('path');
			return scrubPath(path, cwd);
		});
	}
	return { text: out, changes };
}

/**
 * The credential assignments in already-transformed text, each a reason to
 * refuse. Only the keyword is reported (`password`, `Bearer`), never the value.
 */
export function findSecrets(text: string): string[] {
	const found: string[] = [];
	for (const pattern of [SECRET_ASSIGNMENT, BEARER]) {
		for (const match of text.matchAll(pattern)) {
			if (!PLACEHOLDER.test(match[2] ?? '')) found.push(match[1] ?? '');
		}
	}
	return [...new Set(found.map((word) => word.toLowerCase()))];
}

export function scrub(text: string, options: ScrubOptions = {}): ScrubResult {
	const transformed = transform(text, options.cwd);
	const denied = findDenied(
		transformed.text,
		options.denyList ?? [],
		options.allow,
	);
	const secrets = findSecrets(transformed.text);
	return {
		text: transformed.text,
		changes: transformed.changes,
		denied,
		secrets,
		refused: denied.length > 0 || secrets.length > 0,
	};
}
