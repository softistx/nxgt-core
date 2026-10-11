/**
 * Credentials written as a pair rather than a call or an assignment: a header
 * set by index (`headers['authorization'] = 'Basic x'`), a header tuple
 * (`new Headers([['authorization', 'Basic x']])`) and a flag followed by its
 * value in an argument array (`['--password', 'hunter2']`, `['-W', 'x']`,
 * `['-p', 'x']`, `['-a', 'x']`; a port such as `['-p', '8080:80']` passes).
 * A header value obeys the header rule (only a placeholder or a template of
 * code passes); a flag value refuses unless it is a placeholder.
 */

import { CREDENTIAL_HEADER } from './auth-calls';
import { isPlaceholder } from './code-values';
import { isHarmlessLiteral } from './literals';

/** `x['authorization'] = 'value'`. */
const INDEXED = /\[\s*["']([\w-]+)["']\s*\]\s*=\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
/** `['authorization', 'value']`. */
const TUPLE = /\[\s*["']([\w-]+)["']\s*,\s*(["'`])((?:\\.|(?!\2).)*)\2\s*\]/g;
/** `'--password', 'value'` side by side in an array. */
const ARRAY_FLAG =
	/["'](--(?:password|passwd|pwd|token|secret|api-?key|pass)|-[Wpa])["']\s*,\s*(["'`])((?:\\.|(?!\2).)*)\2/g;
/** A port or a port mapping: `-p 8080:80` for docker and ssh. */
const PORT = /^\d+(?::\d+)*$/;

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
			const context = { ...HEADER_VALUE, template: match[2] === '`' };
			if (!isHarmlessLiteral(match[3] ?? '', context)) return true;
		}
	}
	for (const match of text.matchAll(ARRAY_FLAG)) {
		const value = match[3] ?? '';
		if (!isPlaceholder(value) && !PORT.test(value)) return true;
	}
	return false;
}
