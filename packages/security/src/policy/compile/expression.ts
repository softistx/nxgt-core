import { compileFunction } from '../evaluation.utils';
import type { RuleEntry } from '../rules.schema';
import type { CompiledExpression } from './types';

/**
 * Compiles `expression.value` strings into Functions, memoized per
 * `compilePolicy()` call. The cache key includes the scope-key shape (not
 * just the expression text) so identical expression text used under REST's
 * `['claims','req']` scope and GraphQL's `['claims','args','source','info']`
 * scope never collides and binds the wrong positional argument to the wrong
 * parameter.
 */
export function createExpressionCompiler() {
	const cache = new Map<string, (...args: unknown[]) => unknown>();

	return (value: string, scopeKeys: readonly string[]) => {
		const key = `${scopeKeys.join(',')}::${value}`;
		let fn = cache.get(key);
		if (!fn) {
			fn = compileFunction<(...args: unknown[]) => unknown>(
				`return (${value});`,
				...scopeKeys,
			);
			cache.set(key, fn);
		}
		return fn;
	};
}

export function compileExpression(
	expression: RuleEntry['expression'],
	compile: ReturnType<typeof createExpressionCompiler>,
	scopeKeys: readonly string[],
): CompiledExpression | undefined {
	if (!expression) return undefined;
	return {
		fn: compile(expression.value, scopeKeys),
		message: expression.message ?? 'Expression check failed',
	};
}

export type Compile = ReturnType<typeof createExpressionCompiler>;
