/**
 * The anonymity pass over text that will land in a public issue. It transforms
 * what is identifying but generic (absolute paths, emails, foreign URLs,
 * tokens), then verifies against a deny-list of names that must never appear
 * (the application, its packages, private repositories, the person, the
 * machine). Any hit after the transforms refuses the filing: the caller files
 * nothing and says why. The deny-list is an input; nothing here reaches out.
 */

export interface DenyInputs {
	/** The application's repository, `owner/repo`. */
	readonly appRepo?: string | undefined;
	/** The application's package and workspace names. */
	readonly appPackages?: readonly string[];
	/** The working directory; its basename is denied. */
	readonly cwd?: string | undefined;
	/** `owner/repo` or bare names of every private repository of the owners. */
	readonly privateRepos?: readonly string[];
	readonly gitName?: string | undefined;
	readonly gitEmail?: string | undefined;
	readonly hostname?: string | undefined;
	readonly home?: string | undefined;
}

const unique = (terms: readonly (string | undefined)[]): string[] => [
	...new Set(
		terms.map((term) => term?.trim()).filter((term): term is string => !!term),
	),
];

const basename = (path: string): string =>
	path
		.replace(/[\\/]+$/, '')
		.split(/[\\/]/)
		.pop() ?? '';

/** The terms that may never appear in a filing, from what the session knows. */
export function buildDenyList(inputs: DenyInputs): string[] {
	const repoName = inputs.appRepo?.split('/')[1];
	const privates = (inputs.privateRepos ?? []).flatMap((entry) =>
		entry.includes('/') ? [entry, entry.split('/')[1]] : [entry],
	);
	return unique([
		inputs.appRepo,
		repoName,
		...(inputs.appPackages ?? []),
		inputs.cwd ? basename(inputs.cwd) : undefined,
		...privates,
		inputs.gitName,
		inputs.gitEmail,
		inputs.hostname,
		inputs.home,
	]);
}

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

/** A run over 32 characters that mixes letters and digits and looks random. */
const looksLikeSecret = (run: string): boolean =>
	run.length > 32 &&
	/[A-Za-z]/.test(run) &&
	/\d/.test(run) &&
	entropy(run) >= 3.5;

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`)\]]+/gi;
const EMAIL_PATTERN = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const WINDOWS_PATH = /\b[A-Za-z]:\\(?:[^\\\s"'`<>|:]+\\?)+/g;
const POSIX_PATH = /(?<![\w.:/@~-])\/(?:[\w.@+~-]+\/)+[\w.@+~-]*/g;

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
	out = out.replace(URL_PATTERN, (url) => {
		const trimmed = url.replace(/[.,;:!?]+$/, '');
		const tail = url.slice(trimmed.length);
		let host = '';
		try {
			host = new URL(trimmed).hostname.toLowerCase();
		} catch {
			// not parseable: treated as foreign
		}
		if (KEPT_HOSTS.has(host)) return url;
		note('url');
		return `<url>${tail}`;
	});
	out = out.replace(EMAIL_PATTERN, () => {
		note('email');
		return '<email>';
	});
	out = out.replace(WINDOWS_PATH, (path) => {
		note('path');
		return scrubPath(path, cwd);
	});
	out = out.replace(POSIX_PATH, (path) => {
		note('path');
		return scrubPath(path, cwd);
	});
	return { text: out, changes };
}

const escapeRegExp = (term: string): string =>
	term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Deny-list terms present as whole words, case-insensitively. */
export function findDenied(
	text: string,
	denyList: readonly string[],
	allow: readonly string[] = [],
): string[] {
	const allowed = new Set(allow.map((term) => term.toLowerCase()));
	const hits: string[] = [];
	for (const term of unique(denyList)) {
		if (allowed.has(term.toLowerCase())) continue;
		const pattern = new RegExp(
			`(?<![A-Za-z0-9_])${escapeRegExp(term)}(?![A-Za-z0-9_])`,
			'i',
		);
		if (pattern.test(text)) hits.push(term);
	}
	return hits;
}

export function scrub(text: string, options: ScrubOptions = {}): ScrubResult {
	const transformed = transform(text, options.cwd);
	const denied = findDenied(
		transformed.text,
		options.denyList ?? [],
		options.allow,
	);
	return {
		text: transformed.text,
		changes: transformed.changes,
		denied,
		refused: denied.length > 0,
	};
}
