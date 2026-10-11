/**
 * TypeScript's compiler API, loaded when a codegen helper runs rather than
 * when the package is imported.
 *
 * TypeScript 7's npm package ships no compiler API: its default export holds
 * `version` and `versionMajorMinor` and nothing else. `openapi-typescript`
 * and `@hey-api/openapi-ts` read the API at module scope, so where
 * `typescript` resolves to 7 merely importing either throws. Nothing in this
 * package touches them, or `typescript`, until a helper is called, so the
 * package imports under 6 and 7 alike, and a helper that cannot run says why.
 */
import type { tsNullable } from 'openapi-typescript';

/** `ts.TypeNode` where `typescript` is 6, and `any` where it is 7. */
type TypeNode = ReturnType<typeof tsNullable>;

/**
 * The part of the compiler API this package calls itself. Typed here rather
 * than as `typeof import('typescript')`, whose types under 7 declare no
 * compiler API, so this source typechecks under 6 and 7 alike.
 */
export interface CompilerApi {
	readonly version: string;
	readonly factory: {
		createTypeReferenceNode(typeName: string): TypeNode;
	};
}

/** The `typescript` this package resolves, and its API when it has one. */
async function resolveTypeScript(): Promise<{
	api?: CompilerApi;
	version: string;
}> {
	let module: { default?: unknown };
	try {
		module = await import('typescript');
	} catch {
		return { version: 'none: typescript is not installed' };
	}
	const api = (module.default ?? module) as {
		version?: unknown;
		factory?: { createTypeReferenceNode?: unknown };
	};
	const version = `TypeScript ${String(api.version ?? 'of unknown version')}`;
	return typeof api.factory?.createTypeReferenceNode === 'function'
		? { api: api as CompilerApi, version }
		: { version };
}

function missingCompilerApi(
	helper: string,
	found: string,
	cause?: unknown,
): Error {
	return new Error(
		`${helper} needs TypeScript's compiler API, which TypeScript 7 does not ship, ` +
			`and \`typescript\` resolves to ${found}. ` +
			'openapi-typescript and @hey-api/openapi-ts need it too. ' +
			'Run the codegen where `typescript` resolves to 6: install typescript@^6.0.3 there.',
		cause === undefined ? undefined : { cause },
	);
}

/** The compiler API, or an error naming `helper` and the fix. */
export async function compilerApi(helper: string): Promise<CompilerApi> {
	const { api, version } = await resolveTypeScript();
	if (api === undefined) throw missingCompilerApi(helper, version);
	return api;
}

/**
 * Loads a tool that reads the compiler API when it is imported. When the
 * import fails because there is no compiler API, the error says so and names
 * `helper`; any other failure is rethrown as it is.
 */
export async function importTool<T>(
	helper: string,
	load: () => Promise<T>,
): Promise<T> {
	try {
		return await load();
	} catch (error) {
		const { api, version } = await resolveTypeScript();
		if (api !== undefined) throw error;
		throw missingCompilerApi(helper, version, error);
	}
}
