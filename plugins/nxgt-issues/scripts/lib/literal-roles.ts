/**
 * The role of each quoted literal inside a function value, found in one pass
 * over the code (a bracket stack, no rescans), so a long or unclosed body
 * costs time linear in its length.
 *
 * - `compare` (and `compare-member`, `compare-scope`; see `operands.ts`, where
 *   a credential operand makes it `strict`): an operand of `===`, `!==`, `==`, `!=`, the argument or
 *   receiver of a test (`includes`, `startsWith`, `endsWith`, `indexOf`,
 *   `has`, `Object.is`, `localeCompare`), an element of an array or a `Set`
 *   those tests are called on, or an argument of a callee ending `Equal`,
 *   `Equals` or `Compare` (`constantTimeEqual`). It is checked only when it
 *   looks like a credential (`comparesSecret`): `method === 'GET'` passes.
 * - `strict`: an operand of `&&`, `||`, `??` or `?`, a returned value (right
 *   after `=>` or `return`), or an argument of a callback or a credential call
 *   (`cb(null, '…')`, `timingSafeEqual(a, '…')`). It is checked as a value.
 *
 * A literal handed to any other call is a key (`c.req.header('x-gateway')`)
 * and has no role. Quotes are tracked, so `=>` inside a string is not an arrow.
 */

import {
	classify,
	type Operand,
	pathAtEnd,
	pathAtStart,
	type Role,
} from './operands';

export type { Role };

