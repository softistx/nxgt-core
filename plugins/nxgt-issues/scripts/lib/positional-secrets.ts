/**
 * Commands that take a secret as an argument, positionally or after `-p`,
 * `--password` or `--plaintext`: `sshpass -p hunter2 ssh host`, `docker login
 * -u me -p hunter2`, `htpasswd -nbB admin swordfish`, `mkpasswd swordfish`,
 * `openssl passwd -6 swordfish`, `caddy hash-password --plaintext swordfish`.
 * The value refuses unless it is a placeholder (a variable, a path, `<x>`).
 * `isSecretCommand` is the list shell-values.ts never calls read-only.
 */

import { isPlaceholder } from './code-values';

/** A command word (and subcommand) whose arguments may carry a secret. */
const SECRET_COMMAND =
	/^(?:mysql\w*|mariadb\w*|redis-cli|sshpass|mongosh?|ldap\w+|smbclient|htpasswd|mkpasswd|(?:docker|podman)\s+login|openssl\s+passwd|caddy\s+hash-password)\b/;
const INVOCATION =
	/\b(htpasswd|mkpasswd|sshpass|mongosh?|ldapsearch|ldapmodify|ldapadd|ldapdelete|ldappasswd|smbclient|openssl\s+passwd|caddy\s+hash-password|docker\s+login|podman\s+login)\b([^\n|;&)`]*)/g;
/** Flags that take the secret as the next word, or attached with `=`. */
const MONGO = /^(?:-p|--password)(?![\w-])/;
const LDAP = /^(?:-w|--password)(?![\w-])/;
const SECRET_FLAGS: Readonly<Record<string, RegExp>> = {
	sshpass: /^-p/,
	mongo: MONGO,
	mongosh: MONGO,
	ldapsearch: LDAP,
	ldapmodify: LDAP,
	ldapadd: LDAP,
	ldapdelete: LDAP,
	ldappasswd: LDAP,
	login: /^(?:-p|--password)(?![\w-])/,
	'hash-password': /^(?:-p|--plaintext)(?![\w-])/,
};
/** Flags that take a non-secret value of their own, for the positional commands. */
const VALUED = new Set([
	'-m',
	'-S',
	'-R',
	'-s',
	'-salt',
	'-in',
	'-out',
	'-rand',
]);

/** `--requirepass x`, `--requirepass=x`, `requirepass x` (redis.conf), `"--requirepass", "x"`. */
const REQUIREPASS =
	/(?<![\w-])(?:--)?(?:requirepass|masterauth)(?:["']?[ \t]*,[ \t]*["']?|=|[ \t]+)["']?(?!-)([^\s"',]+)/g;

/** Whether `text` starts with a command that takes secrets as arguments. */
export const isSecretCommand = (text: string): boolean =>
	SECRET_COMMAND.test(text.trimStart());

const isSafeValue = (value: string): boolean =>
	value === '' ||
	isPlaceholder(value) ||
	/^[\w.~<>…-]*\/[\w.~/<>…-]*$/.test(value);

/** The value a secret flag carries: attached (`-phunter2`, `--password=x`) or the next word. */
function flagValue(word: string, next: string | undefined, flag: RegExp) {
	const match = flag.exec(word);
	if (!match) return undefined;
	const rest = word.slice(match[0].length).replace(/^=/, '');
	return rest === '' ? (next ?? '') : rest;
}

/** `smbclient -U user%pass`: the part after `%` is the password. */
function refusesSmb(args: string[]): boolean {
	return args.some((word, i) => {
		const value = flagValue(word, args[i + 1], /^(?:-U|--user=?)/);
		const password = value?.split('%')[1];
		return password !== undefined && !isSafeValue(password);
	});
}

function refusesInvocation(command: string, args: string[]): boolean {
	const key = command.split(/\s+/).pop() ?? command;
	if (key === 'smbclient') return refusesSmb(args);
	const flag = SECRET_FLAGS[key];
	if (flag) {
		return args.some((word, i) => {
			const value = flagValue(word, args[i + 1], flag);
			return value !== undefined && !isSafeValue(value);
		});
	}
	const batch =
		key === 'htpasswd' && !args.some((word) => /^-[A-Za-z]*b/.test(word));
	if (batch) return false;
	const positional: string[] = [];
	for (let i = 0; i < args.length; i++) {
		const word = args[i] ?? '';
		if (VALUED.has(word)) i++;
		else if (!word.startsWith('-')) positional.push(word);
	}
	const last = positional.at(-1);
	return last !== undefined && !isSafeValue(last);
}

/** True when `text` runs a command with a literal secret as its password argument. */
export function hasPositionalSecret(text: string): boolean {
	for (const match of text.matchAll(REQUIREPASS)) {
		if (!isSafeValue(match[1] ?? '')) return true;
	}
	for (const match of text.matchAll(INVOCATION)) {
		const args = (match[2] ?? '').trim().split(/\s+/).filter(Boolean);
		if (refusesInvocation(match[1] ?? '', args)) return true;
	}
	return false;
}
