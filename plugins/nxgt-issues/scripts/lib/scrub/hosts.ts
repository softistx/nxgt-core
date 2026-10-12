/**
 * Network locations that identify an environment: `host:port` with a dotted
 * name or an IP, bare IPv4 and IPv6 literals, and the name a resolver error
 * reports (`ENOTFOUND db.prod.lan`). They become `<host>`. A dotted name on its
 * own (`process.env`, `Promise.all`) is code, not a host, and is left alone;
 * so is a name that ends like a file (`index.ts:12`).
 *
 * A single label with a port (`vexora-redis:6379`, `mongo1:27017`) is a host
 * when the label starts with a letter and has a hyphen or a digit, or is on
 * the deny list; `localhost:3000`, `12:30` and `UTC-12:30` stay.
 *
 * A dotted name without a port is a host when its last label is a common TLD
 * (`myeduapp.com`, `admin.myeduapp.fr`): see `domains.ts`.
 */

import { scrubBareDomains } from './domains';

const FILE_EXTENSIONS = new Set(
	(
		'ts tsx js jsx mjs cjs mts cts json md mdx yml yaml toml lock txt sh py go ' +
		'rs java kt c h cpp hpp rb php swift css scss html vue svelte log map env cs graphql graphqls gql sql prisma proto xml ini'
	).split(' '),
);

const HOST_PORT =
	/(?<![\w.@/-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+([a-z][a-z0-9-]*):\d{2,5}\b(?!:\d)/gi;
const LABEL_PORT = /(?<![\w.@/:-])[a-z][a-z0-9-]*(?::\d{2,5})\b(?!:\d)/gi;
const IPV4 = /(?<![\w.])(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?![\w.]*\w)/g;
const IPV6 =
	/(?<![\w:.])\[?(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\]?(?::\d{2,5})?(?![\w:])/gi;
const RESOLVER =
	/\b((?:getaddrinfo[ \t]+)?(?:ENOTFOUND|EAI_AGAIN)|getaddrinfo)[ \t]+(?!ENOTFOUND\b|EAI_AGAIN\b)([^\s,;()'"<>]+)/g;

const validIpv4 = (text: string): boolean =>
	text
		.replace(/:\d+$/, '')
		.split('.')
		.every((octet) => Number(octet) <= 255);

const validIpv6 = (text: string): boolean => {
	const bare = text.replace(/^\[|\](?::\d+)?$/g, '');
	if (bare.includes('::')) return /[0-9a-f:]/i.test(bare) && bare.length > 2;
	return bare.split(':').length === 8;
};

export function scrubHosts(
	text: string,
	note: (kind: string) => void,
	isDenied: (label: string) => boolean = () => false,
): string {
	const swap = (): string => {
		note('host');
		return '<host>';
	};
	const hosted = text
		.replace(HOST_PORT, (match, tld: string) =>
			FILE_EXTENSIONS.has(tld.toLowerCase()) ? match : swap(),
		)
		.replace(LABEL_PORT, (match) => {
			const label = match.slice(0, match.lastIndexOf(':'));
			const hostLike = /[-\d]/.test(label) && !/^(?:utc|gmt)-/i.test(label);
			return hostLike || isDenied(label) ? swap() : match;
		})
		.replace(IPV4, (match) => (validIpv4(match) ? swap() : match))
		.replace(IPV6, (match) => (validIpv6(match) ? swap() : match));
	return scrubBareDomains(hosted, swap).replace(
		RESOLVER,
		(match, lead: string, host: string) => {
			const name = host.replace(/[.:]+$/, '');
			if (name.startsWith('<')) return match;
			note('host');
			return `${lead} <host>${host.slice(name.length)}`;
		},
	);
}
