/**
 * Literals inside function values (`trustedGateway: (c) => …`). A function is
 * code, but the values it compares or returns are not (`literal-roles.ts`
 * says which literal is a compared operand, a returned value or a key). A
 * function value is checked under a credential key (`trustedGateway`,
 * `verify*`, `secret`, `password`, `token`, `apiKey`, `getToken`), as a method
 * (`trustedGateway(c) { … }`) and as a constant whose name is credential-ish
 * or `isX`/`check*`/`verify*` (`const isGateway = (c) => …`).
 */

import { valueRoles, walk } from './literal-roles';
import { isHarmlessLiteral } from './literals';
import { passesAsCompared } from './operands';

const QUOTED = /(["'`])((?:\\.|(?!\1).)*)\1/g;
const SEPARATORS = ',;';

/** The end of the value that starts at `start`: a `,` or `;` at its depth or its closing bracket. */
function valueEnd(code: string, start: number): number {
	let end = code.length;
	walk(code, start, (char, i, depth) => {
		if (depth < 0 || (depth === 0 && SEPARATORS.includes(char))) {
			end = i;
			return true;
		}
		return undefined;
	});
	return end;
}

/** The spans of `code` that are function values, from `=>` or `function` to their end, in one pass. */
export function functionRegions(code: string): Array<[number, number]> {
	const regions: Array<[number, number]> = [];
	const open: Array<{ depth: number; slot: number }> = [];
	const word = /[\w$]/;
	walk(code, 0, (char, i, depth) => {
		for (let top = open.at(-1); top; top = open.at(-1)) {
			const ended =
				top.depth > depth || (SEPARATORS.includes(char) && top.depth === depth);
			if (!ended) break;
			const region = regions[top.slot];
			if (region) region[1] = i;
			open.pop();
		}
		const arrow = char === '=' && code[i + 1] === '>';
		const keyword =
			char === 'f' &&
			code.startsWith('function', i) &&
			!word.test(code[i - 1] ?? '') &&
			!word.test(code[i + 8] ?? '');
		if (arrow || keyword) {
			open.push({ depth, slot: regions.length });
			regions.push([i, code.length]);
		}
		return undefined;
	});
	return regions;
}

const KEYS = 'trustedGateway|verify\\w*|secret|password|token|apiKey|getToken';
/** Keys of validators: only a credential parameter compared with a literal counts (`validate: (u, p) => p === 'x'`). */
const VALIDATORS = 'authorize\\w*|validate\\w*';
const FUNCTION_START = '(?=async\\b|\\(|[A-Za-z_$][\\w$]*\\s*=>|function\\b)';
/** Keys whose function value guards or yields a credential. */
const CREDENTIAL_KEY = new RegExp(
	`\\b(${KEYS})\\s*:\\s*${FUNCTION_START}`,
	'g',
);
const VALIDATOR_KEY = new RegExp(
	`\\b(${VALIDATORS})\\s*:\\s*${FUNCTION_START}`,
	'g',
);
/** `const isGateway = (c) => …`: the name is checked by `CREDENTIAL_NAME`. */
const CONST_FUNCTION = new RegExp(
	`\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=\\n]+)?=\\s*${FUNCTION_START}`,
	'g',
);
/** `trustedGateway(c) {`, `async isGateway(c) {`, `function checkCaller(c) {`. */
const METHOD = new RegExp(
	`\\b(${KEYS}|is[A-Z]\\w*|check\\w*)\\s*\\(([^()]*)\\)\\s*(?::[^{;]+)?\\{`,
	'g',
);
const CREDENTIAL_NAME =
	/gateway|secret|token|passw|api_?key|auth(?!or)|cookie|session|^check|^verify/i;
const IS_NAME = /^is[A-Z]/;
const VALUE = {
	template: false,
	inHeader: false,
	message: false,
	keyPosition: false,
};

interface FunctionStart {
	readonly start: number;
	/** The second parameter of a `verify*` callback: the password of `verifyUser(user, password)`. */
	readonly credentialParams: ReadonlySet<string>;
	/** A validator: only literals compared with a credential count. */
	readonly compareOnly?: boolean;
}

const PARAMETERS = /^\s*(?:async\s+)?(?:function\b[^(]*)?\(([^()]*)\)/;

/** The credential parameters of the function named `name`, whose parameter list is `params`. */
function credentialParamsOf(name: string, params: string | undefined) {
	const second = params?.split(',')[1];
	const id = /^\s*(?:\.\.\.)?([A-Za-z_$][\w$]*)/.exec(second ?? '')?.[1];
	return new Set(
		id !== undefined && /^(?:verify|authorize|validate)/.test(name) ? [id] : [],
	);
}

/** Where each checked function value starts, in order. */
function functionStarts(text: string): FunctionStart[] {
	const starts: FunctionStart[] = [];
	const add = (name: string, at: number, params?: string) => {
		const own = params ?? PARAMETERS.exec(text.slice(at, at + 300))?.[1];
		starts.push({ start: at, credentialParams: credentialParamsOf(name, own) });
	};
	for (const match of text.matchAll(CREDENTIAL_KEY)) {
		add(match[1] ?? '', match.index + match[0].length);
	}
	for (const match of text.matchAll(VALIDATOR_KEY)) {
		const at = match.index + match[0].length;
		const own = PARAMETERS.exec(text.slice(at, at + 300))?.[1];
		starts.push({
			start: at,
			credentialParams: credentialParamsOf(match[1] ?? '', own),
			compareOnly: true,
		});
	}
	for (const match of text.matchAll(CONST_FUNCTION)) {
		const name = match[1] ?? '';
		if (CREDENTIAL_NAME.test(name) || IS_NAME.test(name)) {
			add(name, match.index + match[0].length);
		}
	}
	for (const match of text.matchAll(METHOD)) {
		add(match[1] ?? '', match.index + match[0].length - 1, match[2] ?? '');
	}
	return starts.sort((a, b) => a.start - b.start);
}

/** A function value under a credential name that compares or returns a literal secret. */
export function credentialKeyHoldsSecret(
	text: string,
	isCredentialCall: (name: string) => boolean,
): boolean {
	let covered = 0;
	for (const { start, credentialParams, compareOnly } of functionStarts(text)) {
		if (start < covered) continue; // inside a value already checked
		covered = valueEnd(text, start);
		const code = text.slice(start, covered);
		const roles = valueRoles(code, isCredentialCall, credentialParams);
		for (const literal of code.matchAll(QUOTED)) {
			const role = roles.get(literal.index);
			if (!role || (compareOnly && role !== 'credential')) continue;
			const body = literal[2] ?? '';
			const context = { ...VALUE, template: literal[1] === '`' };
			if (isHarmlessLiteral(body, context)) continue;
			if (passesAsCompared(role, body)) continue;
			return true;
		}
	}
	return false;
}
