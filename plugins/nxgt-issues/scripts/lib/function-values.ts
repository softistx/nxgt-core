/**
 * Literals inside function values (`trustedGateway: (c) => …`). A function is
 * code, but the values it compares or returns are not: a literal that is an
 * operand of `===`, `!==`, `==`, `!=`, `&&`, `||`, `??` or `?`, that is
 * returned (right after `=>` or `return`), or that is an argument of a
 * credential call or a callback (`cb(null, '…')`, `timingSafeEqual(a, '…')`)
 * is checked as a value. A literal handed to any other call is a key
 * (`c.req.header('x-gateway')`) and is skipped. Quotes are tracked, so `=>`
 * inside a string is not an arrow.
 */

import { isHarmlessLiteral } from './literals';

const OPEN = '([{';
const CLOSE = ')]}';
const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const CALLBACKS = new Set([
	'cb',
	'callback',
	'done',
	'resolve',
	'timingSafeEqual',
]);
const OPERATOR_BEFORE = /(?:===|!==|==|!=|&&|\|\||\?\?|\?|=>|\breturn)$/;
const OPERATOR_AFTER = /^(?:===|!==|==|!=|&&|\|\||\?\?)/;

/** Walks `code` from `start` outside quotes; `step` gets the character, index and depth. */
function walk(
	code: string,
	start: number,
	step: (char: string, index: number, depth: number) => boolean | undefined,
): void {
	let depth = 0;
	let quote = '';
	for (let i = start; i < code.length; i++) {
		const char = code[i] ?? '';
		if (quote) {
			if (char === '\\') i++;
			else if (char === quote) quote = '';
			continue;
		}
		if (char === "'" || char === '"' || char === '`') quote = char;
		else if (OPEN.includes(char)) depth++;
		else if (CLOSE.includes(char)) depth--;
		if (step(char, i, depth)) return;
	}
}

/** The end of the value that starts at `start`: a `,` at its depth or its closing bracket. */
function valueEnd(code: string, start: number): number {
	let end = code.length;
	walk(code, start, (char, i, depth) => {
		if (depth < 0 || (depth === 0 && char === ',')) {
			end = i;
			return true;
		}
		return undefined;
	});
	return end;
}

/** The spans of `code` that are function values, from `=>` or `function` to their end. */
export function functionRegions(code: string): Array<[number, number]> {
	const regions: Array<[number, number]> = [];
	walk(code, 0, (char, i) => {
		const arrow = char === '=' && code[i + 1] === '>';
		const keyword =
			char === 'f' &&
			/^function\b/.test(code.slice(i)) &&
			!/[\w$]$/.test(code.slice(0, i));
		if (arrow || keyword) regions.push([i, valueEnd(code, i)]);
		return undefined;
	});
	return regions;
}

/** The name of the call whose parentheses enclose `index`, if any. */
function enclosingCall(code: string, index: number): string | undefined {
	const stack: number[] = [];
	walk(code, 0, (char, i) => {
		if (i >= index) return true;
		if (OPEN.includes(char)) stack.push(i);
		else if (CLOSE.includes(char)) stack.pop();
		return undefined;
	});
	const open = stack.at(-1);
	if (open === undefined || code[open] !== '(') return undefined;
	return /([A-Za-z_$][\w$]*)\s*$/.exec(code.slice(0, open))?.[1];
}

/** Whether the literal at `start..end` of `code` is a value, not a key. */
export function isValueLiteral(
	code: string,
	start: number,
	end: number,
	isCredentialCall: (name: string) => boolean,
): boolean {
	const before = code.slice(0, start).trimEnd();
	if (OPERATOR_BEFORE.test(before)) return true;
	if (OPERATOR_AFTER.test(code.slice(end).trimStart())) return true;
	if (!/[(,[]$/.test(before)) return false;
	const call = enclosingCall(code, start);
	return call !== undefined && (CALLBACKS.has(call) || isCredentialCall(call));
}

/** Keys whose function value guards or yields a credential. */
const CREDENTIAL_KEY =
	/\b(?:trustedGateway|verify\w*|secret|password|token|apiKey|getToken)\s*:\s*(?=async\b|\(|[A-Za-z_$][\w$]*\s*=>|function\b)/g;
const VALUE = {
	template: false,
	inHeader: false,
	message: false,
	keyPosition: false,
};

/** A function value under a credential key that compares or returns a literal secret. */
export function credentialKeyHoldsSecret(
	text: string,
	isCredentialCall: (name: string) => boolean,
): boolean {
	for (const match of text.matchAll(CREDENTIAL_KEY)) {
		const start = match.index + match[0].length;
		const code = text.slice(start, valueEnd(text, start));
		for (const literal of code.matchAll(QUOTED)) {
			const end = literal.index + literal[0].length;
			if (!isValueLiteral(code, literal.index, end, isCredentialCall)) continue;
			const context = { ...VALUE, template: literal[1] === '`' };
			if (!isHarmlessLiteral(literal[2] ?? '', context)) return true;
		}
	}
	return false;
}
