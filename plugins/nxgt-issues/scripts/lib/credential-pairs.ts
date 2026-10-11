/**
 * Credentials written as a pair rather than a call or an assignment: a header
 * set by index (`headers['authorization'] = 'Basic x'`), a header tuple
 * (`new Headers([['authorization', 'Basic x']])`), a computed key whose name
 * holds a credential word (`{ [GATEWAY_SECRET_HEADER]: 'x' }`) and a flag followed by its
 * value in an argument array (`['--password', 'hunter2']`, `['-W', 'x']`,
 * `['-p', 'x']`, `['-a', 'x']`, and `'-px'` after a database client). A port
 * after `-p` passes (`['-p', '8080:80']` for docker or ssh) unless a database
 * client (`mysql`, `mariadb`, `psql`, `redis-cli`) comes earlier on the line.
 * A header value obeys the header rule (only a placeholder or a template of
 * code passes); a flag value refuses unless it is a placeholder.
 */

import { CREDENTIAL_HEADER, namesCredential } from './auth-calls';
import { isPlaceholder } from './code-values';
import { isHarmlessLiteral } from './literals';

/** `x['authorization'] = 'value'`. */
const INDEXED = /\[\s*["']([\w-]+)["']\s*\]\s*=\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
/** `{ [GATEWAY_SECRET_HEADER]: 'value' }` or `x[SECRET_HEADER] = 'value'`. */
const COMPUTED =
	/\[\s*([A-Za-z_$][\w$.]*)\s*\]\s*[:=](?!=)\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
/** `['authorization', 'value']`. */
const TUPLE = /\[\s*["']([\w-]+)["']\s*,\s*(["'`])((?:\\.|(?!\2).)*)\2\s*\]/g;
/** `'--password', 'value'` side by side in an array. */
const ARRAY_FLAG =
	/["'](--(?:password|passwd|pwd|token|secret|api-?key|pass)|-[Wpa])["']\s*,\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
/** A port or a port mapping: `-p 8080:80` for docker and ssh. */
const PORT = /^\d+(?::\d+)*$/;
const DB_CLIENT = /\b(?:mysql|mysqldump|mariadb|psql|redis-cli)\b/;
/** `'-phunter2'`: mysql's password, attached to the flag. */
const ATTACHED_P = /["']-p([^"'\s]+)["']/g;

/** The text of the line before `index`. */
const lineBefore = (text: string, index: number): string =>
	text.slice(text.lastIndexOf('\n', index) + 1, index);

const HEADER_VALUE = {
	inHeader: true,
	message: false,
	keyPosition: true,
} as const;

/** True when `text` holds a credential header or flag pair with a literal value. */
export function hasCredentialPair(text: string): boolean {
	for (const pattern of [INDEXED, TUPLE]) {
		for (const match of text.matchAll(pattern)) {
			if (!CREDENTIAL_HEADER.test(match[1] ?? '')) continue;
			// A list of header names (`redact: ['authorization', 'cookie']`), not a pair.
			if (CREDENTIAL_HEADER.test(match[3] ?? '')) continue;
			const context = { ...HEADER_VALUE, template: match[2] === '`' };
			if (!isHarmlessLiteral(match[3] ?? '', context)) return true;
		}
	}
	for (const match of text.matchAll(COMPUTED)) {
		if (!namesCredential(match[1] ?? '')) continue;
		const context = { ...HEADER_VALUE, template: match[2] === '`' };
		if (!isHarmlessLiteral(match[3] ?? '', context)) return true;
	}
	for (const match of text.matchAll(ARRAY_FLAG)) {
		const value = match[3] ?? '';
		if (isPlaceholder(value)) continue;
		const db = DB_CLIENT.test(lineBefore(text, match.index));
		if (match[1] === '-p' && PORT.test(value) && !db) continue;
		return true;
	}
	for (const match of text.matchAll(ATTACHED_P)) {
		if (DB_CLIENT.test(lineBefore(text, match.index))) return true;
	}
	return false;
}
