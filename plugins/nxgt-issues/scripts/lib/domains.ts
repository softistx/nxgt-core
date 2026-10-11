/**
 * Bare domain names: a dotted name whose last label is a common TLD becomes
 * `<host>` (`myeduapp.com`, `admin.myeduapp.fr`, `école.fr`), and so does a
 * private name under `.internal`, `.lan` or `.local` (`billing.acme.internal`),
 * with a path,
 * query or fragment after it kept (`<host>/graphql`), and a leading `.`, `*.`
 * or `@` swallowed (`'.myeduapp.com'`, `*.myeduapp.com`, `@myeduapp.com`).
 *
 * Kept: the public references a report may cite (`github.com` and its
 * subdomains, `npmjs.com`, `nodejs.org`, `developer.mozilla.org`, the main
 * docs and framework hosts, the RFC 2606 `example.*` names), `ASP.NET`-style
 * names, common script names (`deploy.sh`), and code: names whose last label
 * is not a TLD (`index.ts`, `process.env`, `Promise.all`), a two-label name
 * led by a receiver word (`this.app`, `ctx.page`, `socket.io`), a browser
 * API path (`chrome.storage.local`), a name followed by a call, an index or a
 * member access, and anything inside a path
 * (`node_modules/acme.io/`).
 */

const TLDS = (
	'com net org io dev app fr ca co uk de eu us me ai cloud tech xyz info biz ' +
	'edu gov ch nl es pt pl se dk fi au nz jp cn br mx ru tv cc gg ly ' +
	'ma be tn sn ci lu dz cm ht it sh school academy online store site page ' +
	'education africa ng ke za in sa ae qa studio agency digital space live so to ' +
	// Private suffixes: an internal host, with or without a port.
	'internal lan local'
).split(' ');

const LABEL = String.raw`[\p{L}\p{N}](?:[\p{L}\p{N}-]*[\p{L}\p{N}])?`;
const BARE_DOMAIN = new RegExp(
	String.raw`(?<![\p{L}\p{N}_.@/:$*-])(?:\*\.|\.|@)?((?:${LABEL}\.)+(?:${TLDS.join('|')}))(?![\p{L}\p{N}_$([-]|\.[\p{L}\p{N}_$])`,
	'giu',
);

const KEPT_DOMAINS = new Set(
	(
		'github.com npmjs.com www.npmjs.com npmjs.org registry.npmjs.org ' +
		'nodejs.org bun.sh mozilla.org developer.mozilla.org nuxt.com vitejs.dev ' +
		'hono.dev typescriptlang.org www.typescriptlang.org stackoverflow.com ' +
		'mongodb.com www.mongodb.com graphql.org jsr.io schema.org vuejs.org ' +
		'react.dev'
	).split(' '),
);

/** Identifiers that start a member expression in code, not a host name. */
const RECEIVERS = new Set(
	(
		'this self ctx c req res app server router config options opts props ' +
		'state window document module exports process global user socket event ' +
		'e err error data result response request client session page store vm ' +
		'wrapper component'
	).split(' '),
);

/** Roots of browser APIs, kept at any depth: `chrome.storage.local`. */
const API_ROOTS = new Set(['chrome', 'browser', 'window', 'globalThis']);

const SCRIPTS = new Set(
	(
		'install deploy build setup run start test entrypoint docker-entrypoint ' +
		'bootstrap init release publish ci dev'
	).split(' '),
);

/** Whether a matched name stays as written. */
export function keptDomain(name: string): boolean {
	const lower = name.toLowerCase();
	if (KEPT_DOMAINS.has(lower)) return true;
	if (/(?:^|\.)github\.com$/.test(lower)) return true;
	if (/(?:^|\.)example\.(?:com|net|org)$/.test(lower)) return true;
	if (/^[A-Z]+\.NET$/.test(name)) return true;
	const labels = lower.split('.');
	if (API_ROOTS.has(name.split('.')[0] ?? '')) return true;
	if (labels.length !== 2) return false;
	const [first = '', tld = ''] = labels;
	return RECEIVERS.has(first) || (tld === 'sh' && SCRIPTS.has(first));
}

export function scrubBareDomains(text: string, swap: () => string): string {
	return text.replace(BARE_DOMAIN, (match, name: string) =>
		keptDomain(name) ? match : swap(),
	);
}