const OPEN = '([{';
const CLOSE = ')]}';
const WINDOW = 80;
const CALLBACKS = new Set([
	'cb',
	'callback',
	'done',
	'resolve',
	'timingSafeEqual',
]);
const TEST_WORDS = 'includes|startsWith|endsWith|indexOf|localeCompare';
const RECEIVER_TESTS = new Set([...TEST_WORDS.split('|'), 'has']);
const ARGUMENT_TESTS = new Set(['is', 'equals']);
const TEST_OPEN = /^\s*\??\.\s*\w+\s*\(/;
const COMPARE_CALLEE = /(?:Equals?|Compare)$/;
const EQUALITY_BEFORE = /(?:===|!==|==|!=)$/;
const EQUALITY_AFTER = /^(?:===|!==|==|!=)/;
const STRICT_BEFORE = /(?:&&|\|\||\?\?|\?|=>|\breturn)$/;
const STRICT_AFTER = /^(?:&&|\|\||\?\?)/;
const TEST_AFTER = new RegExp(`^\\??\\.\\s*(?:${TEST_WORDS})\\b`);
const TEST_FOLLOWS = new RegExp(
	`^\\s*\\??\\.\\s*(?:${TEST_WORDS}|has|some)\\b`,
);

/** Walks `code` from `start` outside quotes; `step` gets the character, index and depth. */
export function walk(
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

interface Literal {
	readonly start: number;
	readonly end: number;
	/** The innermost and the next enclosing opener at the literal's start. */
	readonly top?: number | undefined;
	readonly second?: number | undefined;
}

/** The literals of `code` and the matching closer of every opener. */
function scanLiterals(code: string) {
	const literals: Literal[] = [];
	const closeOf = new Map<number, number>();
	const stack: number[] = [];
	let quote = '';
	let begin: Omit<Literal, 'end'> = { start: 0 };
	for (let i = 0; i < code.length; i++) {
		const char = code[i] ?? '';
		if (quote) {
			if (char === '\\') i++;
			else if (char === quote) {
				literals.push({ ...begin, end: i + 1 });
				quote = '';
			}
		} else if (char === "'" || char === '"' || char === '`') {
			quote = char;
			begin = { start: i, top: stack.at(-1), second: stack.at(-2) };
		} else if (OPEN.includes(char)) stack.push(i);
		else if (CLOSE.includes(char)) {
			const open = stack.pop();
			if (open !== undefined) closeOf.set(open, i);
		}
	}
	return { literals, closeOf };
}

type CallKind = 'strict' | 'receiver' | 'arguments';

/** How a literal handed to the call whose `(` is at `open` is judged. */
function callKind(
	code: string,
	open: number,
	isCredentialCall: (name: string) => boolean,
): { kind: CallKind; name: string } | undefined {
	const head = code.slice(Math.max(0, open - WINDOW), open);
	const name = /([A-Za-z_$][\w$]*)\s*$/.exec(head)?.[1];
	if (name === undefined) return undefined;
	if (CALLBACKS.has(name) || isCredentialCall(name)) {
		return { kind: 'strict', name };
	}
	if (RECEIVER_TESTS.has(name)) return { kind: 'receiver', name };
	if (ARGUMENT_TESTS.has(name) || COMPARE_CALLEE.test(name)) {
		return { kind: 'arguments', name };
	}
	return undefined;
}

/** The receiver of the method call whose `(` is at `open`: `claims.scope` in `claims.scope?.includes(`. */
function receiverOf(code: string, open: number): Operand {
	const head = code.slice(Math.max(0, open - WINDOW), open);
	return pathAtEnd(
		head.replace(/[A-Za-z_$][\w$]*\s*$/, '').replace(/\??\.\s*$/, ''),
	);
}

/** The other arguments of the call whose `(` is at `open`, around the literal. */
function argumentsAround(
	code: string,
	open: number,
	start: number,
	end: number,
) {
	const left = code.slice(open + 1, start).replace(/,\s*$/, '');
	const right = code.slice(end, end + WINDOW).replace(/^\s*,/, '');
	return [pathAtEnd(left.slice(left.lastIndexOf(',') + 1)), pathAtStart(right)];
}

/** The role of each value literal of `code`, by the index of its opening quote. */
export function valueRoles(
	code: string,
	isCredentialCall: (name: string) => boolean,
	credentialParams: ReadonlySet<string> = new Set(),
): Map<number, Role> {
	const { literals, closeOf } = scanLiterals(code);
	const roles = new Map<number, Role>();
	/** The argument of the test called right after the bracket pair opened at `open`. */
	const argumentAfter = (open: number | undefined): Operand | 'none' => {
		const close = open === undefined ? undefined : closeOf.get(open);
		if (close === undefined) return 'none';
		const rest = code.slice(close + 1, close + 1 + WINDOW);
		if (!TEST_FOLLOWS.test(rest)) return 'none';
		return pathAtStart(rest.replace(TEST_OPEN, ''));
	};
	for (const { start, end, top, second } of literals) {
		const before = code.slice(Math.max(0, start - WINDOW), start).trimEnd();
		const after = code.slice(end, end + WINDOW).trimStart();
		let operands: Operand[] | undefined;
		let role: Role | undefined;
		if (EQUALITY_BEFORE.test(before)) {
			operands = [pathAtEnd(before.replace(EQUALITY_BEFORE, ''))];
		} else if (EQUALITY_AFTER.test(after)) {
			operands = [pathAtStart(after.replace(EQUALITY_AFTER, ''))];
		} else if (TEST_AFTER.test(after)) {
			operands = [pathAtStart(after.replace(TEST_OPEN, ''))];
		} else if (STRICT_BEFORE.test(before) || STRICT_AFTER.test(after)) {
			role = 'strict';
		} else if (/[(,[]$/.test(before) && top !== undefined) {
			if (code[top] === '(') {
				const call = callKind(code, top, isCredentialCall);
				if (call?.kind === 'strict') role = 'strict';
				else if (call?.kind === 'receiver') operands = [receiverOf(code, top)];
				else if (call) operands = argumentsAround(code, top, start, end);
			} else if (code[top] === '[') {
				const tested = [argumentAfter(top), argumentAfter(second)];
				const hit = tested.findIndex((arg) => arg !== 'none');
				if (hit !== -1) {
					const arg = tested[hit];
					operands = [arg === 'none' ? undefined : arg];
				}
			}
		}
		if (operands) role = classify(operands, credentialParams);
		if (role) roles.set(start, role);
	}
	return roles;
}
